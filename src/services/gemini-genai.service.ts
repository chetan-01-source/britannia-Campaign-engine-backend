import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ImageBrandingRequest, ImageBrandingResponse, ImagePromptContext } from '../types/image-branding.types';
import { ProductModel } from '../models/product.model';
import { BrandingModel } from '../models/branding.model';
import { generateGeminiContent } from '../config/gemini';
import { uploadImageToS3, isS3Available } from '../utils/s3';
import { IMAGE_BRANDING_PROMPT_TEMPLATE } from '../templates/image-branding-prompts';

export class GeminiGenImageService {
  private static instance: GeminiGenImageService;
  private apiKey: string;
  private apiUrl: string = 'https://api.geminigen.ai/uapi/v1/generate_image';
  private statusApiUrl: string = 'https://api.geminigen.ai/uapi/v1/history';
  private outputDir: string;

  private constructor() {
    this.apiKey = process.env.GENGEMINI_API_KEY || '';
    this.outputDir = path.join(__dirname, '../../generated-images');
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log('✅ Created generated-images directory:', this.outputDir);
    }

    if (!this.apiKey) {
      console.warn('⚠️ GENGEMINI_API_KEY not found in environment variables');
    } else if (this.apiKey.startsWith('tts-')) {
      console.error('❌ GENGEMINI_API_KEY appears to be for text-to-speech service, not image generation!');
      console.error('❌ Please check if you have the correct API key for GeminiGen image generation');
    } else {
      console.log('✅ GeminiGen API key configured');
    }
  }

  public static getInstance(): GeminiGenImageService {
    if (!GeminiGenImageService.instance) {
      GeminiGenImageService.instance = new GeminiGenImageService();
    }
    return GeminiGenImageService.instance;
  }

  /**
   * Generate branding image using GeminiGen API
   */
  public async generateBrandingImage(request: ImageBrandingRequest): Promise<ImageBrandingResponse> {
    try {
      console.log('🎨 Starting GeminiGen image generation for:', request.productName);
      console.log('📋 Request details:', {
        productName: request.productName,
        platform: request.platform,
        tone: request.tone,
        style: request.style,
        flavor: request.flavor
      });

      if (!this.apiKey) {
        throw new Error('GeminiGen API key not configured');
      }

      // Get product data from database
      const productData = await this.getProductData(request.productName);
      if (!productData) {
        throw new Error(`Product "${request.productName}" not found`);
      }

      console.log('✅ Found product:', productData.name);

      // Step 2: Generate branding caption and tagline
      console.log('🤖 Generating branding content...');
      let brandingContent;
      try {
        brandingContent = await this.generateBrandingContent(productData, request);
        console.log('✅ Branding content generated:', brandingContent);
      } catch (error) {
        console.error('❌ Branding content generation failed, using fallback:', error);
        brandingContent = this.getFallbackBrandingContent(productData, request);
      }

      // Step 3: Build optimized prompt for GeminiGen branding image
      const prompt = this.buildBrandingPrompt({
        productName: productData.name,
        productDescription: productData.description,
        productCategory: productData.category,
        platform: request.platform,
        tone: request.tone,
        style: request.style || 'minimalist',
        flavor: request.flavor,
        caption: brandingContent.caption,
        tagline: brandingContent.tagline
      });

      console.log('📝 Generated prompt:', prompt.substring(0, 200) + '...');
      console.log('🔑 API Key format:', this.apiKey ? 
        `${this.apiKey.substring(0, 6)}...${this.apiKey.substring(this.apiKey.length - 4)}` : 
        'NOT SET');

      // Generate image using GeminiGen API
      const imageResult = await this.generateImage(prompt, request);
        console.log('✅ Image generated, URL:', imageResult);
      
      // Download and save the image locally
      const savedImage = await this.downloadAndSaveImage(imageResult.imageUrl, prompt);

      return {
        success: true,
        data: {
          productName: request.productName,
          platform: request.platform,
          tone: request.tone,
          style: request.style || 'minimalist',
          generatedImage: savedImage.base64Image,
          imagePrompt: prompt,
          referenceImages: [],
          productImages: [],
          metadata: {
            format: 'base64_png',
            generatedAt: new Date().toISOString(),
            dimensions: '1024x1024',
            geminiGenRequestId: imageResult.requestId,
            s3Key: savedImage.s3Key,
            localPath: savedImage.filepath
          }
        },
        savedFilename: savedImage.filename,
        viewUrl: savedImage.s3Url || `http://localhost:3000/api/image-branding/view/${savedImage.filename}`
      };

    } catch (error) {
      console.error('❌ GeminiGen image generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate image using GeminiGen API
   */
  private async generateImage(prompt: string, request: ImageBrandingRequest): Promise<{ imageUrl: string; requestId: string }> {
    try {
      console.log('🚀 Calling GeminiGen API...');

      // Create FormData for multipart/form-data request
      const FormData = require('form-data');
      const formData = new FormData();
      
      const aspectRatio = this.getAspectRatio(request.platform);
      const mappedStyle = this.mapStyleToGeminiGen(request.style || 'minimalist');
      
      formData.append('prompt', prompt);
      formData.append('model', 'imagen-pro');
      formData.append('aspect_ratio', aspectRatio);
      formData.append('style', mappedStyle);

      console.log('📤 GeminiGen request details:', {
        promptLength: prompt.length,
        promptStart: prompt.substring(0, 200) + '...',
        model: 'imagen-pro',
        aspect_ratio: aspectRatio,
        style: mappedStyle,
        requestPlatform: request.platform,
        requestStyle: request.style
      });

      // Step 1: Create the generation task
      let response;
      try {
        response = await axios.post(this.apiUrl, formData, {
          headers: {
            ...formData.getHeaders(),
            'x-api-key': this.apiKey
          },
          timeout: 60000 // 60 seconds timeout
        });
      } catch (error) {
        // If the request fails with specific parameters, try with basic fallback
        if (axios.isAxiosError(error) && error.response?.status === 500) {
          console.log('⚠️ First request failed, trying with fallback parameters...');
          
          const fallbackFormData = new FormData();
          fallbackFormData.append('prompt', prompt);
          fallbackFormData.append('model', 'imagen-pro');
          fallbackFormData.append('aspect_ratio', '1:1'); // Use safe square format
          fallbackFormData.append('style', 'Photorealistic');
          
          console.log('📤 Fallback request:', {
            model: 'imagen-pro',
            aspect_ratio: '1:1',
            style: 'Photorealistic'
          });
          
          response = await axios.post(this.apiUrl, fallbackFormData, {
            headers: {
              ...fallbackFormData.getHeaders(),
              'x-api-key': this.apiKey
            },
            timeout: 60000
          });
          
          console.log('✅ Fallback request succeeded');
        } else {
          throw error;
        }
      }

      console.log('📥 GeminiGen response status:', response);
      console.log('📥 GeminiGen response data:', JSON.stringify(response.data, null, 2));
      
      if (response.data && response.data.uuid) {
        const taskId = response.data.uuid;
        console.log('🎯 Task created with UUID:', taskId);
        
        // Step 2: Poll for completion
        const result = await this.pollTaskCompletion(taskId);
        
        if (result && result.imageUrl) {
          console.log('✅ Image generated successfully:', result.imageUrl);
          return { imageUrl: result.imageUrl, requestId: taskId };
        } else {
          throw new Error('Task completed but no image URL found');
        }
      } else {
        throw new Error('Invalid response from GeminiGen API - no UUID found');
      }

    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ GeminiGen API Error Details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url
        });
        
        const errorMsg = error.response?.data?.message || 
                        error.response?.data?.error || 
                        error.response?.statusText || 
                        error.message;
        
        throw new Error(`GeminiGen API failed: ${errorMsg}`);
      }
      console.error('❌ Non-Axios error in generateImage:', error);
      throw error;
    }
  }

  /**
   * Poll GeminiGen task until completion - Using 38-second optimized strategy
   * Based on user feedback: wait 38 seconds then check, reducing API calls significantly
   */
  private async pollTaskCompletion(taskId: string): Promise<{ imageUrl: string } | null> {
    console.log('🔄 Starting 38-second optimized polling for task:', taskId);
    
    const statusUrl = `${this.statusApiUrl}/${taskId}`;
    
    // New strategy: 38-second intervals with fewer total requests
    // Based on observation that images typically complete around 38 seconds
    const pollingSchedule = [
      { attempt: 1, delay: 0 },       // Immediate first check
      { attempt: 2, delay: 38000 },   // 38s - Primary check point
      { attempt: 3, delay: 25000 },   // +25s (63s total) - Extended wait
      { attempt: 4, delay: 30000 },   // +30s (93s total) - Final attempt
    ];
    
    let totalTime = 0;
    
    for (const { attempt, delay } of pollingSchedule) {
      try {
        if (delay > 0) {
          console.log(`⏳ Waiting ${delay/1000}s before next poll (total elapsed: ${Math.floor(totalTime/1000)}s)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          totalTime += delay;
        }
        
        console.log(`🔍 Polling attempt ${attempt}/4 (after ${Math.floor(totalTime/1000)}s)...`);
        
        const response = await axios.get(statusUrl, {
          headers: {
            'x-api-key': this.apiKey
          },
          timeout: 10000
        });
        
        console.log('📊 Task status response:', JSON.stringify(response.data, null, 2));
        
        const task = response.data;
        const status = task.status;
        
        if (status === 2) { // Status 2 means completed in GeminiGen
          if (task.generated_image && task.generated_image.length > 0) {
            const imageUrl = task.generated_image[0].image_url;
            console.log(`🎉 Task completed in ${attempt} attempts (${Math.floor(totalTime/1000)}s)! Image URL:`, imageUrl);
            return { imageUrl };
          } else {
            throw new Error('Task completed but no generated images found');
          }
        } else if (status === 3 || status === 4) { // Error/Failed status
          throw new Error(`Task failed with status: ${status} - ${task.error_message || 'Unknown error'}`);
        } else if (status === 0 || status === 1) { // Pending/Processing
          const statusText = status === 0 ? 'PENDING' : 'PROCESSING';
          console.log(`⏳ Task status: ${statusText}${attempt < pollingSchedule.length ? ', continuing to next interval...' : ', final attempt reached'}`);
          
          // Continue to next attempt if not the last one
          if (attempt >= pollingSchedule.length) {
            throw new Error(`Task still ${statusText} after ${Math.floor(totalTime/1000)}s - maximum wait time exceeded`);
          }
          continue;
        } else {
          console.log(`❓ Unknown status: ${status}${attempt < pollingSchedule.length ? ', continuing...' : ', giving up'}`);
          if (attempt >= pollingSchedule.length) {
            throw new Error(`Task has unknown status ${status} after ${Math.floor(totalTime/1000)}s`);
          }
          continue;
        }
        
      } catch (error) {
        if (attempt === pollingSchedule.length) {
          throw new Error(`Polling failed after ${pollingSchedule.length} attempts (${Math.floor(totalTime/1000)}s total): ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        console.log(`⚠️ Polling attempt ${attempt} failed, continuing to next interval:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }
    
    throw new Error(`Task did not complete within ${Math.floor(totalTime/1000)} seconds (${pollingSchedule.length} attempts)`);
  }

  /**
   * Download image from GeminiGen, save locally, and upload to S3
   */
  private async downloadAndSaveImage(imageUrl: string, prompt: string): Promise<{ 
    filename: string; 
    filepath: string; 
    base64Image: string;
    s3Url?: string;
    s3Key?: string;
  }> {
    try {
      console.log('📥 Downloading image from GeminiGen...');

      // Download the image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000
      });

      const imageBuffer = Buffer.from(response.data);
      
      // Create filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const promptSlug = prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 30);
      
      const filename = `geminigen_${timestamp}_${promptSlug}.png`;
      const filepath = path.join(this.outputDir, filename);
      
      // Save image to file locally
      fs.writeFileSync(filepath, imageBuffer);
      
      // Convert to base64 for response
      const base64Image = imageBuffer.toString('base64');
      
      console.log('💾 Image saved locally to:', filepath);
      console.log('📊 Image size:', imageBuffer.length, 'bytes');

      // Upload to S3 if available
      let s3Url: string | undefined;
      let s3Key: string | undefined;

      if (isS3Available()) {
        try {
          // Create S3 key with namespace
          s3Key = `images/branding/${filename}`;
          
          console.log('☁️  Uploading image to S3...');
          const s3Result = await uploadImageToS3(s3Key, imageBuffer, 'image/png');
          s3Url = s3Result.publicUrl;
          
          console.log('✅ Image uploaded to S3:', s3Url);
        } catch (s3Error) {
          console.error('❌ S3 upload failed, falling back to local storage:', s3Error);
        }
      } else {
        console.warn('⚠️  S3 not configured, using local storage only');
      }

      const viewUrl = s3Url || `http://localhost:3000/api/image-branding/view/${filename}`;
      console.log('🌐 View URL:', viewUrl);

      return {
        filename,
        filepath,
        base64Image,
        s3Url,
        s3Key
      };

    } catch (error) {
      console.error('❌ Error downloading/saving image:', error);
      throw new Error(`Failed to download image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get product data from database
   */
  private async getProductData(productName: string) {
    try {
      console.log('🔍 Searching for product:', productName);
      
      // First try exact match
      const product = await ProductModel.findOne({
        $and: [
          { isActive: true },
          {
            $or: [
              { name: new RegExp(productName, 'i') },
              { name: { $regex: productName.replace(/\s+/g, '.*'), $options: 'i' } }
            ]
          }
        ]
      }).lean();

      if (product) {
        return product;
      }

      // Fallback to broader search
      const broadSearch = await ProductModel.findOne({
        $and: [
          { isActive: true },
          {
            $or: [
              { name: { $regex: productName.split(' ')[0], $options: 'i' } },
              { category: { $regex: productName, $options: 'i' } }
            ]
          }
        ]
      }).lean();

      return broadSearch;
    } catch (error) {
      console.error('❌ Error fetching product data:', error);
      throw error;
    }
  }

  /**
   * Get aspect ratio based on platform for GeminiGen API
   */
  private getAspectRatio(platform: string): string {
    switch (platform.toLowerCase()) {
      case 'instagram':
        return '1:1'; // Square format for Instagram posts
      case 'linkedin':
        return '16:9'; // Widescreen format for LinkedIn professional content
      case 'email':
        return '16:9'; // Widescreen banner format for email headers
      case 'facebook':
        return '16:9'; // Widescreen format for Facebook
      case 'twitter':
        return '16:9'; // Widescreen format for Twitter
      default:
        return '1:1'; // Default to square
    }
  }

  /**
   * Map frontend styles to GeminiGen artistic styles
   */
  private mapStyleToGeminiGen(style: string): string {
    switch (style.toLowerCase()) {
      case 'minimalist':
        return 'Stock Photo'; // Clean, professional, minimal look
      case 'vibrant':
        return 'Dynamic'; // Energetic, colorful, dynamic style
      case 'premium':
        return 'Portrait'; // Sophisticated, high-quality, premium feel
      case 'playful':
        return 'Creative'; // Fun, artistic, playful interpretation
      default:
        return 'Photorealistic'; // Default fallback
    }
  }

  /**
   * Check if FreePik service is available
   */
  public isAvailable(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get saved images list
   */
  public getSavedImages(): { filename: string; created: Date; size: number }[] {
    try {
      if (!fs.existsSync(this.outputDir)) {
        return [];
      }

      const files = fs.readdirSync(this.outputDir)
        .filter(file => file.startsWith('geminigen_') && (file.endsWith('.jpg') || file.endsWith('.png')))
        .map(file => {
          const filepath = path.join(this.outputDir, file);
          const stats = fs.statSync(filepath);
          return {
            filename: file,
            created: stats.birthtime,
            size: stats.size
          };
        })
        .sort((a, b) => b.created.getTime() - a.created.getTime());

      return files;
    } catch (error) {
      console.error('❌ Error getting saved images:', error);
      return [];
    }
  }

  /**
   * Get saved image file path
   */
  public getSavedImagePath(filename: string): string | null {
    const filepath = path.join(this.outputDir, filename);
    return fs.existsSync(filepath) ? filepath : null;
  }

  /**
   * Get service status and info
   */
  public getServiceInfo() {
    return {
      service: 'GeminiGen AI Image Generation',
      apiKeyConfigured: !!this.apiKey,
      outputDirectory: this.outputDir,
      outputDirExists: fs.existsSync(this.outputDir),
      totalSavedImages: this.getSavedImages().length
    };
  }

  /**
   * Generate branding caption and tagline using AI
   */
  private async generateBrandingContent(productData: any, request: ImageBrandingRequest) {
    try {
      console.log('🤖 Generating branding content with AI...');
      
      const toneDescriptions = {
        youth: 'trendy, energetic, fun-loving, social media savvy, modern lifestyle',
        family: 'warm, caring, togetherness, home moments, shared experiences',
        premium: 'sophisticated, elegant, luxury, exclusive, high-end quality',
        health: 'wellness, natural, fresh, nutritious, active lifestyle',
        traditional: 'heritage, authentic, time-tested, classic values',
        professional: 'business-focused, corporate, reliable, efficient, success-oriented'
      };

      const platformStyles = {
        instagram: 'hashtag-friendly, visually striking, engagement-focused',
        linkedin: 'professional, business-oriented, corporate communication',
        email: 'direct, action-oriented, conversion-focused',
        facebook: 'community-focused, shareable, conversational',
        twitter: 'concise, witty, trending, viral potential'
      };

      const prompt = `
Create compelling branding content for Britannia's "${productData.name}".

CRITICAL REQUIREMENTS:
- Product name MUST be used exactly as: "${productData.name}" (NO CHANGES ALLOWED)
- Company name MUST be: "Britannia" (NO OTHER COMPANY NAMES)

Product Details:
- Exact Product Name: ${productData.name}
- Company: Britannia
- Description: ${productData.description || 'Premium biscuit/snack product'}
- Category: ${productData.category || 'Biscuits & Snacks'}
- Flavor: ${request.flavor || 'Classic'}

Branding Requirements:
- Target Tone: ${request.tone} (${toneDescriptions[request.tone as keyof typeof toneDescriptions]})
- Platform: ${request.platform} (${platformStyles[request.platform as keyof typeof platformStyles]})
- Style: ${request.style}

Generate:
1. A compelling tagline (5-8 words max) that captures the essence using EXACT product name "${productData.name}"
2. A engaging caption (20-40 words) for the branding image featuring "Britannia's ${productData.name}"

Make it:
- Brand-aligned with Britannia's heritage
- Tone-appropriate for ${request.tone} audience  
- Platform-optimized for ${request.platform}
- Product-focused on exact name "${productData.name}"
- Company-focused on "Britannia" brand only

IMPORTANT: Use exact product name "${productData.name}" and company name "Britannia" only.

Respond in this JSON format:
{
  "tagline": "Your catchy tagline here",
  "caption": "Your engaging caption here"
}
`;

      const response = await generateGeminiContent(prompt);
      
      // Parse the JSON response
      let brandingContent;
      try {
        // Extract JSON from response if it's wrapped in markdown or other text
        const jsonMatch = response.match(/\{[^}]*\}/s);
        if (jsonMatch) {
          brandingContent = JSON.parse(jsonMatch[0]);
        } else {
          brandingContent = JSON.parse(response);
        }
      } catch (parseError) {
        console.warn('⚠️ Failed to parse AI response as JSON, using fallback');
        brandingContent = this.getFallbackBrandingContent(productData, request);
      }

      console.log('✅ Generated branding content:', brandingContent);
      return brandingContent;
      
    } catch (error) {
      console.error('❌ Error generating branding content:', error);
      return this.getFallbackBrandingContent(productData, request);
    }
  }

  /**
   * Fallback branding content when AI generation fails
   */
  private getFallbackBrandingContent(productData: any, request: ImageBrandingRequest) {
    const productName = productData.name; // Use exact product name
    
    const toneTaglines = {
      youth: `${productName} - Your Vibe!`,
      family: `${productName} - Family Moments`,
      premium: `${productName} - Pure Excellence`,
      health: `${productName} - Naturally Good`,
      traditional: `${productName} - Time Tested`,
      professional: `${productName} - Success Fuel`
    };

    const toneCaptions = {
      youth: `Experience the amazing taste of Britannia's ${productName}! Perfect for your active lifestyle and trending moments.`,
      family: `Bring your family together with the delicious taste of Britannia's ${productName}. Creating memories, one bite at a time.`,
      premium: `Indulge in the sophisticated taste of Britannia's ${productName}. Crafted for those who appreciate the finest quality.`,
      health: `Nourish your body with the wholesome goodness of Britannia's ${productName}. Natural ingredients, authentic taste.`,
      traditional: `Discover the authentic taste of Britannia's ${productName}. A heritage of quality that spans generations.`,
      professional: `Fuel your success with Britannia's ${productName}. The perfect companion for your professional journey.`
    };

    return {
      tagline: toneTaglines[request.tone as keyof typeof toneTaglines] || `${productName} - Britannia`,
      caption: toneCaptions[request.tone as keyof typeof toneCaptions] || `Enjoy the delicious taste of Britannia's ${productName}.`
    };
  }

  /**
   * Build enhanced branding prompt using the image-branding-prompts template with flavor emphasis
   */
  private buildBrandingPrompt(context: {
    productName: string;
    productDescription?: string;
    productCategory?: string;
    platform: string;
    tone: string;
    style: string;
    flavor?: string;
    caption: string;
    tagline: string;
  }): string {
    // Create enhanced ImagePromptContext for the template
    const promptContext: ImagePromptContext = {
      productName: context.productName,
      productDescription: this.enhanceProductDescription(context.productDescription, context.flavor),
      productCategory: context.productCategory,
      productHighlights: this.generateProductHighlights(context.flavor, context.tone),
      platform: context.platform,
      tone: context.tone,
      flavor: context.flavor,
      style: context.style,
      productImages: [], // Can be empty for now
      referenceImages: [] // Can be empty for now
    };

    // Use the template to build the enhanced prompt
    let basePrompt = IMAGE_BRANDING_PROMPT_TEMPLATE.buildImagePrompt(promptContext);
    
    // Add platform-specific enhancements
    basePrompt += this.addPlatformSpecificPromptEnhancements(context.platform, context.style);
    
    // Add flavor-specific visual elements if flavor is provided
    if (context.flavor) {
      basePrompt += this.addFlavorSpecificPromptEnhancements(context.flavor, context.productName);
    }
    
    // Add final quality and brand consistency requirements
    basePrompt += this.addFinalPromptEnhancements(context.productName, context.tagline);
    
    return basePrompt;
  }
  
  /**
   * Enhance product description with flavor information
   */
  private enhanceProductDescription(description?: string, flavor?: string): string {
    let enhanced = description || 'Premium Britannia biscuit product';
    
    if (flavor) {
      enhanced += ` featuring delicious ${flavor.toLowerCase()} flavor`;
    }
    
    return enhanced;
  }
  
  /**
   * Generate product highlights based on flavor and tone
   */
  private generateProductHighlights(flavor?: string, tone?: string): string[] {
    const highlights = ['Premium quality', 'Trusted Britannia brand'];
    
    if (flavor) {
      highlights.push(`Rich ${flavor.toLowerCase()} taste`);
      highlights.push(`Authentic ${flavor.toLowerCase()} flavor`);
    }
    
    if (tone === 'family') {
      highlights.push('Perfect for sharing', 'Family favorite');
    } else if (tone === 'premium') {
      highlights.push('Luxurious experience', 'Premium ingredients');
    } else if (tone === 'youth') {
      highlights.push('Trendy snack', 'Instagram-worthy');
    } else if (tone === 'health') {
      highlights.push('Wholesome goodness', 'Natural ingredients');
    }
    
    return highlights;
  }
  
  /**
   * Add platform-specific prompt enhancements
   */
  private addPlatformSpecificPromptEnhancements(platform: string, style: string): string {
    let enhancement = '\n\n## PLATFORM OPTIMIZATION:\n';
    
    switch (platform.toLowerCase()) {
      case 'instagram':
        enhancement += '- Create scroll-stopping visual appeal for Instagram feed\n';
        enhancement += '- Use vibrant, high-contrast colors that pop on mobile screens\n';
        enhancement += '- Include subtle Instagram-style visual elements\n';
        enhancement += '- Optimize for square format viewing on mobile devices\n';
        break;
      case 'linkedin':
        enhancement += '- Professional, corporate-appropriate aesthetic\n';
        enhancement += '- Clean, business-friendly color palette\n';
        enhancement += '- Sophisticated typography and layout\n';
        enhancement += '- Optimize for professional networking context\n';
        break;
      case 'email':
        enhancement += '- Email-header optimized design\n';
        enhancement += '- Clear, readable text even at smaller sizes\n';
        enhancement += '- Strong visual hierarchy for quick scanning\n';
        enhancement += '- Call-to-action friendly layout\n';
        break;
    }
    
    return enhancement;
  }
  
  /**
   * Add flavor-specific visual enhancements to prompt
   */
  private addFlavorSpecificPromptEnhancements(flavor: string, productName: string): string {
    let enhancement = `\n\n## FLAVOR VISUAL EMPHASIS (${flavor.toUpperCase()}):\n`;
    
    const flavorLower = flavor.toLowerCase();
    
    // Color associations for different flavors
    if (flavorLower.includes('chocolate') || flavorLower.includes('choco')) {
      enhancement += '- Rich brown and golden color palette\n';
      enhancement += '- Warm, indulgent visual atmosphere\n';
      enhancement += '- Chocolate-inspired background elements\n';
    } else if (flavorLower.includes('strawberry') || flavorLower.includes('berry')) {
      enhancement += '- Fresh pink and red color accents\n';
      enhancement += '- Berry-inspired natural elements\n';
      enhancement += '- Vibrant, fruity visual mood\n';
    } else if (flavorLower.includes('vanilla')) {
      enhancement += '- Cream and soft beige color tones\n';
      enhancement += '- Elegant, refined visual presentation\n';
      enhancement += '- Smooth, luxurious texture emphasis\n';
    } else if (flavorLower.includes('butter')) {
      enhancement += '- Golden yellow and warm cream colors\n';
      enhancement += '- Rich, smooth texture visualization\n';
      enhancement += '- Premium, indulgent atmosphere\n';
    } else if (flavorLower.includes('coconut')) {
      enhancement += '- White and tropical color palette\n';
      enhancement += '- Fresh, exotic visual elements\n';
      enhancement += '- Natural, tropical atmosphere\n';
    } else {
      enhancement += `- Colors and elements that evoke ${flavor} characteristics\n`;
      enhancement += `- Visual cues that represent ${flavor} authenticity\n`;
    }
    
    enhancement += `- Prominent display of "${productName}" with ${flavor} flavor emphasis\n`;
    enhancement += `- Visual storytelling that highlights the ${flavor} experience\n`;
    
    return enhancement;
  }
  
  /**
   * Add final prompt enhancements for quality and consistency
   */
  private addFinalPromptEnhancements(productName: string, tagline: string): string {
    return `\n\n## FINAL REQUIREMENTS:\n` +
           `- Product name MUST appear exactly as: "${productName}"\n` +
           `- Company name MUST appear as: "Britannia"\n` +
           `- Include tagline: "${tagline}"\n` +
           `- Commercial photography quality with professional lighting\n` +
           `- High resolution, print-ready quality\n` +
           `- Brand consistency with Britannia's premium food brand identity\n` +
           `- Visual appeal that drives engagement and purchase intent\n` +
           `- Culturally appropriate for Indian market preferences\n`;
  }
}

export const geminiGenImageService = GeminiGenImageService.getInstance();