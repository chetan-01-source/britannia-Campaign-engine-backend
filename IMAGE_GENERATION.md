# Image Generation System - Britannia Campaign Engine

## Overview

The image generation system creates AI-powered branding images for Britannia products across multiple platforms (Instagram, LinkedIn, Email). It uses the **GeminiGen AI API** (imagen-pro model) for image generation and **Google Gemini** for branding content (captions/taglines).

> Previously used FreePik API, replaced with GeminiGen AI in commit `bb374d6`.

---

## Architecture Diagram

```
Client Request
      │
      ▼
┌─────────────────────────┐
│  Routes                 │
│  POST /api/image-branding/generate
│  POST /api/branding/generate
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Controllers            │
│  ImageBrandingController│
│  ComprehensiveBrandingController
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  RateLimitedImageService│  ← 5 requests/min, FIFO queue
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  GeminiGenImageService  │  ← Core image generation
│  ┌───────────────────┐  │
│  │ 1. Get Product Data│  │  ← MongoDB lookup
│  │ 2. Generate Content│  │  ← Google Gemini API (captions/taglines)
│  │ 3. Build Prompt    │  │  ← Template + platform/flavor/style/tone
│  │ 4. Call GeminiGen  │  │  ← imagen-pro model
│  │ 5. Poll for Result │  │  ← 38s optimized polling
│  │ 6. Download Image  │  │  ← Save locally as PNG
│  │ 7. Upload to S3    │  │  ← Optional, public-read
│  └───────────────────┘  │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Response               │
│  - base64 image         │
│  - S3 URL               │
│  - metadata             │
│  - captions/taglines    │
└─────────────────────────┘
```

---

## Step-by-Step Flow

### 1. Request Entry

**Endpoints:**
- `POST /api/image-branding/generate` — standalone image generation
- `POST /api/branding/generate` — comprehensive branding (image + captions + taglines)

**Request Body:**
```json
{
  "productName": "Good Day Cashew",
  "platform": "instagram",
  "tone": "youth",
  "flavor": "chocolate",
  "style": "vibrant"
}
```

**Files:**
- [image-branding.routes.ts](src/routes/image-branding.routes.ts)
- [comprehensive-branding.routes.ts](src/routes/comprehensive-branding.routes.ts)
- [image-branding.controller.ts](src/controllers/image-branding.controller.ts)
- [comprehensive-branding.controller.ts](src/controllers/comprehensive-branding.controller.ts)

---

### 2. Rate Limiting

All requests pass through `RateLimitedImageService` (singleton pattern).

- **Limit:** 5 requests per minute
- **Strategy:** FIFO queue — if rate limit is hit, requests are queued and processed asynchronously
- **Error handling:** Automatically retries on API rate limit (429) errors

**File:** [rate-limited-image.service.ts](src/services/rate-limited-image.service.ts)

**Monitoring endpoint:** `GET /api/rate-limit/status`

---

### 3. Product Data Retrieval

Fetches product details from MongoDB using `ProductModel`.

- First attempts exact match on product name
- Falls back to broad search if no exact match

**File:** [gemini-genai.service.ts:414](src/services/gemini-genai.service.ts#L414) — `getProductData()`

---

### 4. Branding Content Generation (Captions & Taglines)

Uses **Google Gemini API** (`gemini-2.0-flash` model) to generate:
- A tagline for the product
- A caption tailored to the platform and tone

**Fallback:** If AI generation fails, uses predefined tone-based templates.

**Files:**
- [gemini-genai.service.ts:553](src/services/gemini-genai.service.ts#L553) — `generateBrandingContent()`
- [config/gemini.ts](src/config/gemini.ts) — Gemini API initialization

---

### 5. Prompt Construction

The image prompt is built in layers:

#### Layer 1: Base Template
A comprehensive template specifying product, platform, and brand requirements.

```
"Create a stunning ${platform} branding image for Britannia's "${productName}"..."
```

**File:** [image-branding-prompts.ts:39](src/templates/image-branding-prompts.ts#L39) — `IMAGE_BRANDING_PROMPT_TEMPLATE`

#### Layer 2: Platform-Specific Enhancement

| Platform  | Aspect Ratio | Visual Requirements |
|-----------|-------------|---------------------|
| Instagram | `1:1`       | Scroll-stopping visuals, high-contrast, mobile-optimized |
| LinkedIn  | `16:9`      | Professional aesthetic, business-friendly, sophisticated |
| Email     | `16:9`      | Header-optimized, clear hierarchy, CTA-friendly |
| Default   | `1:1`       | Standard square format |

**File:** [gemini-genai.service.ts:754](src/services/gemini-genai.service.ts#L754)

#### Layer 3: Flavor-Specific Enhancement

Based on product flavor keywords:

| Flavor      | Visual Elements |
|-------------|----------------|
| Chocolate   | Rich brown & golden palette, warm indulgence |
| Strawberry  | Pink/red accents, fruity mood, natural elements |
| Vanilla     | Cream & beige tones, elegant presentation |
| Butter      | Golden yellow, warm cream, premium atmosphere |
| Coconut     | White, tropical palette, exotic elements |

**File:** [gemini-genai.service.ts:784](src/services/gemini-genai.service.ts#L784)

#### Layer 4: Style Mapping

| Style      | Visual Elements |
|------------|----------------|
| Minimalist | Clean white space, simple typography, geometric shapes |
| Vibrant    | Bold colors, dynamic composition, high contrast, playful |
| Premium    | Luxurious palette (gold, deep blues), elegant typography |
| Playful    | Bright colors, fun typography, whimsical elements |

**File:** [image-branding-prompts.ts:128](src/templates/image-branding-prompts.ts#L128) — `getStyleElements()`

#### Layer 5: Tone Visual Mood

| Tone        | Mood |
|-------------|------|
| Youth       | Energetic, fun, colorful, trendy, Instagram-worthy |
| Family      | Warm, cozy, inviting, homey, trustworthy |
| Premium     | Elegant, sophisticated, luxurious, refined |
| Health      | Fresh, clean, natural, vibrant, wholesome |
| Traditional | Classic, timeless, authentic, heritage |

**File:** [image-branding-prompts.ts:160](src/templates/image-branding-prompts.ts#L160) — `getToneVisualMood()`

#### Layer 6: Final Requirements
- Product name emphasis
- Britannia brand consistency
- Tagline inclusion
- Commercial photography quality
- Print-ready specifications
- Cultural appropriateness for Indian market

**File:** [gemini-genai.service.ts:824](src/services/gemini-genai.service.ts#L824)

---

### 6. Image Generation (GeminiGen API)

**API:** `https://api.geminigen.ai/uapi/v1/generate_image`
**Model:** `imagen-pro`

#### Request
Sends a `multipart/form-data` POST with:
- `prompt` — the constructed prompt
- `model` — `imagen-pro`
- `aspect_ratio` — platform-dependent (e.g., `1:1`, `16:9`)
- `style` — mapped style value

**File:** [gemini-genai.service.ts:143](src/services/gemini-genai.service.ts#L143) — `generateImage()`

#### Response
Returns a task UUID that must be polled for completion.

---

### 7. Polling for Completion

**API:** `https://api.geminigen.ai/uapi/v1/history`

**Optimized polling schedule (total ~93 seconds max):**

| Attempt | Wait Time | Cumulative |
|---------|-----------|------------|
| 1       | 0s        | 0s         |
| 2       | 38s       | 38s        |
| 3       | 25s       | 63s        |
| 4       | 30s       | 93s        |

**Status codes:**
- `0` — PENDING
- `1` — PROCESSING
- `2` — COMPLETED (success)
- `3` — ERROR
- `4` — FAILED

**File:** [gemini-genai.service.ts:255](src/services/gemini-genai.service.ts#L255) — `pollTaskCompletion()`

---

### 8. Image Download & Storage

#### Local Storage
- **Directory:** `/generated-images/`
- **Filename:** `geminigen_${timestamp}_${promptSlug}.png`
- Image is also converted to base64 for the API response

**File:** [gemini-genai.service.ts:335](src/services/gemini-genai.service.ts#L335) — `downloadAndSaveImage()`

#### S3 Upload (Optional)
- **Bucket:** configured via `AWS_BUCKET_NAME` env var
- **Key pattern:** `images/branding/${filename}`
- **ACL:** public-read
- **Fallback:** If S3 upload fails, continues with local storage only

**File:** [s3.ts:57](src/utils/s3.ts#L57) — `uploadImageToS3()`

#### MongoDB Persistence
Branding metadata (product info, captions, image URLs, prompts) is saved to the `brandings` collection.

**File:** [branding.model.ts](src/models/branding.model.ts)

---

### 9. Response

```json
{
  "success": true,
  "data": {
    "productName": "Good Day Cashew",
    "platform": "instagram",
    "tone": "youth",
    "style": "vibrant",
    "generatedImage": "data:image/png;base64,...",
    "imagePrompt": "Create a stunning Instagram branding image...",
    "metadata": {
      "format": "base64_png",
      "generatedAt": "2025-12-05T16:37:43.900Z",
      "dimensions": "1024x1024",
      "geminiGenRequestId": "uuid-here",
      "s3Key": "images/branding/geminigen_...",
      "localPath": "/generated-images/geminigen_..."
    }
  },
  "savedFilename": "geminigen_2025-12-05T16-37-43-900Z_create-a-stunning-instagram-br.png",
  "viewUrl": "http://localhost:3000/api/image-branding/view/geminigen_..."
}
```

---

## Additional Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/image-branding/options` | List available platforms, tones, styles, flavors |
| GET | `/api/image-branding/status` | Service health, API key status, directory info |
| GET | `/api/image-branding/images` | List all generated images with metadata |
| GET | `/api/image-branding/view/:filename` | Serve a generated image (1-year cache) |
| GET | `/api/rate-limit/status` | Rate limit monitoring |
| POST | `/api/rate-limit/clear-queue` | Emergency queue clear |
| GET | `/api/branding/list` | List all saved brandings |
| GET | `/api/branding/:id` | Get specific branding by ID |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `GENGEMINI_API_KEY` | GeminiGen AI API authentication |
| `GEMINI_API_KEY` | Google Gemini API (content generation) |
| `AWS_ACCESS_KEY` | AWS S3 access key |
| `AWS_SECRET_KEY` | AWS S3 secret key |
| `AWS_BUCKET_NAME` | S3 bucket name for image storage |
| `AWS_REGION` | AWS region (e.g., `ap-south-1`) |
| `DB_URI` | MongoDB connection string |
| `PINECONE_API_KEY` | Pinecone vector search (product context) |
| `PINECONE_INDEX` | Pinecone index name |
| `VOYAGE_API_KEY` | Voyage AI embeddings |

---

## Key Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| [gemini-genai.service.ts](src/services/gemini-genai.service.ts) | 837 | Core image generation service |
| [rate-limited-image.service.ts](src/services/rate-limited-image.service.ts) | 313 | Rate limiting wrapper |
| [image-branding.controller.ts](src/controllers/image-branding.controller.ts) | 289 | Image API endpoints |
| [comprehensive-branding.controller.ts](src/controllers/comprehensive-branding.controller.ts) | 254 | Full branding endpoints |
| [image-branding-prompts.ts](src/templates/image-branding-prompts.ts) | 170 | Prompt templates & enhancements |
| [branding.model.ts](src/models/branding.model.ts) | 104 | MongoDB schema |
| [image-branding.types.ts](src/types/image-branding.types.ts) | 56 | TypeScript type definitions |
| [image-branding.routes.ts](src/routes/image-branding.routes.ts) | 39 | Route definitions |
| [s3.ts](src/utils/s3.ts) | 326 | S3 storage utilities |
| [gemini.ts](src/config/gemini.ts) | 28 | Gemini API config |
| [branding.service.ts](src/services/branding.service.ts) | 250+ | Comprehensive branding orchestration |

---

## Design Patterns

- **Singleton:** Both `GeminiGenImageService` and `RateLimitedImageService` use `getInstance()`
- **Wrapper/Decorator:** `RateLimitedImageService` wraps `GeminiGenImageService` to add rate limiting
- **Template Method:** Prompt built from pluggable platform/style/tone/flavor components
- **Graceful Degradation:** S3 failure falls back to local storage; AI content failure falls back to templates
