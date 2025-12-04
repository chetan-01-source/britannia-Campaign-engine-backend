import { PromptContext } from './types';
import { getPlatformSpecs } from './platform-specs';
import { getToneSpecs } from './tone-specs';
import { BRANDING_PROMPT_TEMPLATE } from './branding-prompts';

export interface BrandingPromptRequest {
  productName: string;
  tone: string;
  platform: string;
  flavor?: string;
  productContext: any[];
}

/**
 * Build a complete branding prompt with all specifications
 */
export function buildBrandingPrompt(request: BrandingPromptRequest): {
  systemPrompt: string;
  userPrompt: string;
} {
  const platformSpecs = getPlatformSpecs(request.platform);
  const toneSpecs = getToneSpecs(request.tone);

  const context: PromptContext = {
    productName: request.productName,
    tone: request.tone,
    platform: request.platform,
    flavor: request.flavor,
    productContext: request.productContext,
    platformSpecs,
    toneSpecs
  };

  return {
    systemPrompt: BRANDING_PROMPT_TEMPLATE.system,
    userPrompt: BRANDING_PROMPT_TEMPLATE.user(context)
  };
}

/**
 * Validate branding request parameters
 */
export function validateBrandingRequest(request: Partial<BrandingPromptRequest>): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!request.productName || request.productName.trim() === '') {
    errors.push('Product name is required');
  }

  const validTones = ['youth', 'professional', 'family'];
  if (!request.tone || !validTones.includes(request.tone.toLowerCase())) {
    errors.push(`Tone must be one of: ${validTones.join(', ')}`);
  }

  const validPlatforms = ['instagram', 'linkedin', 'email'];
  if (!request.platform || !validPlatforms.includes(request.platform.toLowerCase())) {
    errors.push(`Platform must be one of: ${validPlatforms.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get available options for UI/API documentation
 */
export function getBrandingOptions() {
  return {
    tones: [
      { value: 'youth', label: 'Youth-focused', description: 'Trendy and energetic for younger audiences' },
      { value: 'professional', label: 'Professional', description: 'Sophisticated for business audiences' },
      { value: 'family', label: 'Family-oriented', description: 'Warm and caring for family audiences' }
    ],
    platforms: [
      { value: 'instagram', label: 'Instagram', description: 'Visual-first social media content' },
      { value: 'linkedin', label: 'LinkedIn', description: 'Professional networking content' },
      { value: 'email', label: 'Email', description: 'Direct email marketing content' }
    ],
    flavors: [
      { value: 'sweet', label: 'Sweet', description: 'Emphasize sweetness and indulgence' },
      { value: 'healthy', label: 'Healthy', description: 'Focus on nutrition and wellness' },
      { value: 'premium', label: 'Premium', description: 'Highlight luxury and quality' },
      { value: 'traditional', label: 'Traditional', description: 'Emphasize heritage and authenticity' },
      { value: 'innovative', label: 'Innovative', description: 'Highlight new features and technology' }
    ]
  };
}