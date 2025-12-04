import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ImageBrandingRequest, ImageBrandingResponse } from '../types/image-branding.types';
import { ProductModel } from '../models/product.model';
import { BrandingModel } from '../models/branding.model';
import { generateGeminiContent } from '../config/gemini';
import { uploadImageToS3, isS3Available } from '../utils/s3';

export class FreePikImageService {
  private static instance: FreePikImageService;
  private apiKey: string;
  private apiUrl: string = 'https://api.freepik.com/v1/ai/text-to-image/flux-dev';
  private outputDir: string;

  private constructor() {
    this.apiKey = process.env.FREEPIK_API_KEY || '';
    this.outputDir = path.join(__dirname, '../../generated-images');
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log('✅ Created generated-images directory:', this.outputDir);
    }

    if (!this.apiKey) {
      console.warn('⚠️ FREEPIK_API_KEY not found in environment variables');
    }
  }

  public static getInstance(): FreePikImageService {
    if (!FreePikImageService.instance) {
      FreePikImageService.instance = new FreePikImageService();
    }
    return FreePikImageService.instance;
  }

  /**
   * Generate branding image using FreePik API
   */
  public async generateBrandingImage(request: ImageBrandingRequest): Promise<ImageBrandingResponse> {
    try {
      console.log('🎨 Starting FreePik image generation for:', request.productName);

      if (!this.apiKey) {
        throw new Error('FreePik API key not configured');
      }

      // Get product data from database
      const productData = await this.getProductData(request.productName);
      if (!productData) {
        throw new Error(`Product "${request.productName}" not found`);
      }

      console.log('✅ Found product:', productData.name);

      // Step 2: Generate branding caption and tagline
      const brandingContent = await this.generateBrandingContent(productData, request);

      // Step 3: Build optimized prompt for FreePik branding image
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

      console.log('📝 Generated prompt:', prompt);

      // Generate image using FreePik API
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
            freepikRequestId: imageResult.requestId,
            s3Key: savedImage.s3Key,
            localPath: savedImage.filepath
          }
        },
        savedFilename: savedImage.filename,
        viewUrl: savedImage.s3Url || `http://localhost:3000/api/image-branding/view/${savedImage.filename}`
      };

    } catch (error) {
      console.error('❌ FreePik image generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate image using FreePik API
   */
  private async generateImage(prompt: string, request: ImageBrandingRequest): Promise<{ imageUrl: string; requestId: string }> {
    try {
      console.log('🚀 Calling FreePik API...');

      // Map tone to FreePik styling effects
      const styling = this.getFreePikStyling(request.tone, request.style);

      const requestBody = {
        prompt: prompt,
        aspect_ratio: this.getAspectRatio(request.platform),
        styling: styling,
        seed: Math.floor(Math.random() * 2147483648) // Random seed for variety
      };

      console.log('📤 FreePik request:', JSON.stringify(requestBody, null, 2));

      // Step 1: Create the generation task
      const response = await axios.post(this.apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'x-freepik-api-key': this.apiKey
        },
        timeout: 60000 // 60 seconds timeout
      });

      console.log('📥 FreePik response status:', response.status);
      console.log('📥 FreePik response data:', JSON.stringify(response.data, null, 2));
      
      if (response.data && response.data.data && response.data.data.task_id) {
        const taskId = response.data.data.task_id;
        console.log('🎯 Task created with ID:', taskId);
        
        // Step 2: Poll for completion
        const result = await this.pollTaskCompletion(taskId);
        
        if (result && result.imageUrl) {
          console.log('✅ Image generated successfully:', result.imageUrl);
          return { imageUrl: result.imageUrl, requestId: taskId };
        } else {
          throw new Error('Task completed but no image URL found');
        }
      } else {
        throw new Error('Invalid response from FreePik API - no task_id found');
      }

    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ FreePik API Error:', error.response?.data || error.message);
        throw new Error(`FreePik API failed: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Poll FreePik task until completion
   */
  private async pollTaskCompletion(taskId: string, maxAttempts: number = 30, interval: number = 2000): Promise<{ imageUrl: string } | null> {
    console.log('🔄 Starting to poll task:', taskId);
    
    const statusUrl = `https://api.freepik.com/v1/ai/text-to-image/flux-dev/${taskId}`;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`🔍 Polling attempt ${attempt}/${maxAttempts}...`);
        
        const response = await axios.get(statusUrl, {
          headers: {
            'x-freepik-api-key': this.apiKey
          },
          timeout: 10000
        });
        
        console.log('📊 Task status response:', JSON.stringify(response.data, null, 2));
        
        const task = response.data.data;
        const status = task.status;
        
        if (status === 'COMPLETED') {
          if (task.generated && task.generated.length > 0) {
            const imageUrl = task.generated[0]; // URL is directly in the array, not in a .url property
            console.log('🎉 Task completed! Image URL:', imageUrl);
            return { imageUrl };
          } else {
            throw new Error('Task completed but no generated images found');
          }
        } else if (status === 'FAILED' || status === 'ERROR') {
          throw new Error(`Task failed with status: ${status}`);
        } else if (status === 'CREATED' || status === 'PROCESSING' || status === 'IN_PROGRESS') {
          console.log(`⏳ Task status: ${status}, waiting ${interval}ms...`);
          await new Promise(resolve => setTimeout(resolve, interval));
          continue;
        } else {
          console.log(`❓ Unknown status: ${status}, continuing to poll...`);
          await new Promise(resolve => setTimeout(resolve, interval));
          continue;
        }
        
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(`Polling failed after ${maxAttempts} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        console.log(`⚠️ Polling attempt ${attempt} failed, retrying:`, error instanceof Error ? error.message : 'Unknown error');
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    
    throw new Error(`Task did not complete within ${maxAttempts * interval / 1000} seconds`);
  }

  /**
   * Download image from FreePik, save locally, and upload to S3
   */
  private async downloadAndSaveImage(imageUrl: string, prompt: string): Promise<{ 
    filename: string; 
    filepath: string; 
    base64Image: string;
    s3Url?: string;
    s3Key?: string;
  }> {
    try {
      console.log('📥 Downloading image from FreePik...');

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
      
      const filename = `freepik_${timestamp}_${promptSlug}.jpg`;
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
          const s3Result = await uploadImageToS3(s3Key, imageBuffer, 'image/jpeg');
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
   * Get FreePik styling based on tone and style
   */
  private getFreePikStyling(tone: string, style?: string) {
    const styling: any = {
      effects: {},
      colors: []
    };

    // Map tone to effects with valid FreePik values
    // Valid color values: 'softhue', 'b&w', 'goldglow', 'vibrant', 'coldneon'
    // Valid lightning values: 'iridescent', 'dramatic', 'goldenhour', 'longexposure', 'indorlight', 'flash', 'neon'
    switch (tone) {
      case 'youth':
        styling.effects.color = 'vibrant';
        styling.effects.lightning = 'neon';
        styling.colors.push({ color: '#FF6B6B', weight: 0.3 });
        styling.colors.push({ color: '#4ECDC4', weight: 0.3 });
        break;
      case 'premium':
        styling.effects.color = 'goldglow';
        styling.effects.lightning = 'goldenhour';
        styling.colors.push({ color: '#2C3E50', weight: 0.4 });
        styling.colors.push({ color: '#F39C12', weight: 0.2 });
        break;
      case 'family':
        styling.effects.color = 'softhue';
        styling.effects.lightning = 'indorlight';
        styling.colors.push({ color: '#E67E22', weight: 0.3 });
        styling.colors.push({ color: '#F4D03F', weight: 0.2 });
        break;
      case 'health':
        styling.effects.color = 'softhue';
        styling.effects.lightning = 'flash';
        styling.colors.push({ color: '#27AE60', weight: 0.4 });
        styling.colors.push({ color: '#F7DC6F', weight: 0.2 });
        break;
      case 'traditional':
        styling.effects.color = 'goldglow';
        styling.effects.lightning = 'goldenhour';
        styling.colors.push({ color: '#8B4513', weight: 0.3 });
        styling.colors.push({ color: '#DAA520', weight: 0.2 });
        break;
      case 'professional':
        styling.effects.color = 'b&w';
        styling.effects.lightning = 'dramatic';
        styling.colors.push({ color: '#2C3E50', weight: 0.4 });
        styling.colors.push({ color: '#BDC3C7', weight: 0.2 });
        break;
      default:
        styling.effects.color = 'softhue';
        styling.effects.lightning = 'indorlight';
        styling.colors.push({ color: '#34495E', weight: 0.3 });
    }

    // Adjust based on style with valid values
    if (style === 'vibrant') {
      styling.effects.color = 'vibrant';
      styling.effects.lightning = 'neon';
    } else if (style === 'minimalist') {
      styling.effects.color = 'softhue';
      styling.effects.lightning = 'indorlight';
    } else if (style === 'premium') {
      styling.effects.color = 'goldglow';
      styling.effects.lightning = 'goldenhour';
    } else if (style === 'playful') {
      styling.effects.color = 'vibrant';
      styling.effects.lightning = 'iridescent';
    }

    return styling;
  }

  /**
   * Get aspect ratio based on platform
   */
  private getAspectRatio(platform: string): string {
    switch (platform) {
      case 'instagram':
        return 'square_1_1'; // Square format for Instagram posts
      case 'linkedin':
        return 'widescreen_16_9'; // Professional widescreen format
      case 'email':
        return 'widescreen_16_9'; // Banner style for emails
      case 'facebook':
        return 'social_post_4_5'; // Facebook optimized format
      case 'twitter':
        return 'widescreen_16_9'; // Twitter header/image format
      default:
        return 'square_1_1'; // Default to square
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
        .filter(file => file.startsWith('freepik_') && (file.endsWith('.jpg') || file.endsWith('.png')))
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
      service: 'FreePik AI Image Generation',
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
Create compelling branding content for ${productData.name} by Britannia.

Product Details:
- Name: ${productData.name}
- Description: ${productData.description || 'Premium biscuit/snack product'}
- Category: ${productData.category || 'Biscuits & Snacks'}
- Flavor: ${request.flavor || 'Classic'}

Branding Requirements:
- Target Tone: ${request.tone} (${toneDescriptions[request.tone as keyof typeof toneDescriptions]})
- Platform: ${request.platform} (${platformStyles[request.platform as keyof typeof platformStyles]})
- Style: ${request.style}

Generate:
1. A compelling tagline (5-8 words max) that captures the essence
2. A engaging caption (20-40 words) for the branding image

Make it:
- Brand-aligned with Britannia's heritage
- Tone-appropriate for ${request.tone} audience
- Platform-optimized for ${request.platform}
- Product-focused on ${productData.name}

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
    const toneTaglines = {
      youth: `${productData.name} - Your Vibe!`,
      family: `${productData.name} - Family Moments`,
      premium: `${productData.name} - Pure Excellence`,
      health: `${productData.name} - Naturally Good`,
      traditional: `${productData.name} - Time Tested`,
      professional: `${productData.name} - Success Fuel`
    };

    const toneCaptions = {
      youth: `Experience the amazing taste of ${productData.name}! Perfect for your active lifestyle and trending moments.`,
      family: `Bring your family together with the delicious taste of ${productData.name}. Creating memories, one bite at a time.`,
      premium: `Indulge in the sophisticated taste of ${productData.name}. Crafted for those who appreciate the finest quality.`,
      health: `Nourish your body with the wholesome goodness of ${productData.name}. Natural ingredients, authentic taste.`,
      traditional: `Discover the authentic taste of ${productData.name}. A heritage of quality that spans generations.`,
      professional: `Fuel your success with ${productData.name}. The perfect companion for your professional journey.`
    };

    return {
      tagline: toneTaglines[request.tone as keyof typeof toneTaglines] || `${productData.name} - Britannia`,
      caption: toneCaptions[request.tone as keyof typeof toneCaptions] || `Enjoy the delicious taste of ${productData.name} from Britannia.`
    };
  }

  /**
   * Build enhanced branding prompt for FreePik image generation
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
    const { productName, productDescription, platform, tone, style, caption, tagline } = context;

    // Enhanced branding prompt based on the reference images
    let prompt = `Professional branding advertisement for ${productName} by Britannia`;
    
    // Add the core branding elements
    prompt += `, featuring the tagline "${tagline}"`;
    prompt += `, with marketing message "${caption}"`;
    
    // Add product and brand elements
    prompt += `, prominent Britannia logo placement`;
    prompt += `, ${productName} product packaging prominently displayed`;
    
    // Tone-specific branding styles
    const toneStyles = {
      youth: 'vibrant colors, energetic composition, social media ready, trendy design elements, youthful energy, modern graphics',
      family: 'warm color palette, family-friendly imagery, cozy atmosphere, togetherness feeling, homely comfort',
      premium: 'elegant gold accents, sophisticated layout, luxury feel, refined typography, premium materials texture',
      health: 'fresh green tones, natural elements, clean design, wellness imagery, organic feel',
      traditional: 'classic color scheme, heritage elements, authentic design, timeless appeal, traditional patterns',
      professional: 'corporate colors, clean layout, business-appropriate, professional typography, success themes'
    };

    // Platform-specific optimizations
    const platformSpecs = {
      instagram: 'square format 1:1, Instagram-optimized, social media ready, eye-catching colors',
      linkedin: 'professional layout, business-appropriate, corporate design, rectangular format',
      email: 'banner style, clear call-to-action focus, email-optimized layout',
      facebook: 'social media optimized, shareable design, engaging visuals',
      twitter: 'compact design, Twitter-ready, viral potential layout'
    };

    // Style descriptors
    const styleMap = {
      minimalist: 'clean minimal design, simple composition, plenty of white space, focused layout',
      vibrant: 'bright energetic colors, dynamic composition, high contrast, bold design',
      premium: 'luxury aesthetic, sophisticated color palette, elegant typography, high-end feel',
      playful: 'fun dynamic elements, creative composition, playful typography, engaging design'
    };

    prompt += `, ${toneStyles[tone as keyof typeof toneStyles] || 'appealing design'}`;
    prompt += `, ${styleMap[style as keyof typeof styleMap] || 'attractive layout'}`;
    prompt += `, ${platformSpecs[platform as keyof typeof platformSpecs] || 'optimized format'}`;
    
    // Add product description if available
    if (productDescription) {
      prompt += `, highlighting ${productDescription}`;
    }

    // Add quality and branding elements
    prompt += `, high-quality commercial photography, professional advertising design`;
    prompt += `, brand identity focused, marketing campaign style, commercial grade`;
    prompt += `, studio lighting, clean background, product hero shot`;
    
    // Final branding touch
    prompt += `, Britannia brand heritage, Indian premium food brand aesthetic`;

    return prompt;
  }
}

export const freePikImageService = FreePikImageService.getInstance();