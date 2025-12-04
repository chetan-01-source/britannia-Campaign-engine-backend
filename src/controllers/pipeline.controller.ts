import { Request, Response } from 'express';
import { pipelineService } from '../services/pipeline.service';
import { asyncHandler } from '../middlewares/error.middleware';
import { ProcessedChunk } from '../utils/text-preprocessor.utils';

export const PipelineController = {
  // Trigger pipeline manually
  triggerPipeline: asyncHandler(async (req: Request, res: Response) => {
    console.log("🔄 Manual pipeline trigger requested");
    
    const result = await pipelineService.execute();
    
    res.json({
      success: true,
      message: `Pipeline executed successfully. Processed ${result.products.length} products into ${result.chunks.length} chunks${result.embeddings ? ` with ${result.embeddings.length} embeddings` : ''}${result.pineconeResult ? `, stored ${result.pineconeResult.vectorIds.length} in Pinecone (${result.pineconeResult.skipped || 0} duplicates skipped)` : ''}`,
      data: {
        totalProducts: result.products.length,
        totalChunks: result.chunks.length,
        totalEmbeddings: result.embeddings?.length || 0,
        database: {
          configured: true,
          saved: result.dbResult?.saved || 0,
          updated: result.dbResult?.updated || 0,
          failed: result.dbResult?.failed || 0
        },
        pinecone: {
          configured: !!result.pineconeResult,
          success: result.pineconeResult?.success || false,
          vectorsStored: result.pineconeResult?.vectorIds.length || 0,
          failed: result.pineconeResult?.failed || 0,
          skipped: result.pineconeResult?.skipped || 0
        },
        products: result.products.slice(0, 5), // Return first 5 products as sample
        chunks: result.chunks.slice(0, 10), // Return first 10 chunks as sample
        embeddings: result.embeddings?.slice(0, 3) // Return first 3 embeddings as sample
      },
      timestamp: new Date().toISOString()
    });
  }),

  // Get pipeline status
  getPipelineStatus: asyncHandler(async (req: Request, res: Response) => {
    const status = pipelineService.getStatus();
    
    res.json({
      success: true,
      pipeline: {
        isRunning: status.isRunning,
        nextRun: status.nextRun,
        schedule: "Every 12 hours"
      },
      timestamp: new Date().toISOString()
    });
  }),

  // Start pipeline scheduler
  startPipeline: asyncHandler(async (req: Request, res: Response) => {
    pipelineService.start();
    
    res.json({
      success: true,
      message: "Pipeline scheduler started",
      nextRun: "Next run in ~12 hours",
      timestamp: new Date().toISOString()
    });
  }),

  // Stop pipeline scheduler
  stopPipeline: asyncHandler(async (req: Request, res: Response) => {
    pipelineService.stop();
    
    res.json({
      success: true,
      message: "Pipeline scheduler stopped",
      timestamp: new Date().toISOString()
    });
  }),

  // Get text preprocessing info
  getPreprocessingInfo: asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      preprocessing: {
        enabled: true,
        description: "Combines product name, category, description, and features into optimized chunks",
        settings: {
          maxChunkSize: 512,
          minChunkSize: 50
        },
        purpose: "Prepares product data for embedding generation and vector storage"
      },
      timestamp: new Date().toISOString()
    });
  })
};