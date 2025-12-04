import { Request, Response } from 'express';
import { scraperService } from '../services/scraper.service';
import { ProductService } from '../services/product.service';
import { asyncHandler } from '../middlewares/error.middleware';




export const ScraperController = {
  // Health check
  health: asyncHandler(async (req: Request, res: Response) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      service: "Britannia Product Scraper API",
      version: "1.0.0"
    });
  }),

  // Scrape products
  scrapeProducts: asyncHandler(async (req: Request, res: Response) => {
    console.log("🚀 API: Starting Britannia products scraper...");
    
    const products = await scraperService.scrapeBritanniaProducts();


    const response = ProductService.formatProductsForResponse(products);
    
    console.log(`✅ Successfully scraped ${products.length} products`);
    res.json(response);
  }),

  // Get scraper status
  getStatus: asyncHandler(async (req: Request, res: Response) => {
    res.json({
      success: true,
      message: "Scraper is operational",
      timestamp: new Date().toISOString(),
      endpoints: {
        scrape: "/api/scraper/products",
        health: "/api/health",
        status: "/api/scraper/status"
      }
    });
  })
};