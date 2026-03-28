export type SSEStage =
  | 'validation'
  | 'caption'
  | 'rateLimit'
  | 'image'
  | 'upload'
  | 'save';

export type SSEEventType =
  | 'connected'
  | `stage:${SSEStage}`
  | 'complete'
  | 'error'
  | 'heartbeat';

export type SSEStageStatus = 'started' | 'complete' | 'checking' | 'queued' | 'cleared';

export interface SSEEventData {
  stage?: SSEStage;
  status?: SSEStageStatus;
  progress?: number;
  message?: string;
  data?: Record<string, any>;
  queuePosition?: number;
  estimatedWait?: number;
  code?: string;
  timestamp?: string;
}

export type SSEProgressCallback = (event: SSEEventType, data: SSEEventData) => void;
