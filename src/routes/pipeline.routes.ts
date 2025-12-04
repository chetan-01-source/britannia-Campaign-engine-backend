import { Router } from 'express';
import { PipelineController } from '../controllers/pipeline.controller';

const router = Router();

// Pipeline routes
router.post('/trigger', PipelineController.triggerPipeline);
router.get('/status', PipelineController.getPipelineStatus);
router.get('/preprocessing', PipelineController.getPreprocessingInfo);
router.post('/start', PipelineController.startPipeline);
router.post('/stop', PipelineController.stopPipeline);

export { router as pipelineRoutes };