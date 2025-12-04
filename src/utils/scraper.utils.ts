import puppeteer, { Browser, Page } from 'puppeteer';
import { ScrapedProductDetails, ProductImages } from '../types/product.types';
import { BRITANNIA_CONFIG, SELECTORS } from '../config/britannia.config';
import { filterImageUrls, isValidProductText } from './api.utils';

/**
 * Launches a Puppeteer browser instance with optimal configuration
 */
export async function launchBrowser(): Promise<Browser> {
  console.log('Launching browser for product page scraping...');
  
  return await puppeteer.launch({
    headless: true,
    defaultViewport: BRITANNIA_CONFIG.SCRAPING.VIEWPORT,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });
}

/**
 * Scrapes a single product page and extracts product details
 */
export async function scrapeProductPage(
  browser: Browser, 
  productUrl: string, 
  productSlug: string
): Promise<ScrapedProductDetails | null> {
  let page: Page | null = null;
  
  try {
    console.log(`Scraping product page: ${productUrl}`);
    
    page = await browser.newPage();
    
    // Navigate to product page
    await page.goto(productUrl, {
      waitUntil: 'networkidle0',
      timeout: BRITANNIA_CONFIG.SCRAPING.TIMEOUT
    });

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, BRITANNIA_CONFIG.SCRAPING.WAIT_TIME));

    // Extract product information from the DOM
    const productDetails = await page.evaluate((selectors) => {
      // Extract product name
      const extractProductName = (): string | undefined => {
        for (const selector of selectors.PRODUCT_NAME) {
          const element = document.querySelector(selector);
          const text = element?.textContent?.trim();
          if (text && text.length > 0 && text.length < 100) {
            return text;
          }
        }
        return undefined;
      };

      // Extract product description
      const extractDescription = (): string | undefined => {
        for (const selector of selectors.PRODUCT_DESCRIPTION) {
          const element = document.querySelector(selector);
          const text = element?.textContent?.trim();
          if (text && 
              text.length > 10 && 
              text.length < 500 && 
              !text.includes('©') && 
              !text.includes('www.') &&
              !text.toLowerCase().includes('contact') &&
              !text.toLowerCase().includes('follow')) {
            return text;
          }
        }
        return undefined;
      };

      // Extract product images
      const extractImages = () => {
        const images = {
          primary: undefined as string | undefined,
          gallery: [] as string[],
          thumbnails: [] as string[]
        };

        // Get primary image
        for (const selector of selectors.PRIMARY_IMAGE) {
          const imgElement = document.querySelector(selector) as HTMLImageElement;
          if (imgElement?.src && imgElement.src.includes('britannia')) {
            images.primary = imgElement.src;
            break;
          }
        }

        // Get all gallery images
        const galleryImages = document.querySelectorAll(selectors.GALLERY_IMAGES);
        const uniqueImages = new Set<string>();
        
        galleryImages.forEach((img) => {
          const imgElement = img as HTMLImageElement;
          if (imgElement.src && 
              imgElement.src.includes('britannia') && 
              imgElement.src.includes('media.britannia.co.in')) {
            uniqueImages.add(imgElement.src);
          }
        });
        
        images.gallery = Array.from(uniqueImages);
        images.thumbnails = images.gallery.filter(url => 
          url.includes('thumb') || url.includes('small')
        );

        return images;
      };

      // Extract product highlights
      const extractHighlights = (): string[] => {
        const productHighlights: string[] = [];
        
        for (const selector of selectors.PRODUCT_HIGHLIGHTS) {
          const elements = document.querySelectorAll(selector);
          elements.forEach((element) => {
            const text = element.textContent?.trim();
            if (text && text.length > 5 && text.length < 100) {
              productHighlights.push(text);
            }
          });
          if (productHighlights.length > 0) break;
        }
        
        return productHighlights;
      };

      return {
        name: extractProductName(),
        description: extractDescription(),
        images: extractImages(),
        productHighlights: extractHighlights()
      };
    }, SELECTORS);

    console.log(`✓ Extracted: ${productDetails.name || 'No name'} - ${productDetails.description?.substring(0, 50) || 'No description'}...`);
    console.log(`✓ Images found: ${productDetails.images.gallery.length} gallery, Primary: ${productDetails.images.primary ? 'Yes' : 'No'}`);
    
    return {
      name: productDetails.name,
      description: productDetails.description,
      images: {
        primary: productDetails.images.primary,
        gallery: filterImageUrls(productDetails.images.gallery),
        thumbnails: filterImageUrls(productDetails.images.thumbnails)
      },
      productHighlights: productDetails.productHighlights?.length ? productDetails.productHighlights : undefined
    };

  } catch (error) {
    console.warn(`✗ Failed to scrape product page ${productUrl}:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  } finally {
    if (page) {
      await page.close();
    }
  }
}

/**
 * Safely closes browser instance
 */
export async function closeBrowser(browser: Browser): Promise<void> {
  try {
    await browser.close();
    console.log('Browser closed successfully');
  } catch (error) {
    console.error('Error closing browser:', error);
  }
}