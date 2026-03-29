import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { brandingService } from '../services/branding.service';
import { setupSSEResponse, sendSSEEvent, startHeartbeat, cleanupSSE } from '../utils/sse';
import { SSEEventType, SSEEventData } from '../types/sse.types';
import { logger } from '../config/logger';

export class ComprehensiveBrandingController {
  /**
   * Generate comprehensive branding content with AI caption and FreePik image
   * POST /api/branding/generate
   */
  public static async generateComprehensiveBranding(req: Request, res: Response): Promise<void> {
    const correlationId = uuidv4();
    logger.info({ correlationId, method: req.method, url: req.url }, 'Branding generation request received');
    try {
      const { productName, tone, platform, flavor, style } = req.body;

      // Validate required fields
      if (!productName || !tone) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Missing required fields: productName and tone are required.'
          }
        });
        return;
      }

      // Validate tone
      const validTones = ['youth', 'family', 'premium', 'health', 'traditional', 'professional'];
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

      // Validate platform if provided
      if (platform) {
        const validPlatforms = ['instagram', 'linkedin', 'email', 'facebook', 'twitter'];
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

      // Check if services are available
      if (!brandingService.isAvailable()) {
        res.status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Branding services not available. Required APIs not configured.'
          }
        });
        return;
      }

      logger.info({ correlationId, productName, tone, platform: platform || 'instagram', style: style || 'minimalist' }, 'Starting branding generation');

      // Generate comprehensive branding content
      const result = await brandingService.generateComprehensiveBranding({
        productName: productName.trim(),
        tone: tone.toLowerCase(),
        platform: platform?.toLowerCase() || 'instagram',
        flavor: flavor?.trim(),
        style: style?.toLowerCase() || 'minimalist'
      }, correlationId);

      if (result.success && result.data) {
        res.status(200).json({
          success: true,
          message: 'Comprehensive branding content generated successfully',
          data: result.data,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'GENERATION_FAILED',
            message: result.error || 'Failed to generate comprehensive branding content'
          }
        });
      }

    } catch (error) {
      logger.error({ correlationId, err: error }, 'Comprehensive branding generation error');
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }

  /**
   * Generate comprehensive branding with SSE streaming progress
   * POST /api/branding/generate/stream
   */
  public static async generateComprehensiveBrandingStream(req: Request, res: Response): Promise<void> {
    const correlationId = uuidv4();
    const { productName, tone, platform, flavor, style } = req.body;

    // Validate required fields
    if (!productName || !tone) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Missing required fields: productName and tone are required.' }
      });
      return;
    }

    // Validate tone
    const validTones = ['youth', 'family', 'premium', 'health', 'traditional', 'professional'];
    if (!validTones.includes(tone.toLowerCase())) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_TONE', message: `Tone must be one of: ${validTones.join(', ')}` }
      });
      return;
    }

    // Validate platform if provided
    if (platform) {
      const validPlatforms = ['instagram', 'linkedin', 'email', 'facebook', 'twitter'];
      if (!validPlatforms.includes(platform.toLowerCase())) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_PLATFORM', message: `Platform must be one of: ${validPlatforms.join(', ')}` }
        });
        return;
      }
    }

    // Validate style if provided
    if (style) {
      const validStyles = ['minimalist', 'vibrant', 'premium', 'playful'];
      if (!validStyles.includes(style.toLowerCase())) {
        res.status(400).json({
          success: false,
          error: { code: 'INVALID_STYLE', message: `Style must be one of: ${validStyles.join(', ')}` }
        });
        return;
      }
    }

    // Check if services are available
    if (!brandingService.isAvailable()) {
      res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Branding services not available. Required APIs not configured.' }
      });
      return;
    }

    // Set up SSE response
    setupSSEResponse(res);
    const heartbeat = startHeartbeat(res);

    // Track client disconnect via RESPONSE close, not request close.
    // req.on('close') fires when the POST body is fully consumed (immediately),
    // res.on('close') fires when the actual TCP connection drops.
    let aborted = false;
    res.on('close', () => {
      if (!res.writableFinished) {
        // Connection closed before we called res.end() — client disconnected
        aborted = true;
        logger.warn({ correlationId }, 'Client disconnected from SSE stream');
        clearInterval(heartbeat);
      }
    });

    // Send connected event
    sendSSEEvent(res, 'connected', {
      correlationId,
      message: 'Stream connected. Starting branding generation...',
      timestamp: new Date().toISOString()
    });

    try {
      await brandingService.generateComprehensiveBrandingStreaming(
        {
          productName: productName.trim(),
          tone: tone.toLowerCase(),
          platform: platform?.toLowerCase() || 'instagram',
          flavor: flavor?.trim(),
          style: style?.toLowerCase() || 'minimalist'
        },
        (event: SSEEventType, data: SSEEventData) => {
          if (!aborted) {
            sendSSEEvent(res, event, data);
          }
        },
        correlationId
      );
    } catch (error) {
      if (!aborted) {
        sendSSEEvent(res, 'error', {
          code: 'GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'An unexpected error occurred'
        });
      }
    } finally {
      if (!aborted) {
        // Send a done event so the client knows the stream is finished
        sendSSEEvent(res, 'done', { message: 'Stream complete', timestamp: new Date().toISOString() });
        cleanupSSE(res, heartbeat);
      }
    }
  }

  /**
   * Get all branding entries with pagination
   * GET /api/branding/list?limit=10&skip=0&page=1
   */
  public static async getAllBrandings(req: Request, res: Response): Promise<void> {
    try {
      // Parse pagination parameters
      const limit = Math.min(parseInt(req.query.limit as string) || 10, 100); // Max 100 items per page
      let skip = parseInt(req.query.skip as string) || 0;
      
      // Support page-based pagination as alternative to skip
      const page = parseInt(req.query.page as string);
      if (page && page > 0) {
        skip = (page - 1) * limit;
      }
      
      // Validate pagination parameters
      if (limit < 1) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_LIMIT',
            message: 'Limit must be a positive number (max 100)'
          }
        });
        return;
      }
      
      if (skip < 0) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SKIP',
            message: 'Skip must be a non-negative number'
          }
        });
        return;
      }
      
      const result = await brandingService.getAllBrandings({ limit, skip });
      
      if (result.success) {
        res.status(200).json({
          success: true,
          data: result.data,
          totalCount: result.totalCount,
          pagination: result.pagination,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'FETCH_FAILED',
            message: result.error || 'Failed to fetch branding entries'
          }
        });
      }

    } catch (error) {
      logger.error({ err: error }, 'Error fetching brandings');
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }

  /**
   * Get branding by ID
   * GET /api/branding/:id
   */
  public static async getBrandingById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_REQUEST',
            message: 'Branding ID is required'
          }
        });
        return;
      }

      const result = await brandingService.getBrandingById(id);
      
      if (result.success && result.data) {
        res.status(200).json({
          success: true,
          data: result.data,
          timestamp: new Date().toISOString()
        });
      } else if (result.error === 'Branding not found') {
        res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Branding entry not found'
          }
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'FETCH_FAILED',
            message: result.error || 'Failed to fetch branding entry'
          }
        });
      }

    } catch (error) {
      logger.error({ err: error }, 'Error fetching branding by ID');
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred'
        }
      });
    }
  }
}