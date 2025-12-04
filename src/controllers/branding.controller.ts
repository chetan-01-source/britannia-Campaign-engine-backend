import { Request, Response } from 'express';
import { brandingService } from '../services/branding.service';
import { BrandingRequest } from '../types/branding.types';
import { asyncHandler } from '../middlewares/error.middleware';
import { getBrandingOptions } from '../templates';

export const BrandingController = {
  /**
   * Generate branding content
   */
  generateBranding: asyncHandler(async (req: Request, res: Response) => {
    try {
      const { productName, tone, platform, flavor } = req.body;

      // Validate required fields
      if (!productName || !tone || !platform) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: productName, tone, and platform are required',
          required: {
            productName: 'string (required)',
            tone: 'youth | professional | family (required)',
            platform: 'instagram | linkedin | email (required)',
            flavor: 'string (optional)'
          }
        });
      }

      // Validate enum values
      const validTones = ['youth', 'professional', 'family'];
      const validPlatforms = ['instagram', 'linkedin', 'email'];

      if (!validTones.includes(tone)) {
        return res.status(400).json({
          success: false,
          message: `Invalid tone. Must be one of: ${validTones.join(', ')}`
        });
      }

      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({
          success: false,
          message: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}`
        });
      }

      // Check if branding service is available
      if (!brandingService.isAvailable()) {
        return res.status(503).json({
          success: false,
          message: 'Branding service not available. Gemini API key not configured.'
        });
      }

      console.log('🎨 Branding request:', { productName, tone, platform, flavor });

      const brandingRequest: BrandingRequest = {
        productName: productName.trim(),
        tone,
        platform,
        flavor: flavor?.trim()
      };

      const result = await brandingService.generateBranding(brandingRequest);

      res.json({
        success: true,
        message: 'Branding content generated successfully',
        data: result.data,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Branding generation failed:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to generate branding content',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  }),

  /**
   * Get branding service status
   */
  getStatus: asyncHandler(async (req: Request, res: Response) => {
    try {
      const isAvailable = brandingService.isAvailable();
      
      res.json({
        success: true,
        data: {
          brandingServiceAvailable: isAvailable,
          supportedTones: ['youth', 'professional', 'family'],
          supportedPlatforms: ['instagram', 'linkedin', 'email'],
          features: {
            aiGeneration: isAvailable,
            productContextRetrieval: true,
            customFlavors: true,
            multiPlatformSupport: true
          }
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Failed to get branding status:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to get branding service status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }),

  /**
   * Search for similar products using embeddings
   */
  searchSimilar: asyncHandler(async (req: Request, res: Response) => {
    try {
      const { productName, limit = 2 } = req.body;

      // Validate required fields
      if (!productName) {
        return res.status(400).json({
          success: false,
          message: 'Missing required field: productName',
          required: {
            productName: 'string (required)',
            limit: 'number (optional, default: 5, max: 20)'
          }
        });
      }

      // Validate limit
      const limitNum = parseInt(limit.toString(), 10);
      if (limitNum > 20) {
        return res.status(400).json({
          success: false,
          message: 'Limit cannot exceed 20'
        });
      }

      console.log('🔍 Similar product search request:', { productName, limit: limitNum });

      // Check if services are available
      if (!brandingService.isAvailable()) {
        return res.status(503).json({
          success: false,
          message: 'Branding service not available. Required services not configured.'
        });
      }

      // Use the branding service's getProductContext method to get similar products
      const similarProducts = await (brandingService as any).getProductContext(productName.trim());

      res.json({
        success: true,
        message: `Found ${similarProducts.length} similar products`,
        data: {
          query: productName,
          similarProducts: similarProducts.slice(0, limitNum),
          total: similarProducts.length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Similar product search failed:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to search similar products',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  }),

  /**
   * Get available options for branding
   */
  getOptions: asyncHandler(async (req: Request, res: Response) => {
    try {
      const options = getBrandingOptions();
      
      res.json({
        success: true,
        data: {
          ...options,
          usage: {
            endpoint: 'POST /api/branding/generate',
            method: 'POST',
            requiredFields: ['productName', 'tone', 'platform'],
            optionalFields: ['flavor'],
            example: {
              productName: 'Good Day Butter Cookies',
              tone: 'youth',
              platform: 'instagram',
              flavor: 'sweet'
            }
          }
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Failed to get branding options:', error);
      
      res.status(500).json({
        success: false,
        message: 'Failed to get branding options',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  })
};