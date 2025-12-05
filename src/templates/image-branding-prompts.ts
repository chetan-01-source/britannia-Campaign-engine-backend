import { ImagePromptContext } from '../types/image-branding.types';

export const IMAGE_BRANDING_PROMPT_TEMPLATE = {
  system: `You are an expert visual branding designer specializing in Britannia food product marketing. You create compelling, brand-consistent visual content that drives engagement and sales for Britannia products only.

Your expertise includes:
- Creating visually stunning Britannia product advertisements that capture brand essence
- Understanding platform-specific visual requirements and best practices
- Combining Britannia product imagery with compelling visual storytelling
- Designing layouts that highlight Britannia product features while maintaining brand identity
- Creating authentic, engaging visuals that resonate with target audiences

IMPORTANT RULES:
- ALWAYS use the EXACT product name provided - never change, modify, or substitute it
- ALWAYS use "Britannia" as the brand name - never use any other company name
- Generate creative, platform-optimized visual concepts that make Britannia products irresistible.`,

  buildImagePrompt: (context: ImagePromptContext): string => {
    const {
      productName,
      productDescription,
      productCategory,
      productHighlights,
      platform,
      tone,
      flavor,
      style
    } = context;

    // Platform-specific visual requirements
    const platformRequirements = getPlatformVisualSpecs(platform);
    
    // Style-specific visual elements
    const styleElements = getStyleElements(style);
    
    // Tone-specific visual mood
    const toneMood = getToneVisualMood(tone);

    return `Create a stunning ${platform} branding image for Britannia's "${productName}" with these specifications:

## PRODUCT DETAILS
- Brand: Britannia
- Product Name: ${productName} (USE THIS EXACT NAME - DO NOT CHANGE)
- Category: ${productCategory || 'Food Product'}
${productDescription ? `- Description: ${productDescription}` : ''}
${productHighlights ? `- Key Features: ${productHighlights.join(', ')}` : ''}

## CRITICAL REQUIREMENTS
- Product name MUST remain exactly: "${productName}" (no variations, substitutions, or modifications)
- Brand name MUST be "Britannia" (no other company names allowed)

## VISUAL STYLE REQUIREMENTS
- Primary Style: ${style} design approach
- Visual Mood: ${toneMood}
- Platform: ${platform} optimized layout
${flavor ? `- Special Focus: Emphasize ${flavor} characteristics` : ''}

## DESIGN SPECIFICATIONS
${platformRequirements}

## STYLE ELEMENTS
${styleElements}

## BRAND GUIDELINES
- Use ONLY Britannia brand aesthetics (warm, trustworthy, family-oriented)
- Display product name exactly as "${productName}" - NO CHANGES ALLOWED
- Show "Britannia" as the brand name - NO OTHER COMPANY NAMES
- Incorporate product prominently as the hero element
- Create visual hierarchy that guides eye to product
- Use complementary colors that enhance product appeal
- Ensure text is readable and impactful
- Balance product imagery with lifestyle/contextual elements

## COMPOSITION REQUIREMENTS
✅ Product should be the clear focal point (40-50% of image)
✅ Include lifestyle elements that match the ${tone} audience
✅ Use lighting that makes the product look appetizing
✅ Create depth and visual interest without overwhelming the product
✅ Ensure brand consistency with Britannia's visual identity
✅ Include subtle call-to-action elements if appropriate for ${platform}

## TECHNICAL SPECIFICATIONS
- High resolution, crisp details
- Professional lighting and shadows
- Balanced composition following rule of thirds
- Colors that enhance product appeal
- Typography that matches brand personality

IMPORTANT: 
- Reference the provided images for inspiration but create an original, unique composition
- Do not copy existing designs - use them as style and quality benchmarks only
- MUST use exact product name: "${productName}" (no variations allowed)
- MUST show "Britannia" as the brand (no other company names)

Generate an original, compelling Britannia visual that would make viewers want to try "${productName}" immediately!`;
  }
};

function getPlatformVisualSpecs(platform: string): string {
  const specs: Record<string, string> = {
    instagram: `
- Aspect Ratio: Square (1:1) or vertical (4:5) format
- High contrast, visually striking imagery
- Clean, modern aesthetic with bold elements
- Space for text overlay without cluttering
- Mobile-optimized viewing experience`,
    
    linkedin: `
- Aspect Ratio: Horizontal (16:9) or square (1:1) format  
- Professional, clean aesthetic
- Subtle branding elements
- High-quality, polished appearance
- Business-appropriate color palette`,
    
    email: `
- Aspect Ratio: Horizontal banner (3:1) or product focus (1:1)
- Clean, uncluttered design
- Strong product focus with minimal distractions
- Easy to scan visual hierarchy
- Professional yet approachable aesthetic`
  };
  
  return specs[platform.toLowerCase()] || specs.instagram;
}

function getStyleElements(style: string): string {
  const elements: Record<string, string> = {
    minimalist: `
- Clean, uncluttered composition with plenty of white space
- Simple, elegant typography
- Limited color palette focusing on product colors
- Geometric shapes and clean lines
- Subtle shadows and lighting effects`,
    
    vibrant: `
- Bold, energetic color combinations
- Dynamic composition with movement
- Playful typography and design elements
- High contrast and saturation
- Fun, engaging visual elements`,
    
    premium: `
- Luxurious color palette (gold, deep blues, rich browns)
- Elegant typography with serif fonts
- Sophisticated lighting and shadows
- High-end material textures
- Refined, upscale aesthetic`,
    
    playful: `
- Bright, cheerful color combinations
- Fun, dynamic typography
- Whimsical design elements
- Energetic composition with movement
- Youthful, engaging visual style`
  };
  
  return elements[style] || elements.minimalist;
}

function getToneVisualMood(tone: string): string {
  const moods: Record<string, string> = {
    youth: 'Energetic, fun, colorful, trendy, Instagram-worthy',
    family: 'Warm, cozy, inviting, homey, trustworthy',
    premium: 'Elegant, sophisticated, luxurious, refined, exclusive',
    health: 'Fresh, clean, natural, vibrant, wholesome',
    traditional: 'Classic, timeless, authentic, heritage, comforting'
  };
  
  return moods[tone.toLowerCase()] || 'Appealing, trustworthy, appetizing';
}