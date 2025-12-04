import { PromptTemplate, PromptContext } from "./types";

export const BRANDING_PROMPT_TEMPLATE: PromptTemplate = {
  system: `You are an expert branding and marketing content creator specializing in food products. 

Your expertise includes:
- Creating platform-specific content that drives engagement
- Understanding different audience segments and their communication preferences  
- Crafting compelling narratives that connect products with emotions
- Balancing promotional content with authentic storytelling
- Optimizing content for each platform's unique algorithms and user behaviors

Always generate content that feels authentic, engaging, and perfectly tailored to the specified platform and audience tone.`,

  user: (context: PromptContext) => {
    const {
      productName,
      tone,
      platform,
      flavor,
      productContext,
      platformSpecs,
      toneSpecs,
    } = context;

    const flavorText = flavor
      ? `with a special emphasis on ${flavor} characteristics`
      : "";
    const contextString = buildProductContextString(productContext);

    // Special handling for email platform
    if (platform.toLowerCase() === "email") {
      return `
Create a compelling email marketing content for "${productName}" in ${toneSpecs.name.toLowerCase()} tone ${flavorText}.

## PRODUCT INFORMATION
Product: ${productName}
${contextString}

## EMAIL REQUIREMENTS - ${platformSpecs.name}
${platformSpecs.description}
- Format: Complete email content with subject line, body, and call-to-action
- Hashtag Usage: ${platformSpecs.hashtagCount}
- Special Features: ${platformSpecs.specialFeatures.join(", ")}

## TONE SPECIFICATIONS - ${toneSpecs.name}
Target Audience: ${toneSpecs.targetAudience}
Language Style: ${toneSpecs.language}
Emotional Tone: ${toneSpecs.emotionalTone}
Key Focus Areas: ${toneSpecs.keyFocus.join(", ")}

## OUTPUT FORMAT
Provide your response in this exact format:

CAPTION: 
Subject: [Compelling email subject line]

[Email greeting]

[Email body with multiple paragraphs - make it engaging, personal, and focused on the product benefits. Include product features, emotional connection, and why they should care about this product.]

[Closing line that leads to the CTA]

HASHTAGS: [Maximum 2 relevant hashtags for email signatures if needed]

CTA: [Clear, compelling call-to-action button/link text with specific action]

---
Create email content that feels personal, valuable, and drives action!`;
    }

    return `
Create compelling ${toneSpecs.name.toLowerCase()} branding content for "${productName}" optimized for ${
      platformSpecs.name
    } ${flavorText}.

## PRODUCT INFORMATION
Product: ${productName}
${contextString}

## PLATFORM REQUIREMENTS - ${platformSpecs.name}
${platformSpecs.description}
- Character Limit: ${platformSpecs.characterLimit || "Flexible"}
- Hashtag Usage: ${platformSpecs.hashtagCount}
- Special Features: ${platformSpecs.specialFeatures.join(", ")}

## TONE SPECIFICATIONS - ${toneSpecs.name}
Target Audience: ${toneSpecs.targetAudience}
Language Style: ${toneSpecs.language}
Emotional Tone: ${toneSpecs.emotionalTone}
Key Focus Areas: ${toneSpecs.keyFocus.join(", ")}

## CONTENT REQUIREMENTS
✅ Lead with "${productName}" as the hero product
✅ Match the ${toneSpecs.name.toLowerCase()} tone throughout
✅ Optimize for ${platformSpecs.name} best practices
✅ Include relevant and engaging call-to-action
✅ Make it authentic and shareable
${flavor ? `✅ Emphasize ${flavor} characteristics naturally` : ""}

## OUTPUT FORMAT
Provide your response in this exact format:

CAPTION: [Your main content here - make it engaging and platform-appropriate]

HASHTAGS: [Space-separated hashtags like #BrandName #ProductCategory #Lifestyle]

CTA: [Clear, compelling call-to-action that drives desired action]

---
Generate content that would make someone stop scrolling and engage with this product!`;
  },
};

function buildProductContextString(productContext: any[]): string {
  if (!productContext || productContext.length === 0) {
    return "No additional product context available.";
  }

  let contextString = "\n📦 Related Products from our database:\n";

  productContext.forEach((product, index) => {
    contextString += `${index + 1}. **${product.name}**`;
    if (product.category) contextString += ` (${product.category})`;
    if (product.description)
      contextString += `\n   Description: ${product.description}`;
    if (product.highlights && product.highlights.length > 0) {
      contextString += `\n   Key Features: ${product.highlights.join(", ")}`;
    }
    if (product.similarity) {
      contextString += `\n   Relevance: ${Math.round(
        product.similarity * 100
      )}%`;
    }
    contextString += "\n";
  });

  return contextString;
}
