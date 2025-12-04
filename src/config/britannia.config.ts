export const BRITANNIA_CONFIG = {
  API: {
    BASE_URL: 'https://www.britannia.co.in',
    IMPACT_ENDPOINT: '/_next/data/Oh7r5_ff2eW4oXI4AhUw-/impact.json',
    PRODUCT_BASE_URL: 'https://www.britannia.co.in/product'
  },
  SCRAPING: {
    TIMEOUT: 30000,
    WAIT_TIME: 3000,
    MAX_RETRIES: 3,
    VIEWPORT: {
      width: 1280,
      height: 720
    }
  },
  HEADERS: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Referer': 'https://www.britannia.co.in/'
  }
};

export const SELECTORS = {
  PRODUCT_NAME: [
    'h2[class*="font-tankerComplete"]',
    'h1',
    'h2[class*="title"]',
    '[class*="product-title"]',
    '.product-name'
  ],
  PRODUCT_DESCRIPTION: [
    '.Tab_product-description__TgrXS',
    '[class*="product-description"]',
    '[class*="description"]',
    'div[class*="Tab_product-description"]',
    'p[class*="description"]'
  ],
  PRIMARY_IMAGE: [
    'img[src*="britannia"][class*="object-contain"]',
    'img[data-flag="intrinsic"]',
    'div[class*="Tab_product-details-active-image"] img',
    '.product-image img',
    'main img[src*="britannia"]'
  ],
  GALLERY_IMAGES: 'img[src*="britannia"]',
  PRODUCT_HIGHLIGHTS: [
    '.product-highlights li',
    '[class*="highlight"]',
    '.features li',
    '.benefits li'
  ]
};