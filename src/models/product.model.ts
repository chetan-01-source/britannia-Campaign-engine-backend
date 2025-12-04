import mongoose, { Document, Schema } from 'mongoose';

// Interface for Product document
export interface IProduct extends Document {
  name: string;
  description?: string;
  category?: string;
  productUrl?: string;
  slug?: string;
  images?: {
    primary?: string;
    gallery?: string[];
    thumbnails?: string[];
  };
  productHighlights?: string[];
  createdAt: Date;
  updatedAt: Date;
  scrapedAt: Date;
  source: string;
  isActive: boolean;
}

// Product schema definition
const ProductSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  category: {
    type: String,
    trim: true,
    maxlength: 100,
    index: true
  },
  productUrl: {
    type: String,
    trim: true
  },
  slug: {
    type: String,
    trim: true,
    index: true,
    unique: true,
    sparse: true
  },
  images: {
    primary: {
      type: String,
      trim: true
    },
    gallery: [{
      type: String,
      trim: true
    }],
    thumbnails: [{
      type: String,
      trim: true
    }]
  },
  productHighlights: [{
    type: String,
    trim: true,
    maxlength: 200
  }],
  scrapedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  source: {
    type: String,
    default: 'britannia-scraper',
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  collection: 'Products'
});

// Create indexes for better query performance
ProductSchema.index({ name: 1, category: 1 });
ProductSchema.index({ scrapedAt: -1 });
ProductSchema.index({ source: 1, isActive: 1 });

// Export the model
export const ProductModel = mongoose.model<IProduct>('Product', ProductSchema);