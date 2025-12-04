import { PlatformSpecs } from './types';

export const PLATFORM_SPECS: Record<string, PlatformSpecs> = {
  instagram: {
    name: 'Instagram',
    description: 'Visual-first social media platform focusing on engagement and shareability',
    characterLimit: 2200,
    hashtagCount: '3-5 relevant hashtags',
    specialFeatures: [
      'Visual-first content (mention visual appeal)',
      'Use emojis appropriately',
      'Keep it engaging and shareable',
      'Focus on lifestyle and experiences',
      'Include story-worthy moments'
    ]
  },

  linkedin: {
    name: 'LinkedIn',
    description: 'Professional networking platform focusing on business value and expertise',
    hashtagCount: '2-3 professional hashtags',
    specialFeatures: [
      'Professional yet engaging tone',
      'Focus on business value and quality',
      'Longer form content acceptable',
      'Include industry insights when relevant',
      'Emphasize credibility and expertise',
      'Appeal to decision makers'
    ]
  },

  email: {
    name: 'Email Marketing',
    description: 'Direct communication channel focusing on personalized messaging',
    hashtagCount: 'Minimal or no hashtags',
    specialFeatures: [
      'Direct and personal approach',
      'Clear subject line suggestion',
      'Include compelling call-to-action',
      'Focus on benefits and value proposition',
      'Professional but warm tone',
      'Scannable format with clear structure'
    ]
  }
};

export const getPlatformSpecs = (platform: string): PlatformSpecs => {
  return PLATFORM_SPECS[platform.toLowerCase()] || PLATFORM_SPECS.instagram;
};