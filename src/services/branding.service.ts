import { genAI, isGeminiAvailable } from '../config/gemini';
import { embeddingService } from './embedding.service';
import { pineconeService } from './pinecone.service';
import { freePikImageService } from './freepik-image.service';
import { BrandingRequest, BrandingResponse, ProductContext } from '../types/branding.types';
import { ImageBrandingRequest } from '../types/image-branding.types';
import { buildBrandingPrompt, BrandingPromptRequest } from '../templates';
import { ProcessedChunk } from '../utils/text-preprocessor.utils';
import { BrandingModel } from '../models/branding.model';
import { initializeMongoDB } from '../config/db';

export class BrandingService {
  private static instance: BrandingService;

  public static getInstance(): BrandingService {
    if (!BrandingService.instance) {
      BrandingService.instance = new BrandingService();
    }
    return BrandingService.instance;
  }

  /**
   * Generate comprehensive branding content with image and store in MongoDB
   */
  public async generateComprehensiveBranding(request: {
    productName: string;
    tone: string;
    platform?: string;
    flavor?: string;
    style?: string;
  }): Promise<{
    success: boolean;
    data?: {
      _id: string;
      productName: string;
      tone: string;
      platform: string;
      style: string;
      flavor?: string;
      caption: string;
      tagline: string;
      imageUrl: string;
      localImagePath: string;
      prompt: string;
      hashtags?: string[];
      cta?: string;
      metadata: any;
      createdAt: Date;
    };
    error?: any;
  }> {
    try {
      console.log('🎨 Starting comprehensive branding generation for:', request.productName);

      // Ensure database connection
      await initializeMongoDB();

      // Set defaults and validate types
      const platform = (request.platform || 'instagram') as 'instagram' | 'linkedin' | 'email';
      const tone = request.tone as 'youth' | 'professional' | 'family';
      const style = (request.style || 'minimalist') as 'minimalist' | 'vibrant' | 'premium' | 'playful';

      // Step 1: Generate branding content (caption, hashtags, CTA)
      console.log('📝 Generating branding content...');
      const brandingRequest: BrandingRequest = {
        productName: request.productName,
        tone: tone,
        platform: platform,
        flavor: request.flavor
      };
      const brandingContent = await this.generateBranding(brandingRequest);

      // Step 2: Generate branding image using FreePik
      console.log('🖼️ Generating branding image with FreePik...');
      const imageRequest: ImageBrandingRequest = {
        productName: request.productName,
        platform: platform,
        tone: request.tone,
        flavor: request.flavor,
        style: style
      };
      const imageResult = await freePikImageService.generateBrandingImage(imageRequest);

      if (!imageResult.success || !imageResult.data) {
        throw new Error(`Image generation failed: ${imageResult.error}`);
      }

      // Step 3: Store comprehensive branding data in MongoDB
      console.log('💾 Storing branding data in MongoDB...');
      const brandingDocument = new BrandingModel({
        productName: request.productName,
        tone: request.tone,
        platform: platform,
        style: style,
        flavor: request.flavor,
        generatedCaption: brandingContent.data.caption,
        generatedTagline: `${request.productName} - ${tone} Appeal`,
        imageUrl: imageResult.viewUrl || '',
        localImagePath: imageResult.savedFilename || '',
        prompt: imageResult.data.imagePrompt,
        metadata: {
          dimensions: this.getDimensionsForPlatform(platform),
          format: imageResult.data.metadata.format,
          generatedAt: new Date(),
          freepikTaskId: imageResult.data.metadata?.freepikRequestId
        },
        isActive: true
      });

      const savedBranding = await brandingDocument.save();
      console.log('✅ Comprehensive branding saved to MongoDB:', savedBranding._id);

      return {
        success: true,
        data: {
          _id: savedBranding._id.toString(),
          productName: savedBranding.productName,
          tone: savedBranding.tone,
          platform: savedBranding.platform,
          style: savedBranding.style,
          flavor: savedBranding.flavor,
          caption: savedBranding.generatedCaption,
          tagline: savedBranding.generatedTagline,
          imageUrl: savedBranding.imageUrl,
          localImagePath: savedBranding.localImagePath,
          prompt: savedBranding.prompt,
          hashtags: brandingContent.data.hashtags, // From branding content
          cta: brandingContent.data.cta, // From branding content
          metadata: {
            dimensions: savedBranding.metadata.dimensions,
            format: savedBranding.metadata.format,
            freepikTaskId: savedBranding.metadata.freepikTaskId,
            contentDetails: {
              model: 'gemini-2.0-flash',
              relevantProducts: brandingContent.data.metadata.relevantProducts,
              wordCount: brandingContent.data.metadata.wordCount,
              characterCount: brandingContent.data.metadata.characterCount
            }
          },
          createdAt: savedBranding.createdAt
        }
      };

    } catch (error) {
      console.error('❌ Comprehensive branding generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Generate branding content for a product
   */
  public async generateBranding(request: BrandingRequest): Promise<BrandingResponse> {
    try {
      console.log('🎨 Starting branding generation for:', request.productName);

      // Step 1: Get product context from Pinecone
      const productContext = await this.getProductContext(request.productName);
      
      // Step 2: Generate branding content using Gemini with templates
      const brandingContent = await this.generateContent(request, productContext);

      return {
        success: true,
        data: {
          productName: request.productName,
          tone: request.tone,
          platform: request.platform,
          flavor: request.flavor,
          caption: brandingContent.caption,
          hashtags: brandingContent.hashtags,
          cta: brandingContent.cta,
          metadata: {
            wordCount: brandingContent.caption.split(' ').length,
            characterCount: brandingContent.caption.length,
            relevantProducts: productContext.length,
            generatedAt: new Date().toISOString()
          }
        }
      };

    } catch (error) {
      console.error('❌ Branding generation failed:', error);
      throw error;
    }
  }

  /**
   * Get product context from Pinecone using embeddings
   */
  private async getProductContext(productName: string): Promise<ProductContext[]> {
    try {
      if (!embeddingService.isAvailable() || !pineconeService.isAvailable()) {
        console.warn('⚠️  Embeddings or Pinecone not available, returning empty context');
        return [];
      }

      // Generate embedding for the product name
      console.log('🔍 Generating embedding for product search...');
      const productChunk: ProcessedChunk = {
        id: 'search-' + Date.now(),
        text: productName,
        productName: productName,
        category: '',
        metadata: {
          slug: productName.toLowerCase().replace(/\s+/g, '-'),
          productUrl: undefined,
          createdAt: new Date()
        }
      };
      const embeddings = await embeddingService.generateEmbeddings([productChunk]);
      const searchEmbedding = embeddings[0];
      
      // Search similar products in Pinecone
      console.log('📌 Searching similar products in Pinecone...');
      const searchResult = await pineconeService.searchSimilar(searchEmbedding.embedding, 5);
      
      if (!searchResult.success) {
        console.warn('⚠️  Pinecone search failed, returning empty context');
        return [];
      }

      // Convert to product context
      const productContext: ProductContext[] = searchResult.matches.map(match => ({
        name: match.metadata?.productName || 'Unknown Product',
        description: match.metadata?.description || undefined,
        category: match.metadata?.category || undefined,
        highlights: match.metadata?.text ? [match.metadata.text] : undefined,
        similarity: match.score
      }));

      console.log(`✅ Found ${productContext.length} similar products`);
      return productContext;

    } catch (error) {
      console.error('❌ Error getting product context:', error);
      return [];
    }
  }

  /**
   * Generate branding content using Gemini with template system
   */
  private async generateContent(
    request: BrandingRequest, 
    productContext: ProductContext[]
  ): Promise<{ caption: string; hashtags?: string[]; cta?: string }> {
    if (!isGeminiAvailable()) {
      throw new Error('Gemini API key not configured');
    }

    // Build prompt using template system
    const promptRequest: BrandingPromptRequest = {
      productName: request.productName,
      tone: request.tone,
      platform: request.platform,
      flavor: request.flavor,
      productContext
    };

    const { systemPrompt, userPrompt } = buildBrandingPrompt(promptRequest);
    
    console.log('🤖 Generating content with Gemini using template system...');
    
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    // Add retry logic for connection issues
    let retries = 3;
    let result;
    
    while (retries > 0) {
      try {
        const prompt = `${systemPrompt}\n\nUser Request: ${userPrompt}`;
        result = await model.generateContent(prompt);
        break;
      } catch (error: any) {
        console.log(`⚠️ Attempt failed, retries left: ${retries - 1}`, error.message);
        retries--;
        if (retries === 0) throw error;
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const response = await result!.response;
    const content = response.text();

    if (!content) {
      throw new Error('No content generated from Gemini');
    }

    return this.parseGeneratedContent(content, request.platform);
  }

  /**
   * Parse generated content into structured format
   */
  private parseGeneratedContent(
    content: string, 
    platform: string
  ): { caption: string; hashtags?: string[]; cta?: string } {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let caption = '';
    let hashtags: string[] = [];
    let cta = '';
    
    let captionLines: string[] = [];
    let parsingMode = 'caption'; // 'caption', 'hashtags', 'cta'

    for (const line of lines) {
      if (line.startsWith('CAPTION:')) {
        parsingMode = 'caption';
        const captionText = line.replace('CAPTION:', '').trim();
        if (captionText) {
          captionLines.push(captionText);
        }
        continue;
      } else if (line.startsWith('HASHTAGS:')) {
        parsingMode = 'hashtags';
        const hashtagText = line.replace('HASHTAGS:', '').trim();
        if (hashtagText) {
          hashtags = hashtagText.split(/\s+/)
            .filter(tag => tag.startsWith('#'))
            .map(tag => tag.trim());
        }
        continue;
      } else if (line.startsWith('CTA:')) {
        parsingMode = 'cta';
        cta = line.replace('CTA:', '').trim();
        continue;
      } else if (line.startsWith('---')) {
        // Separator, ignore
        continue;
      }

      // Add content based on current parsing mode
      if (parsingMode === 'caption') {
        captionLines.push(line);
      } else if (parsingMode === 'hashtags' && line.includes('#')) {
        const lineHashtags = line.split(/\s+/)
          .filter(tag => tag.startsWith('#'))
          .map(tag => tag.trim());
        hashtags.push(...lineHashtags);
      } else if (parsingMode === 'cta' && !cta) {
        cta = line;
      }
    }

    // Join caption lines properly for email format
    if (platform.toLowerCase() === 'email') {
      // For email, preserve line breaks and structure
      caption = captionLines.join('\n\n');
    } else {
      // For social media, join with spaces
      caption = captionLines.join(' ');
    }

    // Fallback parsing if no structured format found
    if (!caption) {
      // Look for main content between headers or use all substantial lines
      const contentLines = lines.filter(line => 
        line && 
        !line.startsWith('CAPTION:') && 
        !line.startsWith('HASHTAGS:') && 
        !line.startsWith('CTA:') &&
        !line.startsWith('---') &&
        line.length > 5
      );
      
      if (platform.toLowerCase() === 'email') {
        caption = contentLines.join('\n\n');
      } else {
        caption = contentLines.join(' ');
      }
    }

    // Clean up hashtags if they got mixed into caption
    if (hashtags.length === 0 && platform.toLowerCase() !== 'email') {
      const hashtagMatches = caption.match(/#\w+/g);
      if (hashtagMatches) {
        hashtags = hashtagMatches;
        caption = caption.replace(/#\w+/g, '').trim();
      }
    }

    // For email platform, minimize hashtags as per platform specs
    if (platform.toLowerCase() === 'email') {
      hashtags = hashtags.slice(0, 2); // Minimal hashtags for email
    }

    return {
      caption: caption || 'Generated content for your product!',
      hashtags: hashtags.length > 0 ? hashtags : undefined,
      cta: cta || undefined
    };
  }

  /**
   * Get all branding documents from MongoDB with pagination
   */
  public async getAllBrandings(options: {
    limit?: number;
    skip?: number;
  } = {}): Promise<{
    success: boolean;
    data?: any[];
    totalCount?: number;
    pagination?: {
      currentPage: number;
      totalPages: number;
      limit: number;
      skip: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    error?: string;
  }> {
    try {
      await initializeMongoDB();
      
      const { limit = 10, skip = 0 } = options;
      
      // Get total count for pagination info
      const totalCount = await BrandingModel.countDocuments();
      
      // Get paginated results
      const brandings = await BrandingModel.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Calculate pagination metadata
      const currentPage = Math.floor(skip / limit) + 1;
      const totalPages = Math.ceil(totalCount / limit);
      
      return {
        success: true,
        data: brandings,
        totalCount,
        pagination: {
          currentPage,
          totalPages,
          limit,
          skip,
          hasNext: currentPage < totalPages,
          hasPrev: currentPage > 1
        }
      };
    } catch (error) {
      console.error('❌ Error fetching brandings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get branding by ID
   */
  public async getBrandingById(id: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      await initializeMongoDB();
      const branding = await BrandingModel.findById(id).lean();
      
      if (!branding) {
        return {
          success: false,
          error: 'Branding not found'
        };
      }
      
      return {
        success: true,
        data: branding
      };
    } catch (error) {
      console.error('❌ Error fetching branding:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get dimensions for platform-specific aspect ratios
   */
  private getDimensionsForPlatform(platform: string): string {
    switch (platform) {
      case 'instagram':
        return '1024x1024'; // Square 1:1
      case 'linkedin':
        return '1920x1080'; // Widescreen 16:9
      case 'email':
        return '1920x1080'; // Widescreen 16:9
      case 'facebook':
        return '1080x1350'; // Social post 4:5
      case 'twitter':
        return '1920x1080'; // Widescreen 16:9
      default:
        return '1024x1024'; // Default square
    }
  }

  /**
   * Check if branding service is available
   */
  public isAvailable(): boolean {
    return isGeminiAvailable() && freePikImageService.isAvailable();
  }
}

export const brandingService = BrandingService.getInstance();