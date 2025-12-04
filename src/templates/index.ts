// Re-export all template components for easy importing
export * from './types';
export * from './platform-specs';
export * from './tone-specs';
export * from './branding-prompts';

// Main template builder function
export { buildBrandingPrompt } from './prompt-builder';

// Helper function to get all available options
export const getBrandingOptions = () => {
  return {
    tones: ['youth', 'professional', 'family'],
    platforms: ['instagram', 'linkedin', 'email'],
    flavors: ['sweet', 'spicy', 'healthy', 'indulgent', 'classic', 'premium'],
    description: {
      tones: {
        youth: 'Energetic, fun, and trendy communication style',
        professional: 'Formal, trustworthy, and business-focused approach',
        family: 'Warm, caring, and family-oriented messaging'
      },
      platforms: {
        instagram: 'Visual, hashtag-friendly, engaging social media content',
        linkedin: 'Professional, business-focused, industry-relevant content',
        email: 'Direct, personalized, and action-oriented communication'
      }
    }
  };
};