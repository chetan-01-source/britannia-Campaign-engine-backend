import { Request, Response } from 'express';
import { ProductService } from '../services/product.service';
import { asyncHandler } from '../middlewares/error.middleware';

const productService = ProductService.getInstance();

export const ProductController = {
  /**
   * Save products to database
   */
  saveProducts: asyncHandler(async (req: Request, res: Response) => {
    try {
      const { products } = req.body;
      
      if (!products || !Array.isArray(products)) {
        return res.status(400).json({
          success: false,
          message: 'Products array is required'
        });
      }

      const result = await ProductService.saveProducts(products);
      
      res.status(201).json({
        success: true,
        message: `Successfully saved ${result.saved} products`,
        data: {
          saved: result.saved,
          skipped: result.skipped,
          errors: result.errors
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Failed to save products:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to save products',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }),

  /**
   * Get products with page-based pagination
   */
  getProducts: asyncHandler(async (req: Request, res: Response) => {
    try {
      const {
        page = '1',
        limit = '20',
        category,
        search
      } = req.query;

      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      
      // Validate pagination params
      if (pageNum < 1) {
        return res.status(400).json({
          success: false,
          message: 'Page must be greater than 0'
        });
      }
      
      if (limitNum > 100) {
        return res.status(400).json({
          success: false,
          message: 'Limit cannot exceed 100'
        });
      }

      const result = await ProductService.getProductsPaginated({
        page: pageNum,
        limit: limitNum,
        category: category as string,
        search: search as string
      });

      res.json({
        success: true,
        data: {
          products: result.products,
          pagination: result.pagination
        },
        filters: {
          category: category || null,
          search: search || null
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Failed to fetch products:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch products',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }),

  /**
   * Get product by ID
   */
  getProductById: asyncHandler(async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const product = await ProductService.getProductById(id);
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      res.json({
        success: true,
        data: {
          product
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('❌ Failed to fetch product:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch product',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }),


};