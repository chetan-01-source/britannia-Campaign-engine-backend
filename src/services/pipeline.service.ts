import * as cron from 'node-cron';
import { scraperService } from './scraper.service';
import { embeddingService, EmbeddingResult } from './embedding.service';
import { pineconeService } from './pinecone.service';
import { ProductService } from './product.service';
import { Product } from '../types/product.types';
import { TextPreprocessor, ProcessedChunk } from '../utils/text-preprocessor.utils';
import { PipelineUtils } from '../utils/pipeline.utils';

export class PipelineService {
  private static instance: PipelineService;
  private cronJob: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;

  public static getInstance(): PipelineService {
    if (!PipelineService.instance) {
      PipelineService.instance = new PipelineService();
    }
    return PipelineService.instance;
  }

  /**
   * Execute the complete data pipeline
   * 1. Scrape Britannia products
   * 2. Store products in MongoDB
   * 3. Preprocess text for embeddings
   * 4. Store data (S3 or local)
   * 5. Generate embeddings
   * 6. Store embeddings in Pinecone
   * 7. Handle duplicates (TODO)
   */
  public async execute(): Promise<{ products: Product[]; chunks: ProcessedChunk[]; embeddings?: EmbeddingResult[]; pineconeResult?: { success: boolean; vectorIds: string[]; failed: number; skipped: number }; dbResult?: { saved: number; updated: number; failed: number } }> {
    try {
      console.log('🔄 Starting data pipeline execution...');
      
      // Step 1: Scrape products
      console.log('📊 Step 1: Scraping Britannia products...');
      const products = await scraperService.scrapeBritanniaProducts();
      
      // Validate scraped data
      const validation = PipelineUtils.validateProducts(products);
      if (!validation.isValid) {
        throw new Error(`Invalid product data: ${validation.errors.join(', ')}`);
      }
      
      // Step 2: Store products in MongoDB
      console.log('💾 Step 2: Storing products in MongoDB...');
      const dbResult = await ProductService.saveProducts(products);
      console.log(`✅ MongoDB storage: ${dbResult.saved} saved, ${dbResult.skipped} skipped, ${dbResult.errors.length} failed`);
      
      // Step 3: Preprocess text for embeddings
      console.log('🔤 Step 3: Preprocessing text for embeddings...');
      const chunks = TextPreprocessor.processProducts(products);
      
      // Step 4: Store data (S3 or local backup)
      console.log('📁 Step 4: Storing backup data and processed chunks...');
      await PipelineUtils.storeData(products, chunks);
      
      // Step 5: Generate embeddings
      let embeddings: EmbeddingResult[] | undefined;
      let pineconeResult: { success: boolean; vectorIds: string[]; failed: number } | undefined;
      
      if (embeddingService.isAvailable()) {
        console.log('🧠 Step 5: Generating embeddings...');
        embeddings = await embeddingService.generateEmbeddings(chunks);
        console.log(`✅ Generated ${embeddings.length} embeddings`);
        
        // Step 6: Store embeddings in Pinecone
        if (pineconeService.isAvailable()) {
          console.log('📌 Step 6: Storing embeddings in Pinecone...');
          
          // Extract embedding vectors from EmbeddingResult
          const embeddingVectors = embeddings.map(result => result.embedding);
          
          pineconeResult = await pineconeService.storeEmbeddings(chunks, embeddingVectors);
          
          if (pineconeResult.success) {
            console.log(`✅ Successfully stored ${pineconeResult.vectorIds.length} embeddings in Pinecone`);
            if (pineconeResult.failed > 0) {
              console.warn(`⚠️  ${pineconeResult.failed} embeddings failed to store`);
            }
          } else {
            console.error(`❌ Failed to store embeddings in Pinecone: ${pineconeResult.failed} failed`);
          }
        } else {
          console.log('⚠️  Step 6: Skipping Pinecone storage - Pinecone not configured');
        }
      } else {
        console.log('⚠️  Step 5: Skipping embeddings - VoyageAI not configured');
        console.log('⚠️  Step 6: Skipping Pinecone storage - No embeddings to store');
      }
      
      // TODO: Step 7 - Handle duplicates
      console.log('🔍 Step 7: Handling duplicates... (TODO)');
      
      const embeddingCount = embeddings ? embeddings.length : 0;
      const pineconeCount = pineconeResult ? pineconeResult.vectorIds.length : 0;
      
      console.log(`✅ Pipeline execution completed!`);
      console.log(`   📦 Products scraped: ${products.length}`);
      console.log(`   💾 Products saved to DB: ${dbResult.saved + dbResult.skipped}`);
      console.log(`   📝 Text chunks: ${chunks.length}`);
      console.log(`   🧠 Embeddings: ${embeddingCount}`);
      console.log(`   📌 Stored in Pinecone: ${pineconeCount}`);
      
      return { 
        products, 
        chunks, 
        embeddings, 
        dbResult: {
          saved: dbResult.saved,
          updated: dbResult.skipped,
          failed: dbResult.errors.length
        },
        pineconeResult: pineconeResult ? {
          success: pineconeResult.success,
          vectorIds: pineconeResult.vectorIds,
          failed: pineconeResult.failed,
          skipped: (pineconeResult as any).skipped || 0
        } : undefined 
      };
      
    } catch (error) {
      console.error('❌ Pipeline execution failed:', error);
      throw error;
    }
  }

  /**
   * Start the cron scheduler (runs every 12 hours)
   */
  public start(): void {
    if (this.cronJob) {
      console.log('⚠️  Pipeline scheduler is already running');
      return;
    }

    console.log('🕐 Starting pipeline scheduler - runs every 12 hours');
    
    // Cron pattern: '0 */12 * * *' means every 12 hours
    this.cronJob = cron.schedule('0 */12 * * *', async () => {
      console.log('⏰ Cron job triggered - Starting scheduled pipeline execution');
      await this.execute();
    }, {
      timezone: 'UTC'
    });

    this.cronJob.start();
    this.isRunning = true;
    console.log('✅ Pipeline scheduler started successfully');
  }

  /**
   * Stop the cron scheduler
   */
  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob.destroy();
      this.cronJob = null;
      this.isRunning = false;
      console.log('🛑 Pipeline scheduler stopped');
    } else {
      console.log('⚠️  Pipeline scheduler is not running');
    }
  }

  /**
   * Get scheduler status
   */
  public getStatus(): { isRunning: boolean; nextRun?: string } {
    return {
      isRunning: this.isRunning,
      nextRun: this.isRunning ? 'Next run in ~12 hours' : undefined
    };
  }

  /**
   * Run pipeline manually (for testing)
   */
  public async runManually(): Promise<{ products: Product[]; chunks: ProcessedChunk[]; embeddings?: EmbeddingResult[]; pineconeResult?: { success: boolean; vectorIds: string[]; failed: number; skipped: number }; dbResult?: { saved: number; updated: number; failed: number } }> {
    console.log('🚀 Manual pipeline execution triggered');
    return await this.execute();
  }
}

export const pipelineService = PipelineService.getInstance();