import { Router } from 'express';
import { RateLimitController } from '../controllers/rate-limit.controller';

const router = Router();

/**
 * @route GET /api/rate-limit/status
 * @desc Get current rate limit status and queue information
 * @access Public
 */
router.get('/status', RateLimitController.getRateLimitStatus);

/**
 * @route POST /api/rate-limit/clear-queue
 * @desc Clear the request queue (emergency use)
 * @access Public
 */
router.post('/clear-queue', RateLimitController.clearQueue);

export { router as rateLimitRoutes };