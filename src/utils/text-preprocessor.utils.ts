import { Product } from '../types/product.types';

export interface ProcessedChunk {
  id: string;
  productName: string;
  category: string;
  text: string;
  metadata: {
    slug?: string;
    productUrl?: string;
    createdAt: Date;
  };
}

export class TextPreprocessor {
  private static readonly MAX_CHUNK_SIZE = 512;
  private static readonly MIN_CHUNK_SIZE = 50;

  /**
   * Clean text by removing extra whitespace and normalizing
   */
  private static cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Split text into chunks if too long
   */
  private static splitText(text: string): string[] {
    if (text.length <= this.MAX_CHUNK_SIZE) {
      return [text];
    }

    const words = text.split(' ');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const word of words) {
      if (currentChunk.length + word.length + 1 > this.MAX_CHUNK_SIZE) {
        if (currentChunk.length > this.MIN_CHUNK_SIZE) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = word;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + word;
      }
    }

    if (currentChunk.length > this.MIN_CHUNK_SIZE) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Create combined text for a product
   */
  private static createProductText(product: Product): string {
    const parts: string[] = [];
    
    if (product.name) parts.push(product.name);
    if (product.category) parts.push(`Category: ${product.category}`);
    if (product.description) parts.push(product.description);
    if (product.productHighlights?.length) {
      parts.push(`Features: ${product.productHighlights.join(', ')}`);
    }
    
    return parts.join('. ');
  }

  /**
   * Process a single product into text chunks
   */
  public static processProduct(product: Product): ProcessedChunk[] {
    const productId = product.slug || product.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown';
    const productText = this.createProductText(product);
    
    if (!productText || productText.length < this.MIN_CHUNK_SIZE) {
      return [];
    }

    const textChunks = this.splitText(this.cleanText(productText));
    
    return textChunks.map((text, index) => ({
      id: `${productId}-${index}`,
      productName: product.name || 'Unknown Product',
      category: product.category || 'Unknown Category',
      text,
      metadata: {
        slug: product.slug,
        productUrl: product.productUrl,
        createdAt: product.createdAt || new Date()
      }
    }));
  }

  /**
   * Process multiple products
   */
  public static processProducts(products: Product[]): ProcessedChunk[] {
    return products.flatMap(product => {
      try {
        return this.processProduct(product);
      } catch (error) {
        console.warn(`Failed to process product ${product.name}:`, error);
        return [];
      }
    });
  }


}