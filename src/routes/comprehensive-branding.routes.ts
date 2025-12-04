import { Router } from 'express';
import { ComprehensiveBrandingController } from '../controllers/comprehensive-branding.controller';

const router = Router();

/**
 * @route POST /api/branding/generate
 * @description Generate comprehensive branding content with AI caption and FreePik image
 * @body { productName: string, tone: string, platform?: string, flavor?: string, style?: string }
 */
router.post('/generate', ComprehensiveBrandingController.generateComprehensiveBranding);

/**
 * @route GET /api/branding/list
 * @description Get all branding entries
 * @query { limit?: number }
 */
router.get('/list', ComprehensiveBrandingController.getAllBrandings);

/**
 * @route GET /api/branding/:id
 * @description Get branding by ID
 * @param { id: string }
 */
router.get('/:id', ComprehensiveBrandingController.getBrandingById);

export default router;