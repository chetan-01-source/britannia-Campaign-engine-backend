import axios from 'axios';
import { ApiResponse, ApiProduct } from '../types/product.types';
import { BRITANNIA_CONFIG } from '../config/britannia.config';

/**
 * Fetches product data from Britannia's impact.json API
 */
export async function fetchProductsFromAPI(): Promise<ApiProduct[]> {
  try {
    console.log('Fetching products from Britannia impact.json API...');
    
    const apiUrl = `${BRITANNIA_CONFIG.API.BASE_URL}${BRITANNIA_CONFIG.API.IMPACT_ENDPOINT}`;
    
    const response = await axios.get<ApiResponse>(apiUrl, {
      headers: BRITANNIA_CONFIG.HEADERS,
      timeout: BRITANNIA_CONFIG.SCRAPING.TIMEOUT
    });

    console.log('API Response received, processing products...');
    
    if (!response.data?.pageProps?.products?.data) {
      console.error('No products found in API response');
      return [];
    }

    const apiProducts = response.data.pageProps.products.data;
    console.log(`Found ${apiProducts.length} product categories in API`);
    
    return apiProducts;
  } catch (error) {
    console.error('Error fetching products from API:', error);
    throw new Error(`Failed to fetch products: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generates product URL from slug
 */
export function generateProductUrl(slug: string): string {
  return `${BRITANNIA_CONFIG.API.PRODUCT_BASE_URL}/${slug}`;
}

/**
 * Validates if a URL is a valid Britannia media URL
 */
export function isValidBritanniaImageUrl(url: string): boolean {
  return !!url && 
         url.includes('britannia') && 
         url.includes('media.britannia.co.in') &&
         (url.includes('.png') || url.includes('.jpg') || url.includes('.jpeg'));
}

/**
 * Filters and validates image URLs
 */
export function filterImageUrls(urls: string[]): string[] {
  const uniqueUrls = new Set(urls.filter(isValidBritanniaImageUrl));
  return Array.from(uniqueUrls);
}

/**
 * Validates text content for product data
 */
export function isValidProductText(text: string | null | undefined, minLength = 5, maxLength = 500): boolean {
  if (!text) return false;
  
  const trimmed = text.trim();
  return trimmed.length >= minLength && 
         trimmed.length <= maxLength &&
         !trimmed.includes('©') && 
         !trimmed.includes('www.') &&
         !trimmed.toLowerCase().includes('contact') &&
         !trimmed.toLowerCase().includes('follow');
}