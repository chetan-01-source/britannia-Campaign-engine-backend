import { Router } from 'express';
import { ScraperController } from '../controllers/scraper.controller';

const router = Router();

// Health check
router.get('/health', ScraperController.health);

// Scraper routes
router.get('/products', ScraperController.scrapeProducts);
router.get('/status', ScraperController.getStatus);

export { router as scraperRoutes };