import axios from 'axios'
import { Product } from '../types/product.types';
import { launchBrowser, scrapeProductPage, closeBrowser } from '../utils/scraper.utils';

export class ScraperService {
  private static instance: ScraperService;

  public static getInstance(): ScraperService {
    if (!ScraperService.instance) {
      ScraperService.instance = new ScraperService();
    }
    return ScraperService.instance;
  }

  /**
   * Main function to scrape all Britannia products
   * Fetches product slugs from API and scrapes individual product pages
   */
  public async scrapeBritanniaProducts(): Promise<Product[]> {
    console.log('🚀 Starting Britannia products scraping...');
    const products: Product[] = [];
    
    try {
      // Fetch product data from API
      console.log('📡 Fetching product data from API...');
      const response = await axios.get('https://www.britannia.co.in/_next/data/Oh7r5_ff2eW4oXI4AhUw-/impact.json');
      const apiData = response.data;
      
      console.log('🔍 Checking API response structure...');
      
      // Check multiple possible API structure paths
      let apiProducts;
      if (apiData?.pageProps?.products?.data) {
        apiProducts = apiData.pageProps.products.data;
        console.log('✅ Found products at pageProps.products.data');
      } else if (apiData?.pageProps?.pageData?.products?.data) {
        apiProducts = apiData.pageProps.pageData.products.data;
        console.log('✅ Found products at pageProps.pageData.products.data');
      } else {
        console.error('❌ API Response structure:', JSON.stringify(apiData, null, 2));
        throw new Error('Invalid API response structure - products not found in expected paths');
      }
      console.log(`📦 Found ${apiProducts.length} product categories in API`);
      
      // Launch browser for scraping individual product pages
      console.log('🌐 Launching browser...');
      const browser = await launchBrowser();
      
      try {
        // Process each product category
        for (let i = 0; i < apiProducts.length; i++) {
          const productData = apiProducts[i];
          const categoryName = productData.attributes?.Name || `Product ${i + 1}`;
          const productSlug = productData.attributes?.Slug;
          
          if (!productSlug) {
            console.log(`⚠️  No slug found for: ${categoryName}`);
            continue;
          }
          
          const productUrl = `https://www.britannia.co.in/product/${productSlug}`;
          console.log(`🔍 [${i + 1}/${apiProducts.length}] Scraping: ${categoryName}`);
          
          const productDetails = await scrapeProductPage(browser, productUrl, productSlug);
          
          if (productDetails) {
            const product: Product = {
              name: productDetails.name || categoryName,
              description: productDetails.description,
              category: categoryName,
              productUrl: productUrl,
              slug: productSlug,
              images: productDetails.images,
              productHighlights: productDetails.productHighlights,
              createdAt: new Date()
            };
            
            products.push(product);


            console.log(`✅ Successfully scraped: ${product.name}`);
          } else {
            console.log(`⚠️  Failed to extract details for: ${categoryName}`);
          }
          
          // Add delay between requests
          if (i < apiProducts.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
      } finally {
        await closeBrowser(browser);
      }
      
      console.log(`🎉 Scraping completed! Found ${products.length} products`);
      return products;
      
    } catch (error) {
      console.error('❌ Error scraping Britannia products:', error);
      throw error;
    }
  }

  /**
   * Function to run the scraper and log results
   */
  public async runScraper(): Promise<Product[]> {
    try {
      console.log('Starting Britannia products scraper...');
      const products = await this.scrapeBritanniaProducts();
      
      console.log('\n=== SCRAPED PRODUCTS ===');
      products.forEach((product, index) => {
        console.log(`${index + 1}. ${product.name}`);
        if (product.description) {
          console.log(`   Description: ${product.description}`);
        }
        if (product.images && Array.isArray(product.images.gallery) && product.images.gallery.length > 0) {
          console.log(`   Images: ${product.images.gallery.length} image(s)`);
        }
        console.log('');
      });
      
      console.log(`Total products found: ${products.length}`);
      return products;
    } catch (error) {
      console.error('Scraper failed:', error);
      return [];
    }
  }
}

export const scraperService = ScraperService.getInstance();