import { genAI, isGeminiAvailable } from '../config/gemini';
import { embeddingService } from './embedding.service';
import { pineconeService } from './pinecone.service';
import { rateLimitedImageService } from './rate-limited-image.service';
import { CampaignLogger } from './campaign-logger.service';
import { CampaignStageName } from '../models/campaign-log.model';
import { BrandingRequest, BrandingResponse, ProductContext } from '../types/branding.types';
import { ImageBrandingRequest } from '../types/image-branding.types';
import { SSEProgressCallback } from '../types/sse.types';
import { buildBrandingPrompt, BrandingPromptRequest } from '../templates';
import { ProcessedChunk } from '../utils/text-preprocessor.utils';
import { BrandingModel } from '../models/branding.model';
import { initializeMongoDB } from '../config/db';
import { logger } from '../config/logger';

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
  }, correlationId?: string): Promise<{
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
    const platform = (request.platform || 'instagram') as 'instagram' | 'linkedin' | 'email';
    const tone = request.tone as 'youth' | 'professional' | 'family';
    const style = (request.style || 'minimalist') as 'minimalist' | 'vibrant' | 'premium' | 'playful';

    const campaign = correlationId
      ? new CampaignLogger(correlationId, { productName: request.productName, tone: request.tone, platform, style, flavor: request.flavor })
      : CampaignLogger.create({ productName: request.productName, tone: request.tone, platform, style, flavor: request.flavor });

    try {
      await initializeMongoDB();

      // Stage: Validation
      campaign.stageStart('validation');
      campaign.stageComplete('validation');

      // Stage: Caption generation
      campaign.stageStart('caption');
      const brandingRequest: BrandingRequest = {
        productName: request.productName,
        tone: tone,
        platform: platform,
        flavor: request.flavor
      };
      const brandingContent = await this.generateBranding(brandingRequest);
      campaign.stageComplete('caption', {
        model: 'gemini-2.0-flash',
        wordCount: brandingContent.data.metadata.wordCount,
      });

      // Stage: Rate limit + Image generation
      campaign.stageStart('rateLimit');
      const estimatedWait = rateLimitedImageService.getEstimatedWaitTime();
      if (estimatedWait > 0) {
        campaign.stageComplete('rateLimit', { estimatedWaitMs: estimatedWait, queued: true });
      } else {
        campaign.stageComplete('rateLimit', { queued: false });
      }

      campaign.stageStart('imageGeneration');
      const imageRequest: ImageBrandingRequest = {
        productName: request.productName.trim(),
        platform: platform.toLowerCase(),
        tone: request.tone.toLowerCase(),
        flavor: request.flavor?.trim(),
        style: (style?.toLowerCase() || 'minimalist') as 'minimalist' | 'vibrant' | 'premium' | 'playful'
      };
      const imageResult = await rateLimitedImageService.generateBrandingImage(imageRequest);

      if (!imageResult.success || !imageResult.data) {
        throw new Error(`Image generation failed: ${imageResult.error}`);
      }
      campaign.stageComplete('imageGeneration', { provider: 'openrouter', imageUrl: imageResult.viewUrl });

      // Stage: S3 upload (already happened inside imageService)
      campaign.stageStart('s3Upload');
      campaign.stageComplete('s3Upload', { cdnUrl: imageResult.viewUrl });

      // Stage: MongoDB save
      campaign.stageStart('mongoSave');
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
          freepikTaskId: imageResult.data.metadata?.openRouterRequestId
        },
        isActive: true
      });

      const savedBranding = await brandingDocument.save();
      campaign.stageComplete('mongoSave', { brandingId: savedBranding._id.toString() });

      // Finalize campaign log
      await campaign.complete(savedBranding._id.toString());

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
          hashtags: brandingContent.data.hashtags,
          cta: brandingContent.data.cta,
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
      // Record the failing stage if not already captured
      const failedStageName = this.inferFailedStage(error);
      if (failedStageName) {
        campaign.stageFailed(failedStageName, error, this.inferErrorCode(error));
      }
      await campaign.fail(error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Streaming version: generates branding with real-time progress callbacks.
   * Runs caption + image generation in PARALLEL for faster execution.
   */
  public async generateComprehensiveBrandingStreaming(
    request: {
      productName: string;
      tone: string;
      platform?: string;
      flavor?: string;
      style?: string;
    },
    onProgress: SSEProgressCallback,
    correlationId?: string
  ): Promise<void> {
    const platform = (request.platform || 'instagram') as 'instagram' | 'linkedin' | 'email';
    const tone = request.tone as 'youth' | 'professional' | 'family';
    const style = (request.style || 'minimalist') as 'minimalist' | 'vibrant' | 'premium' | 'playful';

    const campaign = correlationId
      ? new CampaignLogger(correlationId, { productName: request.productName, tone: request.tone, platform, style, flavor: request.flavor })
      : CampaignLogger.create({ productName: request.productName, tone: request.tone, platform, style, flavor: request.flavor });

    try {
      await initializeMongoDB();

      campaign.stageStart('validation');
      campaign.stageComplete('validation');
      onProgress('stage:validation', { stage: 'validation', status: 'complete', progress: 5 });

      const brandingRequest: BrandingRequest = {
        productName: request.productName,
        tone: tone,
        platform: platform,
        flavor: request.flavor
      };

      const imageRequest: ImageBrandingRequest = {
        productName: request.productName.trim(),
        platform: platform.toLowerCase(),
        tone: request.tone.toLowerCase(),
        flavor: request.flavor?.trim(),
        style: (style?.toLowerCase() || 'minimalist') as 'minimalist' | 'vibrant' | 'premium' | 'playful'
      };

      // Run caption and image generation IN PARALLEL (they are independent)
      const [brandingContent, imageResult] = await Promise.all([
        // Caption generation
        (async () => {
          campaign.stageStart('caption');
          onProgress('stage:caption', { stage: 'caption', status: 'started', progress: 10 });
          const result = await this.generateBranding(brandingRequest);
          campaign.stageComplete('caption', {
            model: 'gemini-2.0-flash',
            wordCount: result.data.metadata.wordCount,
          });
          onProgress('stage:caption', {
            stage: 'caption',
            status: 'complete',
            progress: 25,
            data: {
              caption: result.data.caption,
              hashtags: result.data.hashtags,
              cta: result.data.cta
            }
          });
          return result;
        })(),

        // Image generation (with rate limit queue updates)
        (async () => {
          campaign.stageStart('rateLimit');
          onProgress('stage:rateLimit', { stage: 'rateLimit', status: 'checking', progress: 30 });

          const estimatedWait = rateLimitedImageService.getEstimatedWaitTime();
          if (estimatedWait > 0) {
            campaign.stageComplete('rateLimit', { estimatedWaitMs: estimatedWait, queued: true });
            onProgress('stage:rateLimit', {
              stage: 'rateLimit',
              status: 'queued',
              progress: 30,
              estimatedWait,
              queuePosition: rateLimitedImageService.getRateLimitStatus().queueLength + 1
            });
          } else {
            campaign.stageComplete('rateLimit', { queued: false });
            onProgress('stage:rateLimit', { stage: 'rateLimit', status: 'cleared', progress: 35 });
          }

          campaign.stageStart('imageGeneration');
          onProgress('stage:image', { stage: 'image', status: 'started', progress: 40 });

          const result = await rateLimitedImageService.generateBrandingImage(
            imageRequest,
            (position, estWait) => {
              onProgress('stage:rateLimit', {
                stage: 'rateLimit',
                status: 'queued',
                progress: 30,
                queuePosition: position,
                estimatedWait: estWait
              });
            }
          );

          campaign.stageComplete('imageGeneration', { provider: 'openrouter' });
          onProgress('stage:image', { stage: 'image', status: 'complete', progress: 70 });
          return result;
        })()
      ]);

      if (!imageResult.success || !imageResult.data) {
        throw new Error(`Image generation failed: ${imageResult.error}`);
      }

      // Upload notification (S3 upload already happened inside imageService)
      campaign.stageStart('s3Upload');
      campaign.stageComplete('s3Upload', { cdnUrl: imageResult.viewUrl });
      onProgress('stage:upload', {
        stage: 'upload',
        status: 'complete',
        progress: 85,
        data: { imageUrl: imageResult.viewUrl }
      });

      // Save to MongoDB
      campaign.stageStart('mongoSave');
      onProgress('stage:save', { stage: 'save', status: 'started', progress: 90 });

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
          freepikTaskId: imageResult.data.metadata?.openRouterRequestId
        },
        isActive: true
      });

      const savedBranding = await brandingDocument.save();
      campaign.stageComplete('mongoSave', { brandingId: savedBranding._id.toString() });
      onProgress('stage:save', { stage: 'save', status: 'complete', progress: 95 });

      // Finalize campaign log
      await campaign.complete(savedBranding._id.toString());

      // Send complete event with full result
      onProgress('complete', {
        progress: 100,
        data: {
          correlationId: campaign.correlationId,
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
          hashtags: brandingContent.data.hashtags,
          cta: brandingContent.data.cta,
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
      });
    } catch (error) {
      const failedStageName = this.inferFailedStage(error);
      if (failedStageName) {
        campaign.stageFailed(failedStageName, error, this.inferErrorCode(error));
      }
      await campaign.fail(error);
      throw error; // Re-throw so the controller can send SSE error event
    }
  }

  /**
   * Generate branding content for a product
   */
  public async generateBranding(request: BrandingRequest): Promise<BrandingResponse> {
    try {
      logger.info({ productName: request.productName }, 'Starting branding content generation');

      const productContext = await this.getProductContext(request.productName);
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
      logger.error({ err: error, productName: request.productName }, 'Branding content generation failed');
      throw error;
    }
  }

  /**
   * Get product context from Pinecone using embeddings
   */
  private async getProductContext(productName: string): Promise<ProductContext[]> {
    try {
      if (!embeddingService.isAvailable() || !pineconeService.isAvailable()) {
        logger.warn('Embeddings or Pinecone not available, returning empty context');
        return [];
      }

      logger.debug({ productName }, 'Generating embedding for product search');
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

      logger.debug('Searching similar products in Pinecone');
      const searchResult = await pineconeService.searchSimilar(searchEmbedding.embedding, 5);

      if (!searchResult.success) {
        logger.warn('Pinecone search failed, returning empty context');
        return [];
      }

      const productContext: ProductContext[] = searchResult.matches.map(match => ({
        name: match.metadata?.productName || 'Unknown Product',
        description: match.metadata?.description || undefined,
        category: match.metadata?.category || undefined,
        highlights: match.metadata?.text ? [match.metadata.text] : undefined,
        similarity: match.score
      }));

      logger.info({ count: productContext.length }, 'Found similar products');
      return productContext;

    } catch (error) {
      logger.error({ err: error }, 'Error getting product context');
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
    
    logger.info('Generating content with Gemini');
    
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
        logger.warn({ retriesLeft: retries - 1, err: error.message }, 'Gemini attempt failed, retrying');
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
      logger.error({ err: error }, 'Error fetching brandings');
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
      logger.error({ err: error }, 'Error fetching branding by ID');
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
    return isGeminiAvailable() && rateLimitedImageService.isAvailable();
  }

  /**
   * Get rate limit status for monitoring
   */
  public getRateLimitStatus() {
    return rateLimitedImageService.getRateLimitStatus();
  }

  /** Infer which stage failed based on error message patterns */
  private inferFailedStage(error: unknown): CampaignStageName | null {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('image generation') || msg.includes('openrouter')) return 'imageGeneration';
    if (msg.includes('gemini') || msg.includes('no content generated')) return 'caption';
    if (msg.includes('s3') || msg.includes('upload')) return 's3Upload';
    if (msg.includes('mongo') || msg.includes('save')) return 'mongoSave';
    if (msg.includes('pinecone') || msg.includes('embedding')) return 'caption';
    return null;
  }

  /** Map error to a standardized error code */
  private inferErrorCode(error: unknown): string {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('429') || msg.includes('rate limit')) return 'OPENROUTER_429';
    if (msg.includes('timeout') && msg.includes('openrouter')) return 'OPENROUTER_TIMEOUT';
    if (msg.includes('openrouter')) return 'OPENROUTER_ERROR';
    if (msg.includes('timeout') && msg.includes('gemini')) return 'GEMINI_TIMEOUT';
    if (msg.includes('gemini') || msg.includes('no content generated')) return 'GEMINI_ERROR';
    if (msg.includes('s3') || msg.includes('upload')) return 'S3_UPLOAD_FAILED';
    if (msg.includes('mongo') || msg.includes('save')) return 'MONGO_SAVE_FAILED';
    if (msg.includes('pinecone')) return 'PINECONE_SEARCH_FAILED';
    return 'UNKNOWN_ERROR';
  }
}

export const brandingService = BrandingService.getInstance();