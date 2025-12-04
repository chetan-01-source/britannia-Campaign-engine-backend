import { Request, Response } from 'express';
import { embeddingService } from '../services/embedding.service';
import { pineconeService } from '../services/pinecone.service';
import { asyncHandler } from '../middlewares/error.middleware';

export const EmbeddingController = {
  // Generate embedding and store in Pinecone
  generateEmbedding: asyncHandler(async (req: Request, res: Response) => {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Text is required',
        error: 'Please provide text in the request body'
      });
    }

    if (!embeddingService.isAvailable()) {
      return res.status(500).json({
        success: false,
        message: 'VoyageAI API key not configured',
        error: 'VOYAGE_API_KEY environment variable is missing'
      });
    }


    console.log('🧠 Generating embedding and storing in Pinecone...');
    
    // Create a temporary chunk from the text
    const chunk = {
      id: `manual_${Date.now()}`,
      text: text,
      productName: 'Manual Input',
      category: 'Test',
      metadata: {
        createdAt: new Date()
      }
    };
    
    // Generate embedding
    const results = await embeddingService.generateEmbeddings([chunk]);
    const result = results[0];
    
    if (!result.embedding) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate embedding',
        error: 'No embedding returned from VoyageAI'
      });
    }

    
    res.json({
      success: true,
      message: 'Embedding generated and stored successfully',
      data: {
        chunkId: chunk.id,
        textLength: text.length,
        embeddingDimensions: result.embedding.length,
        timestamp: new Date().toISOString()
      }
    });
  })
};