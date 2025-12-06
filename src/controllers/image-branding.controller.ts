import { Request, Response } from 'express';
import { rateLimitedImageService } from '../services/rate-limited-image.service';
import { geminiGenImageService } from '../services/gemini-genai.service'; // For file operations
import { ImageBrandingRequest } from '../types/image-branding.types';

export class ImageBrandingController {
  /**
   * Generate branding image using free Hugging Face models
   * POST /api/image-branding/generate
   */
  public static async generateImage(req: Request, res: Response): Promise<void> {
    try {
      // Check if rate-limited image service is available
      if (!rateLimitedImageService.isAvailable()) {
        res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'GeminiGen API service not available. API key not configured.'
          }
        });
        return;
      }

      // Log current rate limit status
      console.log('📊 Image Branding Controller - Rate limit status:');
      rateLimitedImageService.logRateLimitStatus();
      
      const estimatedWait = rateLimitedImageService.getEstimatedWaitTime();
      if (estimatedWait > 5000) { // If wait is more than 5 seconds
        console.log(`⚠️ High wait time detected: ${Math.ceil(estimatedWait / 1000)}s`);
      }

      // Validate request body
      const { productName, platform, tone, flavor, style } = req.body;

      if (!productName || !platform || !tone) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Missing required fields: productName, platform, and tone are required.'
          }
        });
        return;
      }

      // Validate platform
      const validPlatforms = ['instagram', 'linkedin', 'email'];
      if (!validPlatforms.includes(platform.toLowerCase())) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PLATFORM',
            message: `Platform must be one of: ${validPlatforms.join(', ')}`
          }
        });
        return;
      }

      // Validate tone
      const validTones = ['youth', 'family', 'premium', 'health', 'traditional'];
      if (!validTones.includes(tone.toLowerCase())) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TONE',
            message: `Tone must be one of: ${validTones.join(', ')}`
          }
        });
        return;
      }

      // Validate style if provided
      if (style) {
        const validStyles = ['minimalist', 'vibrant', 'premium', 'playful'];
        if (!validStyles.includes(style.toLowerCase())) {
          res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_STYLE',
              message: `Style must be one of: ${validStyles.join(', ')}`
            }
          });
          return;
        }
      }

      console.log('🎨 GeminiGen image branding request:', {
        productName,
        platform,
        tone,
        flavor,
        style
      });

      const request: ImageBrandingRequest = {
        productName: productName.trim(),
        platform: platform.toLowerCase(),
        tone: tone.toLowerCase(),
        flavor: flavor?.trim(),
        style: style?.toLowerCase() || 'minimalist'
      };

      console.log('🎨 GeminiGen image branding request:', request);

      // Generate the branding image using GeminiGen AI
      console.log('🎨 Image Branding Controller - Making rate-limited generation request...');
      const result = await rateLimitedImageService.generateBrandingImage(request);
      
      // Log post-generation rate limit status
      console.log('📊 Rate limit status after generation:');
      rateLimitedImageService.logRateLimitStatus();

      if (result.success) {
        res.status(200).json({
          success: true,
          data: result.data,
          message: 'Image branding generated successfully using GeminiGen AI'
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'GENERATION_FAILED',
            message: result.error || 'Failed to generate image branding'
          }
        });
      }

    } catch (error) {
      console.error('❌ Image branding controller error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Internal server error'
        }
      });
    }
  }

  /**
   * Get available options for image branding
   * GET /api/image-branding/options
   */
  public static async getOptions(req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json({
        success: true,
        data: {
          platforms: [
            { value: 'instagram', label: 'Instagram', description: 'Square or vertical format, high engagement focus' },
            { value: 'linkedin', label: 'LinkedIn', description: 'Professional, business-oriented content' },
            { value: 'email', label: 'Email Marketing', description: 'Banner format with clear call-to-action' }
          ],
          tones: [
            { value: 'youth', label: 'Youth', description: 'Energetic, fun, trendy, social media focused' },
            { value: 'family', label: 'Family', description: 'Warm, trustworthy, home-oriented' },
            { value: 'premium', label: 'Premium', description: 'Elegant, sophisticated, high-end' },
            { value: 'health', label: 'Health', description: 'Fresh, natural, wellness focused' },
            { value: 'traditional', label: 'Traditional', description: 'Classic, heritage, authentic' }
          ],
          styles: [
            { value: 'minimalist', label: 'Minimalist', description: 'Clean, simple, elegant design' },
            { value: 'vibrant', label: 'Vibrant', description: 'Colorful, energetic, eye-catching' },
            { value: 'premium', label: 'Premium', description: 'Luxurious, refined, high-end aesthetic' },
            { value: 'playful', label: 'Playful', description: 'Fun, dynamic, youthful design' }
          ],
          flavors: [
            { value: 'sweet', label: 'Sweet', description: 'Focus on sweetness and indulgence' },
            { value: 'savory', label: 'Savory', description: 'Highlight savory and satisfying qualities' },
            { value: 'healthy', label: 'Healthy', description: 'Emphasize health and nutrition benefits' },
            { value: 'premium', label: 'Premium', description: 'Stress quality and luxury aspects' },
            { value: 'traditional', label: 'Traditional', description: 'Highlight heritage and authenticity' }
          ]
        }
      });
    } catch (error) {
      console.error('❌ Error getting image branding options:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve options'
        }
      });
    }
  }

  /**
   * Check service status
   * GET /api/image-branding/status
   */
  public static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const isAvailable = geminiGenImageService.isAvailable();
      const serviceInfo = geminiGenImageService.getServiceInfo();
      
      res.status(200).json({
        success: true,
        data: {
          available: isAvailable,
          service: serviceInfo.service,
          model: 'GeminiGen Imagen-Pro',
          apiKeyConfigured: serviceInfo.apiKeyConfigured,
          outputDirectory: serviceInfo.outputDirectory,
          totalSavedImages: serviceInfo.totalSavedImages,
          capabilities: [
            'Professional AI image generation',
            'GeminiGen Imagen-Pro model', 
            'Platform-specific optimizations',
            'Multi-tone branding support',
            'Commercial-grade image quality'
          ],
          advantages: [
            'High-quality professional images',
            'Fast generation times',
            'Multiple styling options',
            'Commercial usage rights',
            'Reliable API service'
          ]
        }
      });
    } catch (error) {
      console.error('❌ Error getting service status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve service status'
        }
      });
    }
  }

  /**
   * View generated image
   * GET /api/image-branding/view/:filename
   */
  public static async viewImage(req: Request, res: Response): Promise<void> {
    try {
      const { filename } = req.params;
      
      if (!filename) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FILENAME',
            message: 'Filename is required'
          }
        });
        return;
      }

      const filepath = geminiGenImageService.getSavedImagePath(filename);
      
      if (!filepath) {
        res.status(404).json({
          success: false,
          error: {
            code: 'IMAGE_NOT_FOUND',
            message: `Image ${filename} not found`
          }
        });
        return;
      }

      // Determine content type based on file extension
      const ext = filename.toLowerCase().split('.').pop();
      const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';

      // Serve the image file
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      res.sendFile(filepath);

    } catch (error) {
      console.error('❌ Error serving image:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to serve image'
        }
      });
    }
  }

  /**
   * List generated images
   * GET /api/image-branding/images
   */
  public static async listImages(req: Request, res: Response): Promise<void> {
    try {
      const images = geminiGenImageService.getSavedImages();
      
      res.status(200).json({
        success: true,
        data: {
          count: images.length,
          images: images.map(img => ({
            filename: img.filename,
            created: img.created,
            size: img.size,
            viewUrl: `http://localhost:3000/api/image-branding/view/${img.filename}`
          }))
        }
      });

    } catch (error) {
      console.error('❌ Error listing images:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to list images'
        }
      });
    }
  }
}