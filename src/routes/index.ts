import { Router } from 'express';
import { scraperRoutes } from './scraper.routes';
import { pipelineRoutes } from './pipeline.routes';
import { embeddingRoutes } from './embedding.routes';
import { productRoutes } from './product.routes';
import { brandingRoutes } from './branding.routes';
import { imageBrandingRoutes } from './image-branding.routes';
import { rateLimitRoutes } from './rate-limit.routes';
import comprehensiveBrandingRoutes from './comprehensive-branding.routes';

const router = Router();

// Mount routes
router.use('/api/scraper', scraperRoutes);
router.use('/api/pipeline', pipelineRoutes);
router.use('/api/embeddings', embeddingRoutes);
router.use('/api/products', productRoutes);
router.use('/api/branding', comprehensiveBrandingRoutes); // Use comprehensive branding instead
router.use('/api/image-branding', imageBrandingRoutes);
router.use('/api/rate-limit', rateLimitRoutes); // Rate limit monitoring


// Root endpoint
router.get('/', (req, res) => {
  res.json({
    message: "🚀 Britannia Product Scraper API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      health: "/api/health",
      products: {
        list: "/api/products?page=1&limit=20&category=&search=",
        byId: "/api/products/:id",
        categories: "/api/products/categories",
        stats: "/api/products/stats"
      },
      scraper: {
        products: "/api/scraper/products",
        status: "/api/scraper/status"
      },
      pipeline: {
        trigger: "/api/pipeline/trigger",
        status: "/api/pipeline/status",
        start: "/api/pipeline/start",
        stop: "/api/pipeline/stop"
      },
      embeddings: {
        generate: "/api/embeddings/generate"
      },
      branding: {
        generate: "/api/branding/generate - Comprehensive branding with AI caption + Rate-Limited GeminiGen image + MongoDB storage",
        list: "/api/branding/list?limit=50",
        byId: "/api/branding/:id"
      },
      imageBranding: {
        generate: "/api/image-branding/generate - Rate-limited image generation",
        options: "/api/image-branding/options", 
        status: "/api/image-branding/status"
      },
      rateLimit: {
        status: "/api/rate-limit/status - Monitor API rate limits and queue",
        clearQueue: "/api/rate-limit/clear-queue - Emergency queue clearing"
      }
    }
  });
});

export { router as apiRoutes };