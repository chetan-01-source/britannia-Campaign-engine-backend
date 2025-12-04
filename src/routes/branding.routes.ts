import { Router } from 'express';
import { BrandingController } from '../controllers/branding.controller';

const router = Router();

/**
 * @route POST /api/branding/generate
 * @desc Generate branding content for a product
 * @body {
 *   productName: string,
 *   tone: 'youth' | 'professional' | 'family',
 *   platform: 'instagram' | 'linkedin' | 'email',
 *   flavor?: string
 * }
 */
router.post('/generate', BrandingController.generateBranding);

/**
 * @route POST /api/brandinzg/search-similar
 * @desc Search for similar products using embeddings
 * @body {
 *   productName: string,
 *   limit?: number (default: 5, max: 20)
 * }
 */
router.post('/search-similar', BrandingController.searchSimilar);

/**
 * @route GET /api/branding/status
 * @desc Get branding service status
 */
router.get('/status', BrandingController.getStatus);

/**
 * @route GET /api/branding/options
 * @desc Get available tones, platforms, and example flavors
 */
router.get('/options', BrandingController.getOptions);

export { router as brandingRoutes };