import { Product } from '../types/product.types';
import { ProductModel } from '../models/product.model';
import mongoose from 'mongoose';

export interface PaginationOptions {
  cursor?: string;
  limit: number;
  category?: string;
  search?: string;
}

export interface PaginatedResult {
  products: any[];
  hasNext: boolean;
  nextCursor?: string;
  total: number;
}

/**
 * Service class for handling product data operations
 */
export class ProductService {
  private static instance: ProductService;

  public static getInstance(): ProductService {
    if (!ProductService.instance) {
      ProductService.instance = new ProductService();
    }
    return ProductService.instance;
  }

  /**
   * Get products with limit/skip pagination
   */
  static async getProductsPaginated(params: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
  }) {
    const { page = 1, limit = 20, category, search } = params;
    const skip = (page - 1) * limit;
    
    // Build query
    const query: any = {};
    
    if (category && category.trim()) {
      query.category = { $regex: new RegExp(category.trim(), 'i') };
    }
    
    if (search && search.trim()) {
      const searchTerm = search.trim();
      query.$or = [
        { name: { $regex: new RegExp(searchTerm, 'i') } },
        { description: { $regex: new RegExp(searchTerm, 'i') } },
        { category: { $regex: new RegExp(searchTerm, 'i') } },
        { slug: { $regex: new RegExp(searchTerm, 'i') } }
      ];
    }
    

    
    // Get total count for pagination info
    const total = await ProductModel.countDocuments(query);
    
    // Get products
    const products = await ProductModel
      .find(query)
      .sort({ createdAt: -1 }) // Latest first
      .skip(skip)
      .limit(limit)
      .lean();
    
    const totalPages = Math.ceil(total / limit);
    
    return {
      products,
      pagination: {
        currentPage: page,
        totalPages,
        total,
        limit
      }
    };
  }

  /**
   * Save products to database with duplicate handling
   */
  static async saveProducts(products: Product[]): Promise<{
    saved: number;
    skipped: number;
    errors: string[];
  }> {
    const result = {
      saved: 0,
      skipped: 0,
      errors: [] as string[]
    };

    for (const product of products) {
      try {
        // Check if product already exists by slug
        const existingProduct = await ProductModel.findOne({ slug: product.slug });
        
        if (existingProduct) {
          // Update existing product
          await ProductModel.findOneAndUpdate(
            { slug: product.slug },
            {
              ...product,
              updatedAt: new Date()
            },
            { new: true }
          );
          result.skipped++;
          console.log(`📝 Updated existing product: ${product.name}`);
        } else {
          // Create new product
          await ProductModel.create({
            ...product,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          result.saved++;
          console.log(`➕ Created new product: ${product.name}`);
        }
      } catch (error) {
        const errorMsg = `Failed to save product ${product.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
      }
    }

    return result;
  }

  /**
   * Get product by ID
   */
  static async getProductById(id: string): Promise<any | null> {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return null;
      }
      
      return await ProductModel.findById(id).lean();
    } catch (error) {
      console.error('❌ Error fetching product by ID:', error);
      throw error;
    }
  }

  /**
   * Get all product categories
   */
  static async getCategories(): Promise<string[]> {
    try {
      const categories = await ProductModel.distinct('category');
      return categories.filter(category => category && category.trim());
    } catch (error) {
      console.error('❌ Error fetching categories:', error);
      throw error;
    }
  }

  /**
   * Get product statistics
   */
  static async getProductStats() {
    try {
      const total = await ProductModel.countDocuments();
      const categories = await ProductModel.distinct('category');
      const withImages = await ProductModel.countDocuments({ 'images.primary': { $exists: true, $ne: null } });
      const withDescriptions = await ProductModel.countDocuments({ description: { $exists: true, $ne: null } });
      
      return {
        total,
        categories: categories.length,
        withImages,
        withDescriptions,
        lastUpdated: await ProductModel.findOne().sort({ updatedAt: -1 }).select('updatedAt')
      };
    } catch (error) {
      console.error('❌ Error fetching product stats:', error);
      throw error;
    }
  }

  /**
   * Formats product data for API response
   */
  static formatProductsForResponse(products: Product[]): {
    success: boolean;
    data: Product[];
    total: number;
    timestamp: string;
  } {
    return {
      success: true,
      data: products,
      total: products.length,
      timestamp: new Date().toISOString()
    };
  }

  
  /**
   * Validates product data
   */
  static validateProduct(product: Partial<Product>): boolean {
    return !!(
      product.name &&
      product.slug &&
      product.productUrl
    );
  }

  /**
   * Sanitizes product data
   */
  static sanitizeProduct(product: Product): Product {
    return {
      ...product,
      name: product.name.trim(),
      description: product.description?.trim(),
      category: product.category?.trim(),
      images: {
        primary: product.images.primary?.trim(),
        gallery: product.images.gallery.filter(url => url && url.trim()),
        thumbnails: product.images.thumbnails.filter(url => url && url.trim())
      },
      productHighlights: product.productHighlights?.filter(highlight => highlight && highlight.trim()),
      createdAt: new Date()
    };
  }
}