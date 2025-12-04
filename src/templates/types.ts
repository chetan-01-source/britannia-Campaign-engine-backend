export interface PromptTemplate {
  system: string;
  user: (context: PromptContext) => string;
}

export interface PromptContext {
  productName: string;
  tone: string;
  platform: string;
  flavor?: string;
  productContext: ProductContext[];
  platformSpecs: PlatformSpecs;
  toneSpecs: ToneSpecs;
}

export interface BrandingPromptRequest {
  productName: string;
  tone: string;
  platform: string;
  flavor?: string;
  productContext: ProductContext[];
}

export interface ProductContext {
  name: string;
  description?: string;
  category?: string;
  highlights?: string[];
  similarity?: number;
}

export interface PlatformSpecs {
  name: string;
  description: string;
  characterLimit?: number;
  hashtagCount: string;
  specialFeatures: string[];
}

export interface ToneSpecs {
  name: string;
  description: string;
  language: string;
  targetAudience: string;
  keyFocus: string[];
  emotionalTone: string;
}