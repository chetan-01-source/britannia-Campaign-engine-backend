# RAG AI Backend - Comprehensive Branding System

A powerful AI-driven branding content generation system that creates marketing captions, taglines, hashtags, and branded images using Gemini AI and FreePik API.

## 🚀 Features

- **AI Content Generation**: Generate marketing captions, taglines, and hashtags using Google Gemini AI
- **Image Generation**: Create branded product images using FreePik API
- **S3 Storage**: Automatic upload and storage of generated images to AWS S3
- **MongoDB Integration**: Store and retrieve branding content with pagination
- **Multi-platform Support**: Generate content optimized for different social media platforms
- **Flexible Styling**: Multiple tone and style options for different brand personalities

## 🏗️ System Architecture Overview

### **How We Collected the Data**

Our system implements a comprehensive **hybrid API-DOM scraping approach** to collect Britannia product data:

**Step 1: API Data Discovery**
- Utilized Britannia's internal `impact.json` API endpoint to discover product categories and slugs
- Endpoint: `https://www.britannia.co.in/_next/data/Oh7r5_ff2eW4oXI4AhUw-/impact.json`
- This provides structured product metadata including category names, slugs, and navigation data

**Step 2: Individual Product Scraping**
- For each product slug discovered, we perform targeted scraping of individual product pages
- URL Pattern: `https://www.britannia.co.in/product/{slug}`
- Extract detailed product information including:
  - Product names, descriptions, and categories
  - High-resolution product images and galleries
  - Product highlights and specifications
  - Nutritional information and ingredients

**Step 3: Data Validation & Storage**
- Implement robust validation for scraped data (image URLs, text content, product details)
- Store raw product data in MongoDB for persistence
- Backup structured data to AWS S3 with timestamps
- Generate comprehensive metadata including scraping timestamps and source tracking

**Data Pipeline Features:**
- **Automated Scheduling**: Runs every 12 hours using cron jobs
- **Duplicate Prevention**: Checks existing data before processing
- **Error Handling**: Robust retry logic and failure recovery
- **Rate Limiting**: Controlled request timing to respect website policies

### **How the Brand DNA was Constructed**

Our **Brand DNA system** creates personalized branding content by combining multiple AI technologies:

**1. Template-Based Prompt Engineering**
- **Tone Specifications**: 6 distinct brand personalities (youth, family, premium, health, traditional, professional)
- **Platform Optimizations**: Content tailored for Instagram, LinkedIn, and email marketing
- **Style Variants**: Visual aesthetics (minimalist, vibrant, premium, playful)
- **Dynamic Context**: Product-specific flavor and feature integration

**2. Vector-Based Product Intelligence**
- **Text Preprocessing**: Convert product data into meaningful text chunks
- **Embedding Generation**: Use VoyageAI to create semantic embeddings
- **Vector Storage**: Store in Pinecone for similarity-based retrieval
- **Context Enrichment**: Find similar products to enhance content relevance

**3. AI Content Generation Pipeline**
```
Product Input → Context Retrieval → Template Building → Gemini AI → Content Output
     ↓              ↓                    ↓              ↓            ↓
Product Name → Similar Products → Tone+Platform → AI Processing → Caption+Tags+CTA
```

**4. Brand Consistency Framework**
- **Tone Mapping**: Specific language patterns for each brand personality
- **Platform Rules**: Character limits, hashtag counts, and format requirements
- **Content Structure**: Standardized output format (Caption, Hashtags, CTA)

### **How the Workflow Functions**

**Complete Branding Generation Workflow:**

**Phase 1: Request Processing**
```
API Request → Validation → Parameter Normalization → Context Building
```
- Validate required parameters (productName, tone)
- Apply defaults for optional parameters (platform=instagram, style=minimalist)
- Normalize inputs to ensure consistency

**Phase 2: AI Content Generation**
```
Product Context → Template System → Gemini AI → Structured Content
```
- Retrieve similar products from vector database for context
- Build dynamic prompts using template system
- Generate content with retry logic and error handling
- Parse AI output into structured format (caption, hashtags, CTA)

**Phase 3: Image Generation**
```
Content + Styling → FreePik API → Image Generation → S3 Storage
```
- Combine generated content with visual styling parameters
- Create comprehensive prompts for FreePik image generation
- Handle FreePik API styling constraints and validation
- Upload generated images to S3 with public access

**Phase 4: Data Persistence**
```
Complete Package → MongoDB Storage → Response Formatting
```
- Store comprehensive branding package in MongoDB
- Include metadata (timestamps, model versions, generation parameters)
- Return structured response with S3 URLs and database IDs

**Background Data Pipeline:**
```
Scheduler → Scraping → Processing → Vector Generation → Storage
```
- **Every 12 hours**: Automated data collection from Britannia
- **Text Processing**: Convert products into searchable chunks
- **Embedding Generation**: Create vector representations
- **Pinecone Storage**: Enable semantic product search
- **Duplicate Handling**: Skip existing data to maintain efficiency

**Real-time Features:**
- **Similarity Search**: Find related products for context enhancement
- **Template Rendering**: Dynamic prompt building based on parameters
- **Error Recovery**: Automatic fallback mechanisms
- **Performance Optimization**: Caching and efficient database queries

## 📋 API Endpoints

### 1. Generate Comprehensive Branding Content
**POST** `/api/branding/generate`

Generate complete branding package including caption, tagline, hashtags, and branded image.

**Request Body:**
```json
{
  "productName": "Be You NUTRITION BAR",
  "tone": "professional",
  "platform": "instagram",
  "style": "premium",
  "flavor": "classic recipe"
}
```

### 2. Get All Branding Content (Paginated)
**GET** `/api/branding/list`

Retrieve all branding content with pagination support.

**Query Parameters:**
```
?limit=10&skip=0
?limit=15&page=2
?limit=20&skip=40
```

### 3. Get Specific Branding Content
**GET** `/api/branding/:id`

Retrieve specific branding content by ID.

## 🎯 Supported Parameters

### **Tone** (Required)
Controls the brand personality and messaging style:

- `youth` - Energetic, trendy, casual language for younger demographics
- `family` - Warm, inclusive, family-oriented messaging
- `premium` - Sophisticated, luxury-focused, high-end language
- `health` - Health-conscious, wellness-focused messaging
- `traditional` - Classic, time-tested, heritage-focused
- `professional` - Business-oriented, formal, corporate language

### **Platform** (Optional, default: `instagram`)
Optimizes content format and style for specific platforms:

- `instagram` - Square images (1024x1024), hashtag-optimized captions
- `linkedin` - Professional networking focus, business-appropriate content
- `email` - Email marketing optimized content and formatting

### **Style** (Optional, default: `minimalist`)
Visual styling for generated images:

- `minimalist` - Clean, simple, uncluttered design
- `vibrant` - Bold colors, energetic visual elements
- `premium` - Luxury aesthetics, sophisticated design elements
- `playful` - Fun, colorful, creative visual approach

### **Flavor** (Optional)
Additional context or product variant information:

- Any string value (e.g., "classic recipe", "sugar-free", "organic", "limited edition")
- Used to add specific product context to generated content

## 📝 Example Requests

### Basic Request
```bash
curl -X POST http://localhost:3000/api/branding/generate \
  -H "Content-Type: application/json" \
  -d '{
    "productName": "Be You NUTRITION BAR",
    "tone": "health"
  }'
```

### Advanced Request
```bash
curl -X POST http://localhost:3000/api/branding/generate \
  -H "Content-Type: application/json" \
  -d '{
    "productName": "Premium Coffee Blend",
    "tone": "premium",
    "platform": "linkedin",
    "style": "minimalist",
    "flavor": "Ethiopian single origin"
  }'
```

### Pagination Example
```bash
# Get first page (10 items)
curl "http://localhost:3000/api/branding/list?limit=10&page=1"

# Get specific range using skip
curl "http://localhost:3000/api/branding/list?limit=20&skip=40"
```

## 📊 Response Format

### Successful Generation Response
```json
{
  "success": true,
  "message": "Comprehensive branding content generated successfully",
  "data": {
    "_id": "675123abc...",
    "productName": "Be You NUTRITION BAR",
    "tone": "professional",
    "platform": "instagram",
    "style": "premium",
    "flavor": "classic recipe",
    "caption": "Elevate your nutrition game with Be You NUTRITION BAR...",
    "tagline": "Be You NUTRITION BAR - Professional Appeal",
    "imageUrl": "https://your-bucket.s3.amazonaws.com/images/...",
    "localImagePath": "freepik_...",
    "prompt": "Professional premium nutrition bar branding image...",
    "hashtags": ["#BeYou", "#Nutrition", "#Professional"],
    "cta": "Fuel your success today!",
    "metadata": {
      "dimensions": "1024x1024",
      "format": "base64_png",
      "generatedAt": "2025-12-04T...",
      "s3Key": "images/...",
      "s3Url": "https://..."
    },
    "createdAt": "2025-12-04T..."
  },
  "timestamp": "2025-12-04T..."
}
```

### Paginated List Response
```json
{
  "success": true,
  "data": [...],
  "totalCount": 150,
  "pagination": {
    "currentPage": 2,
    "totalPages": 15,
    "limit": 10,
    "skip": 10,
    "hasNext": true,
    "hasPrev": true
  },
  "timestamp": "2025-12-04T..."
}
```

## 🔧 Environment Variables

```env
# Database
MONGODB_URI=mongodb://localhost:27017/branding-db

# AI Services
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
FREEPIK_API_KEY=your_freepik_api_key

# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_BUCKET_NAME=your-s3-bucket-name
AWS_REGION=us-east-1

# Pinecone (Optional - for enhanced product context)
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=your_index_name
PINECONE_ENVIRONMENT=your_environment

# Server Configuration
PORT=3000
NODE_ENV=development
```

## 🚀 Quick Start

1. **Clone and Install**
```bash
git clone <repository>
cd backend
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
# Configure your API keys and database settings
```

3. **Start Development Server**
```bash
npm run dev
```

4. **Test the API**
```bash
curl -X POST http://localhost:3000/api/branding/generate \
  -H "Content-Type: application/json" \
  -d '{
    "productName": "Test Product",
    "tone": "youth",
    "platform": "instagram"
  }'
```

## 🏗️ System Architecture

### Core Services
- **BrandingService**: Main orchestration service for content generation
- **FreePikImageService**: Handles AI image generation and S3 storage
- **GeminiService**: AI content generation using Google Gemini
- **S3Service**: AWS S3 file upload and management
- **MongoDB**: Data persistence with Mongoose ODM

### Content Generation Flow
1. **Request Validation**: Validate tone, platform, style parameters
2. **AI Content Generation**: Generate caption, tagline, hashtags using Gemini
3. **Image Generation**: Create branded image using FreePik API
4. **S3 Upload**: Store generated image in AWS S3 with public access
5. **Database Storage**: Save complete branding package to MongoDB
6. **Response**: Return comprehensive branding data with S3 URLs

## 🔍 Validation Rules

- **productName**: Required, non-empty string
- **tone**: Must be one of: `youth`, `family`, `premium`, `health`, `traditional`, `professional`
- **platform**: Must be one of: `instagram`, `linkedin`, `email` (optional)
- **style**: Must be one of: `minimalist`, `vibrant`, `premium`, `playful` (optional)
- **flavor**: Optional string for additional product context
- **Pagination**: `limit` max 100, `skip` non-negative

## 📱 Platform Optimizations

### Instagram
- **Image**: 1024x1024 square format
- **Content**: Hashtag-optimized, visual-first approach
- **Style**: Social media friendly, engaging

### LinkedIn
- **Image**: Professional orientation
- **Content**: Business-focused, formal tone
- **Style**: Corporate appropriate

### Email
- **Image**: Email-compatible dimensions
- **Content**: Direct marketing focus
- **Style**: Conversion-oriented

## 🛠️ Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **AI**: Google Gemini Pro, FreePik API
- **Storage**: AWS S3
- **Vector DB**: Pinecone (optional)
- **Development**: Nodemon, TypeScript compiler

## 📈 Performance Features

- **Retry Logic**: Automatic retry for API failures
- **Error Handling**: Comprehensive error responses
- **Pagination**: Efficient data retrieval with skip/limit
- **Caching**: S3 storage for persistent image access
- **Validation**: Input validation at multiple levels

---

**🎨 Ready to generate amazing branding content for your products!**