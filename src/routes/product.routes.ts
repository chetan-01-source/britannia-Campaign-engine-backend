import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';

const router = Router();

/**
 * @route POST /api/products/save
 * @desc Save products to database
 * @body products - Array of products to save
 */
router.post('/save', ProductController.saveProducts);

/**
 * @route GET /api/products
 * @desc Get products with limit/skip pagination
 * @query page - Page number (default: 1)
 * @query limit - Number of products per page (default: 20, max: 100)
 * @query category - Filter by category (optional)
 * @query search - Search in product names and descriptions (optional)
 */
router.get('/', ProductController.getProducts);


/**
 * @route GET /api/products/:id
 * @desc Get product by ID
 * @param id - Product ID
 */
router.get('/:id', ProductController.getProductById);

export { router as productRoutes };
