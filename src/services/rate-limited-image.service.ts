import { ImageBrandingRequest, ImageBrandingResponse } from '../types/image-branding.types';
import { GeminiGenImageService } from './gemini-genai.service';

interface QueuedRequest {
  timestamp: number;
  resolve: (value: ImageBrandingResponse) => void;
  reject: (error: any) => void;
  requestData: ImageBrandingRequest;
  priority: number;
}

/**
 * Rate-limited wrapper for GeminiGen Image Service
 * Ensures 5 requests per minute limit is never exceeded
 */
export class RateLimitedImageService {
  private static instance: RateLimitedImageService;
  private geminiGenService: GeminiGenImageService;
  
  // Rate limiting properties
  private readonly maxRequestsPerMinute = 5;
  private readonly requestWindow = 60 * 1000; // 1 minute in milliseconds
  private requestQueue: QueuedRequest[] = [];
  private requestTimestamps: number[] = [];
  private isProcessingQueue = false;

  private constructor() {
    this.geminiGenService = GeminiGenImageService.getInstance();
    console.log('🚦 Rate-limited image service initialized: 5 requests per minute');
  }

  public static getInstance(): RateLimitedImageService {
    if (!RateLimitedImageService.instance) {
      RateLimitedImageService.instance = new RateLimitedImageService();
    }
    return RateLimitedImageService.instance;
  }

  /**
   * Generate branding image with rate limiting
   */
  public async generateBrandingImage(request: ImageBrandingRequest): Promise<ImageBrandingResponse> {
    console.log('🎨 Rate-limited image generation request for:', request.productName);
    
    if (this.canMakeRequest()) {
      // Can make request immediately
      console.log('✅ Rate limit OK - processing immediately');
      this.addRequestTimestamp();
      
      try {
        return await this.geminiGenService.generateBrandingImage(request);
      } catch (error: any) {
        // Check if it's a rate limit error from the API
        if (this.isRateLimitError(error)) {
          const retryAfter = this.extractRetryAfter(error);
          console.log(`🚦 API rate limit hit! Retry after: ${retryAfter}s`);
          
          // Remove the timestamp we just added since the request failed
          this.requestTimestamps.pop();
          
          // Return user-friendly error for immediate failures
          if (retryAfter > 300) { // More than 5 minutes
            return {
              success: false,
              error: `API rate limit exceeded. Please try again in ${Math.floor(retryAfter / 60)} minutes.`
            };
          }
          
          // For shorter waits, queue the request
          return await this.queueRequest(request);
        }
        throw error;
      }
    } else {
      // Need to queue the request
      console.log('🚦 Rate limit reached - adding to queue');
      return await this.queueRequest(request);
    }
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    return (
      error?.message?.includes('Too Many Requests') ||
      error?.message?.includes('429') ||
      error?.message?.includes('RATE_LIMIT_ERROR') ||
      error?.response?.status === 429
    );
  }

  /**
   * Extract retry_after value from rate limit error
   */
  private extractRetryAfter(error: any): number {
    try {
      // Check various possible locations for retry_after
      const retryAfter = 
        error?.response?.data?.detail?.retry_after ||
        error?.response?.data?.retry_after ||
        error?.response?.headers?.['retry-after'] ||
        error?.response?.headers?.['Retry-After'] ||
        0;
      
      return parseInt(retryAfter.toString(), 10) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Extract retry_after from error message or response
   */
  private getRetryAfterTime(error: any): number {
    try {
      // Try to extract retry_after from error message
      const message = error?.message || '';
      const retryMatch = message.match(/retry_after['":\s]+(\d+)/i);
      if (retryMatch) {
        return parseInt(retryMatch[1]) * 1000; // Convert to milliseconds
      }
      
      // Default fallback based on our rate limit window
      return this.getNextAvailableTime() || 60000; // 1 minute default
    } catch {
      return 60000; // 1 minute fallback
    }
  }

  /**
   * Rate limiting helper methods
   */
  private cleanOldTimestamps(): void {
    const now = Date.now();
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.requestWindow
    );
  }

  private canMakeRequest(): boolean {
    this.cleanOldTimestamps();
    return this.requestTimestamps.length < this.maxRequestsPerMinute;
  }

  private addRequestTimestamp(): void {
    this.requestTimestamps.push(Date.now());
  }

  private getNextAvailableTime(): number {
    this.cleanOldTimestamps();
    if (this.requestTimestamps.length < this.maxRequestsPerMinute) {
      return 0; // Can make request now
    }
    
    // Calculate when the oldest request will be outside the window
    const oldestRequest = this.requestTimestamps[0];
    const nextAvailable = oldestRequest + this.requestWindow;
    return Math.max(0, nextAvailable - Date.now());
  }

  /**
   * Add request to queue and return a promise
   */
  private async queueRequest(requestData: ImageBrandingRequest): Promise<ImageBrandingResponse> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        timestamp: Date.now(),
        resolve,
        reject,
        requestData,
        priority: 1 // Normal priority
      });
      
      // Sort queue by timestamp (FIFO)
      this.requestQueue.sort((a, b) => a.timestamp - b.timestamp);
      
      console.log(`📋 Request queued. Position: ${this.requestQueue.length}`);
      this.logRateLimitStatus();
      
      // Start processing queue if not already running
      this.processQueue().catch(error => {
        console.error('❌ Queue processing error:', error);
      });
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    console.log(`🚦 Processing queue with ${this.requestQueue.length} pending requests`);

    while (this.requestQueue.length > 0) {
      const waitTime = this.getNextAvailableTime();
      
      if (waitTime > 0) {
        console.log(`⏳ Rate limit: waiting ${Math.ceil(waitTime / 1000)}s before next request`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const queueItem = this.requestQueue.shift();
      if (!queueItem) break;

      try {
        this.addRequestTimestamp();
        console.log(`🚀 Processing queued request (${this.requestTimestamps.length}/5 in current window)`);
        this.logRateLimitStatus();
        
        const result = await this.geminiGenService.generateBrandingImage(queueItem.requestData);
        queueItem.resolve(result);
        
        console.log(`✅ Queued request completed successfully`);
      } catch (error) {
        // Check if it's a rate limit error
        if (this.isRateLimitError(error)) {
          console.log(`🚦 API rate limit hit during queue processing - requeueing request`);
          
          // Remove the timestamp we just added since the request failed
          this.requestTimestamps.pop();
          
          // Re-queue this request at the front
          this.requestQueue.unshift(queueItem);
          
          // Wait for the retry_after time or default wait
          const retryWait = this.getRetryAfterTime(error);
          console.log(`⏰ Waiting ${Math.ceil(retryWait / 1000)}s before retry (API retry_after)`);
          await new Promise(resolve => setTimeout(resolve, retryWait));
          
          continue; // Try again
        } else {
          console.error('❌ Queued request failed:', error);
          queueItem.reject(error);
        }
      }
    }

    this.isProcessingQueue = false;
    console.log('✅ Queue processing completed');
  }

  /**
   * Get current rate limit status
   */
  public getRateLimitStatus(): {
    requestsInCurrentWindow: number;
    maxRequestsPerMinute: number;
    queueLength: number;
    canMakeRequest: boolean;
    nextAvailableIn: number;
  } {
    this.cleanOldTimestamps();
    return {
      requestsInCurrentWindow: this.requestTimestamps.length,
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      queueLength: this.requestQueue.length,
      canMakeRequest: this.canMakeRequest(),
      nextAvailableIn: this.getNextAvailableTime()
    };
  }

  /**
   * Log rate limit status for monitoring
   */
  public logRateLimitStatus(): void {
    const status = this.getRateLimitStatus();
    console.log('📊 Rate Limit Status:', {
      used: `${status.requestsInCurrentWindow}/${status.maxRequestsPerMinute}`,
      queue: status.queueLength,
      canRequest: status.canMakeRequest,
      nextAvailable: status.nextAvailableIn > 0 ? `${Math.ceil(status.nextAvailableIn / 1000)}s` : 'now'
    });
  }

  /**
   * Clear the queue (emergency function)
   */
  public clearQueue(): void {
    console.log(`🗑️ Clearing queue with ${this.requestQueue.length} pending requests`);
    this.requestQueue.forEach(item => {
      item.reject(new Error('Request cancelled due to queue clear'));
    });
    this.requestQueue = [];
  }

  /**
   * Check if service is available
   */
  public isAvailable(): boolean {
    return this.geminiGenService.isAvailable();
  }

  /**
   * Get estimated wait time for new request
   */
  public getEstimatedWaitTime(): number {
    if (this.canMakeRequest()) {
      return 0;
    }
    
    const queueWaitTime = this.requestQueue.length * (60 / this.maxRequestsPerMinute) * 1000; // Rough estimate
    const rateLimitWaitTime = this.getNextAvailableTime();
    
    return Math.max(queueWaitTime, rateLimitWaitTime);
  }
}

export const rateLimitedImageService = RateLimitedImageService.getInstance();