import { Product } from '../types/product.types';
import { ProcessedChunk } from './text-preprocessor.utils';
import { replaceInS3, cleanupOldFiles, isS3Available } from './s3';
import * as fs from 'fs';
import * as path from 'path';

export interface PipelineDataStore {
  timestamp: string;
  totalProducts: number;
  totalChunks: number;
  products: Product[];
  processedChunks: ProcessedChunk[];
  metadata: {
    source: string;
    version: string;
    scrapeMethod: string;
    preprocessingEnabled: boolean;
    environment: string;
  };
}

export class PipelineUtils {
  /**
   * Store scraped products and processed chunks (S3 if available, otherwise local file)
   */
  static async storeData(products: Product[], chunks?: ProcessedChunk[]): Promise<void> {
    const dataToStore: PipelineDataStore = {
      timestamp: new Date().toISOString(),
      totalProducts: products.length,
      totalChunks: chunks?.length || 0,
      products: products,
      processedChunks: chunks || [],
      metadata: {
        source: 'britannia-scraper',
        version: '1.0.0',
        scrapeMethod: 'api-dom-hybrid',
        preprocessingEnabled: !!chunks,
        environment: process.env.NODE_ENV || 'development'
      }
    };

    if (isS3Available()) {
      await this.storeInS3(dataToStore);
    } else {
      await this.storeLocally(dataToStore);
    }
  }

  /**
   * Store scraped products in S3 (replace old data)
   */
  private static async storeInS3(dataToStore: PipelineDataStore): Promise<void> {
    try {
      const keyName = `britannia-products.json`;
      
      // Clean up old files first (keep only 3 latest)
      try {
        await cleanupOldFiles('britannia-products/');
      } catch (cleanupError) {
        console.warn('⚠️  Cleanup failed, continuing with upload:', cleanupError);
      }
      
      // Upload new data
      const result = await replaceInS3(keyName, dataToStore);
      console.log(`✅ Successfully stored ${dataToStore.totalProducts} products in S3: ${result.Location}`);
      
    } catch (error) {
      console.error('❌ Failed to store data in S3:', error);
      // Fallback to local storage
      console.log('🔄 Falling back to local storage...');
      await this.storeLocally(dataToStore);
    }
  }

  /**
   * Store scraped products locally as fallback
   */
  private static async storeLocally(dataToStore: PipelineDataStore): Promise<void> {
    try {
      const dataDir = path.join(process.cwd(), 'data');
      
      // Create data directory if it doesn't exist
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const filename = `britannia-products-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const filepath = path.join(dataDir, filename);
      
      await fs.promises.writeFile(filepath, JSON.stringify(dataToStore, null, 2));
      console.log(`✅ Successfully stored ${dataToStore.totalProducts} products locally: ${filepath}`);
      
      // Clean up old local files (keep only 3 latest)
      this.cleanupLocalFiles(dataDir);
      
    } catch (error) {
      console.error('❌ Failed to store data locally:', error);
      throw error;
    }
  }

  /**
   * Clean up old local files
   */
  private static cleanupLocalFiles(dataDir: string): void {
    try {
      const files = fs.readdirSync(dataDir)
        .filter(file => file.startsWith('britannia-products-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(dataDir, file),
          stat: fs.statSync(path.join(dataDir, file))
        }))
        .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

      // Keep only the 3 latest files
      if (files.length > 3) {
        const filesToDelete = files.slice(3);
        filesToDelete.forEach(file => {
          fs.unlinkSync(file.path);
          console.log(`🧹 Cleaned up old file: ${file.name}`);
        });
      }
    } catch (error) {
      console.warn('⚠️  Local cleanup failed:', error);
    }
  }

  /**
   * Create pipeline execution summary
   */
  static createExecutionSummary(products: Product[], chunks: ProcessedChunk[]): object {
    return {
      execution: {
        timestamp: new Date().toISOString(),
        totalProducts: products.length,
        totalChunks: chunks.length,
        avgChunkLength: chunks.length > 0 ? 
          Math.round(chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length) : 0,
        categories: [...new Set(products.map(p => p.category).filter(Boolean))],
        status: 'completed'
      }
    };
  }

  /**
   * Validate pipeline input data
   */
  static validateProducts(products: Product[]): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!Array.isArray(products)) {
      errors.push('Products must be an array');
      return { isValid: false, errors };
    }

    if (products.length === 0) {
      errors.push('Products array cannot be empty');
    }

    products.forEach((product, index) => {
      if (!product.name) {
        errors.push(`Product at index ${index} missing name`);
      }
      if (!product.category) {
        errors.push(`Product at index ${index} missing category`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}