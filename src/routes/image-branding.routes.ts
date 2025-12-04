import express from 'express';
import { ImageBrandingController } from '../controllers/image-branding.controller';

const router = express.Router();

/**
 * @route POST /api/image-branding/generate
 * @desc Generate branding image for a product using FreePik AI
 * @body { productName: string, platform: string, tone: string, flavor?: string, style?: string }
 */
router.post('/generate', ImageBrandingController.generateImage);

/**
 * @route GET /api/image-branding/options  
 * @desc Get available options for image branding
 */
router.get('/options', ImageBrandingController.getOptions);

/**
 * @route GET /api/image-branding/status
 * @desc Check FreePik image branding service status
 */
router.get('/status', ImageBrandingController.getStatus);

/**
 * @route GET /api/image-branding/images
 * @desc List all generated images
 */
router.get('/images', ImageBrandingController.listImages);

/**
 * @route GET /api/image-branding/view/:filename
 * @desc View a specific generated image
 * @param filename - The filename of the image to view
 */
router.get('/view/:filename', ImageBrandingController.viewImage);

export { router as imageBrandingRoutes };
