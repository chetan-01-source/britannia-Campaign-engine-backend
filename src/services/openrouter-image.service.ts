import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ImageBrandingRequest, ImageBrandingResponse, ImagePromptContext } from '../types/image-branding.types';
import { ProductModel } from '../models/product.model';
import { BrandingModel } from '../models/branding.model';
import { generateGeminiContent } from '../config/gemini';
import { uploadImageToS3, isS3Available } from '../utils/s3';
import { IMAGE_BRANDING_PROMPT_TEMPLATE } from '../templates/image-branding-prompts';

export class OpenRouterImageService {
  private static instance: OpenRouterImageService;
  private apiKey: string;
  private apiUrl: string = 'https://openrouter.ai/api/v1/chat/completions';
  private outputDir: string;

  private constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || '';
    this.outputDir = path.join(__dirname, '../../generated-images');

    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log('✅ Created generated-images directory:', this.outputDir);
    }

    if (!this.apiKey) {
      console.warn('⚠️ OPENROUTER_API_KEY not found in environment variables');
    } else {
      console.log('✅ OpenRouter API key configured');
    }
  }

  public static getInstance(): OpenRouterImageService {
    if (!OpenRouterImageService.instance) {
      OpenRouterImageService.instance = new OpenRouterImageService();
    }
    return OpenRouterImageService.instance;
  }

  /**
   * Generate branding image using OpenRouter API
   */
  public async generateBrandingImage(request: ImageBrandingRequest): Promise<ImageBrandingResponse> {
    try {
      console.log('🎨 Starting OpenRouter image generation for:', request.productName);
      console.log('📋 Request details:', {
        productName: request.productName,
        platform: request.platform,
        tone: request.tone,
        style: request.style,
        flavor: request.flavor
      });

      if (!this.apiKey) {
        throw new Error('OpenRouter API key not configured');
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

      // Step 3: Build optimized prompt for branding image
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

      // Generate image using OpenRouter API
      const imageResult = await this.generateImage(prompt, request);
      console.log('✅ Image generated successfully');

      // Save the image locally and upload to S3
      const savedImage = await this.saveImage(imageResult.base64DataUrl, prompt);

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
            openRouterRequestId: imageResult.requestId,
            s3Key: savedImage.s3Key,
            localPath: savedImage.filepath
          }
        },
        savedFilename: savedImage.filename,
        viewUrl: savedImage.s3Url || `http://localhost:3000/api/image-branding/view/${savedImage.filename}`
      };

    } catch (error) {
      console.error('❌ OpenRouter image generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate image using OpenRouter API with google/gemini-3-pro-image-preview
   */
  private async generateImage(prompt: string, request: ImageBrandingRequest): Promise<{ base64DataUrl: string; requestId: string }> {
    try {
      console.log('🚀 Calling OpenRouter API...');

      const aspectRatio = this.getAspectRatio(request.platform);

      const requestBody = {
        model: 'google/gemini-3-pro-image-preview',
        messages: [{ role: 'user', content: prompt }],
        modalities: ['image', 'text'],
        image_config: {
          aspect_ratio: aspectRatio,
          image_size: '4K'
        }
      };

      console.log('📤 OpenRouter request details:', {
        promptLength: prompt.length,
        promptStart: prompt.substring(0, 200) + '...',
        model: 'google/gemini-3-pro-image-preview',
        aspect_ratio: aspectRatio,
        requestPlatform: request.platform,
        requestStyle: request.style
      });

      let response;
      try {
        response = await axios.post(this.apiUrl, requestBody, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 120000, // 120 seconds - synchronous generation can take 30-90s
          maxContentLength: 50 * 1024 * 1024, // 50MB max response size for base64 images
          maxBodyLength: 50 * 1024 * 1024
        });
      } catch (error) {
        // If the request fails, try with fallback parameters
        if (axios.isAxiosError(error) && error.response?.status === 500) {
          console.log('⚠️ First request failed, trying with fallback parameters...');

          const fallbackBody = {
            ...requestBody,
            image_config: {
              aspect_ratio: '1:1',
              image_size: '4K'
            }
          };

          console.log('📤 Fallback request with aspect_ratio: 1:1');

          response = await axios.post(this.apiUrl, fallbackBody, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 120000,
            maxContentLength: 50 * 1024 * 1024,
            maxBodyLength: 50 * 1024 * 1024
          });

          console.log('✅ Fallback request succeeded');
        } else {
          throw error;
        }
      }

      console.log('📥 OpenRouter response status:', response.status);

      // Extract image from OpenRouter chat completion response
      const choices = response.data?.choices;
      if (!choices || choices.length === 0) {
        throw new Error('No choices returned from OpenRouter API');
      }

      const message = choices[0].message;
      const requestId = response.data?.id || 'unknown';

      // OpenRouter returns images in message.images array
      if (message?.images && message.images.length > 0) {
        const base64DataUrl = message.images[0].image_url.url;
        console.log('✅ Image received from OpenRouter, data URL length:', base64DataUrl.length);
        return { base64DataUrl, requestId };
      }

      // Fallback: check if image is in content array (some models return it differently)
      if (Array.isArray(message?.content)) {
        const imageContent = message.content.find((c: any) => c.type === 'image_url' || c.type === 'image');
        if (imageContent) {
          const base64DataUrl = imageContent.image_url?.url || imageContent.url;
          if (base64DataUrl) {
            console.log('✅ Image found in content array');
            return { base64DataUrl, requestId };
          }
        }
      }

      throw new Error('No image found in OpenRouter API response');

    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('❌ OpenRouter API Error Details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url
        });

        const errorMsg = error.response?.data?.error?.message ||
                        error.response?.data?.message ||
                        error.response?.data?.error ||
                        error.response?.statusText ||
                        error.message;

        throw new Error(`OpenRouter API failed: ${errorMsg}`);
      }
      console.error('❌ Non-Axios error in generateImage:', error);
      throw error;
    }
  }

  /**
   * Save base64 data URL image locally and upload to S3
   */
  private async saveImage(base64DataUrl: string, prompt: string): Promise<{
    filename: string;
    filepath: string;
    base64Image: string;
    s3Url?: string;
    s3Key?: string;
  }> {
    try {
      console.log('💾 Processing image from OpenRouter response...');

      // Parse the base64 data URL to extract raw base64 data
      // Format: data:image/png;base64,<data> or data:image/jpeg;base64,<data>
      let base64Data: string;
      let imageFormat = 'png';

      if (base64DataUrl.startsWith('data:')) {
        const matches = base64DataUrl.match(/^data:image\/(\w+);base64,(.+)$/s);
        if (matches) {
          imageFormat = matches[1];
          base64Data = matches[2];
        } else {
          // Try splitting on comma as fallback
          base64Data = base64DataUrl.split(',')[1] || base64DataUrl;
        }
      } else {
        // Assume raw base64 if no data URL prefix
        base64Data = base64DataUrl;
      }

      const imageBuffer = Buffer.from(base64Data!, 'base64');

      // Create filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const promptSlug = prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 30);

      const ext = imageFormat === 'jpeg' || imageFormat === 'jpg' ? 'jpg' : 'png';
      const filename = `openrouter_${timestamp}_${promptSlug}.${ext}`;
      const filepath = path.join(this.outputDir, filename);

      // Save image to file locally
      fs.writeFileSync(filepath, imageBuffer);

      // Convert to base64 for response (raw base64 without data URL prefix)
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

          const contentType = ext === 'jpg' ? 'image/jpeg' : 'image/png';
          console.log('☁️  Uploading image to S3...');
          const s3Result = await uploadImageToS3(s3Key, imageBuffer, contentType);
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
      console.error('❌ Error saving image:', error);
      throw new Error(`Failed to save image: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
   * Get aspect ratio based on platform
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
   * Check if service is available
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
        .filter(file => (file.startsWith('openrouter_') || file.startsWith('geminigen_')) && (file.endsWith('.jpg') || file.endsWith('.png')))
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
      service: 'OpenRouter Gemini 3 Pro Image Generation',
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

export const openRouterImageService = OpenRouterImageService.getInstance();
