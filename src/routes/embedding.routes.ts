import { Router } from 'express';
import { EmbeddingController } from '../controllers/embedding.controller';

const router = Router();

// Generate embedding for text
router.post('/generate', EmbeddingController.generateEmbedding);

export { router as embeddingRoutes };