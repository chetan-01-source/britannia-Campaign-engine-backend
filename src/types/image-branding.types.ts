// Image branding related types
export interface ImageBrandingRequest {
  productName: string;
  platform: string;
  tone: string;
  flavor?: string;
  style?: 'minimalist' | 'vibrant' | 'premium' | 'playful';
}

export interface ImageBrandingResponse {
  success: boolean;
  data?: {
    productName: string;
    platform: string;
    tone: string;
    style: string;
    generatedImage: string; // Base64 encoded image
    imagePrompt: string;
    referenceImages: string[];
    productImages: string[];
    metadata: {
      dimensions?: string;
      format: string;
      generatedAt: string;
      freepikRequestId?: string; // FreePik specific field
      s3Key?: string; // S3 storage key
      localPath?: string; // Local file path
    };
  };
  error?: string;
  // Additional fields for local storage
  savedFilename?: string;
  viewUrl?: string;
}

export interface ImagePromptContext {
  productName: string;
  productDescription?: string;
  productCategory?: string;
  productHighlights?: string[];
  platform: string;
  tone: string;
  flavor?: string;
  style: string;
  productImages: string[];
  referenceImages: string[];
}

export interface ReferenceImage {
  path: string;
  description: string;
  platform: string;
  style: string[];
  useCase: string;
}