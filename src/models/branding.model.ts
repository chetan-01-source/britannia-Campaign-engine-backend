import mongoose, { Document, Schema } from 'mongoose';

export interface IBranding extends Document {
  productName: string;
  platform: string;
  tone: string;
  style: string;
  flavor?: string;
  generatedCaption: string;
  generatedTagline: string;
  imageUrl: string;
  localImagePath: string;
  prompt: string;
  metadata: {
    dimensions: string;
    format: string;
    generatedAt: Date;
    freepikTaskId?: string;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BrandingSchema = new Schema<IBranding>({
  productName: {
    type: String,
    required: true,
    trim: true
  },
  platform: {
    type: String,
    required: true,
    enum: ['instagram', 'linkedin', 'email', 'facebook', 'twitter'],
    lowercase: true
  },
  tone: {
    type: String,
    required: true,
    enum: ['youth', 'family', 'premium', 'health', 'traditional', 'professional'],
    lowercase: true
  },
  style: {
    type: String,
    required: true,
    enum: ['minimalist', 'vibrant', 'premium', 'playful'],
    default: 'minimalist'
  },
  flavor: {
    type: String,
    trim: true
  },
  generatedCaption: {
    type: String,
    required: true
  },
  generatedTagline: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  localImagePath: {
    type: String,
    required: true
  },
  prompt: {
    type: String,
    required: true
  },
  metadata: {
    dimensions: {
      type: String,
      default: '1024x1024'
    },
    format: {
      type: String,
      default: 'jpeg'
    },
    generatedAt: {
      type: Date,
      default: Date.now
    },
    freepikTaskId: String
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
BrandingSchema.index({ productName: 1 });
BrandingSchema.index({ platform: 1, tone: 1 });
BrandingSchema.index({ createdAt: -1 });
BrandingSchema.index({ isActive: 1 });

export const BrandingModel = mongoose.model<IBranding>('Branding', BrandingSchema, 'brandings');