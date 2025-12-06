import { Request, Response } from 'express';
import { rateLimitedImageService } from '../services/rate-limited-image.service';

export class RateLimitController {
  /**
   * Get current rate limit status
   * GET /api/rate-limit/status
   */
  public static async getRateLimitStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = rateLimitedImageService.getRateLimitStatus();
      const estimatedWait = rateLimitedImageService.getEstimatedWaitTime();
      
      res.json({
        success: true,
        data: {
          rateLimitStatus: {
            requestsUsed: status.requestsInCurrentWindow,
            maxRequestsPerMinute: status.maxRequestsPerMinute,
            queueLength: status.queueLength,
            canMakeRequest: status.canMakeRequest,
            nextAvailableIn: status.nextAvailableIn,
            estimatedWaitTime: estimatedWait
          },
          analysis: {
            utilizationPercentage: Math.round((status.requestsInCurrentWindow / status.maxRequestsPerMinute) * 100),
            isAtCapacity: status.requestsInCurrentWindow >= status.maxRequestsPerMinute,
            queueStatus: status.queueLength > 0 ? 'busy' : 'idle',
            recommendation: this.getRateLimitRecommendation(status, estimatedWait)
          },
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('❌ Error getting rate limit status:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_STATUS_ERROR',
          message: 'Failed to get rate limit status'
        }
      });
    }
  }

  /**
   * Clear the request queue (emergency endpoint)
   * POST /api/rate-limit/clear-queue
   */
  public static async clearQueue(req: Request, res: Response): Promise<void> {
    try {
      const statusBefore = rateLimitedImageService.getRateLimitStatus();
      rateLimitedImageService.clearQueue();
      const statusAfter = rateLimitedImageService.getRateLimitStatus();
      
      res.json({
        success: true,
        data: {
          message: 'Request queue cleared successfully',
          before: {
            queueLength: statusBefore.queueLength
          },
          after: {
            queueLength: statusAfter.queueLength
          }
        }
      });
    } catch (error) {
      console.error('❌ Error clearing queue:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'QUEUE_CLEAR_ERROR',
          message: 'Failed to clear request queue'
        }
      });
    }
  }

  /**
   * Get rate limit recommendations based on current status
   */
  private static getRateLimitRecommendation(
    status: any, 
    estimatedWait: number
  ): string {
    if (status.requestsInCurrentWindow === 0) {
      return 'Rate limit is fresh - good time to make requests';
    }
    
    if (status.requestsInCurrentWindow >= status.maxRequestsPerMinute) {
      const waitMinutes = Math.ceil(status.nextAvailableIn / 60000);
      return `Rate limit exceeded. Wait ${waitMinutes} minute(s) before next request`;
    }
    
    if (status.queueLength > 5) {
      return `High queue volume (${status.queueLength} requests). Consider retrying later`;
    }
    
    if (status.queueLength > 0) {
      return `${status.queueLength} requests queued. Estimated wait: ${Math.ceil(estimatedWait / 1000)}s`;
    }
    
    const remainingRequests = status.maxRequestsPerMinute - status.requestsInCurrentWindow;
    return `${remainingRequests} requests remaining in current window`;
  }
}