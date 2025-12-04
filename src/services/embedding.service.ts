import { voyage } from '../config/llm';
import { ProcessedChunk } from '../utils/text-preprocessor.utils';

export interface EmbeddingResult {
  chunkId: string;
  text: string;
  embedding: number[];
  productName: string;
  category: string;
}

export class EmbeddingService {
  private static instance: EmbeddingService;

  public static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  /**
   * Generate embeddings for processed chunks
   */
  public async generateEmbeddings(chunks: ProcessedChunk[]): Promise<EmbeddingResult[]> {
    if (!chunks || chunks.length === 0) {
      console.log('⚠️  No chunks provided for embedding generation');
      return [];
    }

    try {
      console.log(`🧠 Generating embeddings for ${chunks.length} chunks...`);
      
      // Extract text from chunks for batch processing
      const texts = chunks.map(chunk => chunk.text);
      
      // Generate embeddings using VoyageAI
      const response = await voyage.embed({
        input: texts,
        model: 'voyage-2'
      });

      if (!response.data || response.data.length !== chunks.length) {
        throw new Error('Embedding response does not match input chunks');
      }

      // Validate all embeddings are present
      for (let i = 0; i < response.data.length; i++) {
        if (!response.data[i].embedding) {
          throw new Error(`Missing embedding at index ${i}`);
        }
      }

      // Map embeddings back to chunks
      const embeddingResults: EmbeddingResult[] = chunks.map((chunk, index) => ({
        chunkId: chunk.id,
        text: chunk.text,
        embedding: response.data![index].embedding!,
        productName: chunk.productName,
        category: chunk.category
      }));

      console.log(`✅ Successfully generated ${embeddingResults.length} embeddings`);
      return embeddingResults;
      
    } catch (error) {
      console.error('❌ Failed to generate embeddings:', error);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if VoyageAI is available
   */
  public isAvailable(): boolean {
    return !!process.env.VOYAGE_API_KEY;
  }
}

export const embeddingService = EmbeddingService.getInstance();