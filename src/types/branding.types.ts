export interface BrandingRequest {
  productName: string;
  tone: 'youth' | 'professional' | 'family';
  platform: 'instagram' | 'linkedin' | 'email';
  flavor?: string;
}

export interface BrandingResponse {
  success: boolean;
  data: {
    productName: string;
    tone: string;
    platform: string;
    flavor?: string;
    caption: string;
    hashtags?: string[];
    cta?: string;
    metadata: {
      wordCount: number;
      characterCount: number;
      relevantProducts: number;
      generatedAt: string;
    };
  };
}

export interface ProductContext {
  name: string;
  description?: string;
  category?: string;
  highlights?: string[];
  similarity?: number;
}