import { ToneSpecs } from './types';

export const TONE_SPECS: Record<string, ToneSpecs> = {
  youth: {
    name: 'Youth-focused',
    description: 'Contemporary and trendy communication style',
    language: 'Modern, trendy language with appropriate slang',
    targetAudience: 'Millennials and Gen Z (18-35 years)',
    keyFocus: [
      'Fun and energy',
      'Lifestyle and experiences',
      'Social sharing moments',
      'Trendy and current topics',
      'Authentic and relatable content'
    ],
    emotionalTone: 'Energetic, fun, and aspirational'
  },

  professional: {
    name: 'Professional',
    description: 'Sophisticated and business-oriented communication',
    language: 'Polished, sophisticated, and authoritative',
    targetAudience: 'Business professionals and decision makers (25-55 years)',
    keyFocus: [
      'Quality and reliability',
      'Expertise and credibility',
      'Premium value proposition',
      'Industry leadership',
      'Trust and dependability'
    ],
    emotionalTone: 'Confident, trustworthy, and authoritative'
  },

  family: {
    name: 'Family-oriented',
    description: 'Warm and inclusive communication for families',
    language: 'Warm, inclusive, and caring',
    targetAudience: 'Parents and families (25-50 years)',
    keyFocus: [
      'Togetherness and care',
      'Health and safety',
      'Shared moments and traditions',
      'Value for families',
      'Emotional connections'
    ],
    emotionalTone: 'Warm, caring, and nurturing'
  }
};

export const getToneSpecs = (tone: string): ToneSpecs => {
  return TONE_SPECS[tone.toLowerCase()] || TONE_SPECS.family;
};