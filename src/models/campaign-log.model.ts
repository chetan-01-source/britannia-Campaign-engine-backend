import mongoose, { Schema, Document } from 'mongoose';

export type CampaignStageName =
  | 'validation'
  | 'caption'
  | 'rateLimit'
  | 'imageGeneration'
  | 's3Upload'
  | 'mongoSave';

export type CampaignStageStatus = 'started' | 'completed' | 'failed' | 'skipped';
export type CampaignStatus = 'started' | 'completed' | 'failed';

export interface ICampaignStage {
  name: CampaignStageName;
  status: CampaignStageStatus;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  metadata?: Record<string, any>;
  error?: {
    message: string;
    code: string;
    stack?: string;
  };
}

export interface ICampaignLog extends Document {
  correlationId: string;
  brandingId?: string;
  request: {
    productName: string;
    tone: string;
    platform: string;
    style: string;
    flavor?: string;
  };
  status: CampaignStatus;
  stages: ICampaignStage[];
  totalDurationMs?: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const CampaignStageSchema = new Schema({
  name: {
    type: String,
    required: true,
    enum: ['validation', 'caption', 'rateLimit', 'imageGeneration', 's3Upload', 'mongoSave'],
  },
  status: {
    type: String,
    required: true,
    enum: ['started', 'completed', 'failed', 'skipped'],
  },
  startedAt: { type: Date, required: true },
  completedAt: { type: Date },
  durationMs: { type: Number },
  metadata: { type: Schema.Types.Mixed },
  error: {
    message: { type: String },
    code: { type: String },
    stack: { type: String },
  },
}, { _id: false });

const CampaignLogSchema = new Schema({
  correlationId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  brandingId: { type: String, default: null },
  request: {
    productName: { type: String, required: true },
    tone: { type: String, required: true },
    platform: { type: String, required: true },
    style: { type: String, required: true },
    flavor: { type: String },
  },
  status: {
    type: String,
    required: true,
    enum: ['started', 'completed', 'failed'],
    index: true,
  },
  stages: [CampaignStageSchema],
  totalDurationMs: { type: Number },
  completedAt: { type: Date },
}, {
  timestamps: true,
});

// Compound indexes for common queries
CampaignLogSchema.index({ createdAt: -1 });
CampaignLogSchema.index({ 'request.productName': 1, createdAt: -1 });
CampaignLogSchema.index({ status: 1, createdAt: -1 });

export const CampaignLogModel = mongoose.model<ICampaignLog>('CampaignLog', CampaignLogSchema);
