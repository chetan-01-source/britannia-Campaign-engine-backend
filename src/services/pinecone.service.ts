import { pinecone, index } from '../config/pineconeClient';
import { ProcessedChunk } from '../utils/text-preprocessor.utils';

export interface PineconeVector {
  id: string;
  values: number[];
  metadata: {
    text: string;
    productName: string;
    category: string;
    chunkId: string;
    createdAt: string;
  };
}

export class PineconeService {
  private static instance: PineconeService;

  public static getInstance(): PineconeService {
    if (!PineconeService.instance) {
      PineconeService.instance = new PineconeService();
    }
    return PineconeService.instance;
  }

  /**
   * Generate a consistent ID based on chunk content to prevent duplicates
   */
  private generateChunkId(chunk: ProcessedChunk): string {
    // Create hash-like ID based on product name, category, and text content
    const content = `${chunk.productName}_${chunk.category}_${chunk.text}`;
    const hash = content
      .split('')
      .reduce((acc, char) => {
        const charCode = char.charCodeAt(0);
        return ((acc << 5) - acc + charCode) & 0xffffffff;
      }, 0);
    
    return `chunk_${Math.abs(hash)}`;
  }

  /**
   * Check if Pinecone is properly configured
   */
  public isAvailable(): boolean {
    return !!(process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX);
  }

  /**
   * Check if embeddings already exist for given chunks
   */
  public async checkExistingEmbeddings(chunks: ProcessedChunk[]): Promise<{
    existing: string[];
    missing: { chunk: ProcessedChunk; index: number }[];
  }> {
    try {
      if (!this.isAvailable()) {
        throw new Error('Pinecone not configured');
      }

      const chunkIds = chunks.map(chunk => this.generateChunkId(chunk));
      console.log(`🔍 Checking for existing embeddings: ${chunkIds.length} chunks`);

      // Fetch existing vectors by ID
      const fetchResponse = await index.fetch(chunkIds);
      const existingIds = Object.keys(fetchResponse.records || {});
      
      const missing = chunks
        .map((chunk, index) => ({ chunk, index, id: this.generateChunkId(chunk) }))
        .filter(item => !existingIds.includes(item.id))
        .map(item => ({ chunk: item.chunk, index: item.index }));

      console.log(`📊 Duplicate check: ${existingIds.length} existing, ${missing.length} new`);
      
      return {
        existing: existingIds,
        missing
      };
      
    } catch (error) {
      console.error('❌ Failed to check existing embeddings:', error);
      // If check fails, assume all are new to avoid losing data
      return {
        existing: [],
        missing: chunks.map((chunk, index) => ({ chunk, index }))
      };
    }
  }

  /**
   * Store a single embedding vector in Pinecone
   */
  public async storeEmbedding(
    chunk: ProcessedChunk,
    embedding: number[],
    skipDuplicateCheck = false
  ): Promise<{ success: boolean; vectorId: string; skipped?: boolean }> {
    try {
      if (!this.isAvailable()) {
        throw new Error('Pinecone not configured. Missing API key or index name.');
      }

      const vectorId = this.generateChunkId(chunk);
      
      // Check for duplicates unless explicitly skipped
      if (!skipDuplicateCheck) {
        const existing = await this.checkExistingEmbeddings([chunk]);
        if (existing.existing.length > 0) {
          console.log(`⏭️  Skipping duplicate embedding: ${vectorId}`);
          return { success: true, vectorId, skipped: true };
        }
      }
      
      const vector: PineconeVector = {
        id: vectorId,
        values: embedding,
        metadata: {
          text: chunk.text.substring(0, 40960), // Pinecone metadata limit
          productName: chunk.productName,
          category: chunk.category,
          chunkId: chunk.id,
          createdAt: chunk.metadata.createdAt.toISOString()
        }
      };

      await index.upsert([vector]);
      
      console.log(`✅ Successfully stored embedding in Pinecone: ${vectorId}`);
      return { success: true, vectorId };
      
    } catch (error) {
      console.error('❌ Failed to store embedding in Pinecone:', error);
      throw error;
    }
  }

  /**
   * Store multiple embedding vectors in Pinecone (batch operation with duplicate prevention)
   */
  public async storeEmbeddings(
    chunks: ProcessedChunk[],
    embeddings: number[][]
  ): Promise<{ success: boolean; vectorIds: string[]; failed: number; skipped: number }> {
    try {
      if (!this.isAvailable()) {
        throw new Error('Pinecone not configured. Missing API key or index name.');
      }

      if (chunks.length !== embeddings.length) {
        throw new Error('Chunks and embeddings array length mismatch');
      }

      console.log(`📌 Checking for duplicates among ${chunks.length} embeddings...`);
      
      // Check for existing embeddings
      const duplicateCheck = await this.checkExistingEmbeddings(chunks);
      const newChunks = duplicateCheck.missing;
      
      if (newChunks.length === 0) {
        console.log(`⏭️  All ${chunks.length} embeddings already exist, skipping...`);
        return {
          success: true,
          vectorIds: duplicateCheck.existing,
          failed: 0,
          skipped: chunks.length
        };
      }
      
      console.log(`📌 Storing ${newChunks.length} new embeddings in Pinecone (${duplicateCheck.existing.length} duplicates skipped)...`);
      
      const vectors: PineconeVector[] = newChunks.map(({ chunk, index }) => ({
        id: this.generateChunkId(chunk),
        values: embeddings[index],
        metadata: {
          text: chunk.text.substring(0, 40960), // Pinecone metadata limit
          productName: chunk.productName,
          category: chunk.category,
          chunkId: chunk.id,
          createdAt: chunk.metadata.createdAt.toISOString()
        }
      }));

      // Batch upsert (Pinecone handles up to 100 vectors per request)
      const batchSize = 100;
      const vectorIds: string[] = [...duplicateCheck.existing];
      let failed = 0;

      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        try {
          await index.upsert(batch);
          vectorIds.push(...batch.map(v => v.id));
          console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} stored successfully (${batch.length} vectors)`);
        } catch (batchError) {
          console.error(`❌ Failed to store batch ${Math.floor(i / batchSize) + 1}:`, batchError);
          failed += batch.length;
        }
      }

      console.log(`📌 Pinecone storage complete: ${newChunks.length - failed} new, ${duplicateCheck.existing.length} duplicates skipped, ${failed} failed`);
      
      return { 
        success: failed === 0, 
        vectorIds, 
        failed,
        skipped: duplicateCheck.existing.length
      };
      
    } catch (error) {
      console.error('❌ Failed to store embeddings in Pinecone:', error);
      throw error;
    }
  }

  /**
   * Delete embeddings by vector IDs
   */
  public async deleteEmbeddings(vectorIds: string[]): Promise<{ success: boolean }> {
    try {
      if (!this.isAvailable()) {
        throw new Error('Pinecone not configured');
      }

      await index.deleteMany(vectorIds);
      console.log(`🗑️ Deleted ${vectorIds.length} embeddings from Pinecone`);
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to delete embeddings from Pinecone:', error);
      throw error;
    }
  }

  /**
   * Get index statistics
   */
  public async getIndexStats(): Promise<any> {
    try {
      if (!this.isAvailable()) {
        throw new Error('Pinecone not configured');
      }

      const stats = await index.describeIndexStats();
      return stats;
      
    } catch (error) {
      console.error('❌ Failed to get Pinecone index stats:', error);
      throw error;
    }
  }

  /**
   * Clear all embeddings from the index (use with caution)
   */
  public async clearIndex(): Promise<{ success: boolean }> {
    try {
      if (!this.isAvailable()) {
        throw new Error('Pinecone not configured');
      }

      await index.deleteAll();
      console.log('🧹 Cleared all embeddings from Pinecone index');
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to clear Pinecone index:', error);
      throw error;
    }
  }

  /**
   * Search for similar products using vector similarity
   */
  public async searchSimilar(
    queryEmbedding: number[], 
    topK: number = 5,
    filter?: Record<string, any>
  ): Promise<{
    success: boolean;
    matches: Array<{
      id: string;
      score: number;
      metadata?: {
        productName?: string;
        description?: string;
        category?: string;
        slug?: string;
        productUrl?: string;
        text?: string;
      };
    }>;
  }> {
    try {
      if (!this.isAvailable()) {
        throw new Error('Pinecone not configured');
      }

      console.log(`🔍 Searching for ${topK} similar products in Pinecone...`);
      
      const queryRequest = {
        vector: queryEmbedding,
        topK: topK,
        includeValues: false,
        includeMetadata: true,
        ...(filter && { filter })
      };

      const queryResponse = await index.query(queryRequest);
      
      const matches = queryResponse.matches?.map(match => ({
        id: match.id || '',
        score: match.score || 0,
        metadata: {
          productName: match.metadata?.productName as string,
          description: match.metadata?.description as string,
          category: match.metadata?.category as string,
          slug: match.metadata?.slug as string,
          productUrl: match.metadata?.productUrl as string,
          text: match.metadata?.text as string
        }
      })) || [];

      console.log(`✅ Found ${matches.length} similar products with scores: ${matches.map(m => m.score.toFixed(3)).join(', ')}`);
      
      return {
        success: true,
        matches: matches
      };

    } catch (error) {
      console.error('❌ Error searching similar products:', error);
      return {
        success: false,
        matches: []
      };
    }
  }
}

export const pineconeService = PineconeService.getInstance();