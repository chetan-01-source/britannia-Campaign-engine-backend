import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger } from '../config/logger';
import { CampaignLogModel, CampaignStageName, ICampaignStage, CampaignStatus } from '../models/campaign-log.model';
import type { Logger } from 'pino';

interface CampaignRequest {
  productName: string;
  tone: string;
  platform: string;
  style: string;
  flavor?: string;
}

/**
 * CampaignLogger tracks every stage of a single campaign generation.
 *
 * Usage:
 *   const log = CampaignLogger.create(request);
 *   log.stageStart('caption');
 *   ...
 *   log.stageComplete('caption', { model: 'gemini-2.0-flash' });
 *   await log.complete(brandingId);
 */
export class CampaignLogger {
  public readonly correlationId: string;
  private readonly request: CampaignRequest;
  private readonly log: Logger;
  private readonly stages: ICampaignStage[] = [];
  private readonly startTime: number;
  private status: CampaignStatus = 'started';

  constructor(correlationId: string, request: CampaignRequest) {
    this.correlationId = correlationId;
    this.request = request;
    this.log = createRequestLogger(correlationId);
    this.startTime = Date.now();

    this.log.info({ request }, 'Campaign generation started');
  }

  /** Create a new CampaignLogger with an auto-generated correlationId */
  static create(request: CampaignRequest): CampaignLogger {
    return new CampaignLogger(uuidv4(), request);
  }

  /** Mark a stage as started */
  stageStart(name: CampaignStageName, metadata?: Record<string, any>): void {
    const stage: ICampaignStage = {
      name,
      status: 'started',
      startedAt: new Date(),
      metadata,
    };
    this.stages.push(stage);
    this.log.info({ stage: name, ...metadata }, `Stage ${name} started`);
  }

  /** Mark the most recent instance of a stage as completed */
  stageComplete(name: CampaignStageName, metadata?: Record<string, any>): void {
    const stage = this.findStage(name);
    if (!stage) {
      this.log.warn({ stage: name }, `Stage ${name} completed but was never started`);
      return;
    }
    stage.status = 'completed';
    stage.completedAt = new Date();
    stage.durationMs = stage.completedAt.getTime() - stage.startedAt.getTime();
    if (metadata) {
      stage.metadata = { ...stage.metadata, ...metadata };
    }
    this.log.info(
      { stage: name, durationMs: stage.durationMs, ...metadata },
      `Stage ${name} completed in ${stage.durationMs}ms`
    );
  }

  /** Mark a stage as failed with an error code */
  stageFailed(name: CampaignStageName, error: unknown, code: string): void {
    const stage = this.findStage(name) || this.addNewStage(name);
    stage.status = 'failed';
    stage.completedAt = new Date();
    stage.durationMs = stage.completedAt.getTime() - stage.startedAt.getTime();
    stage.error = {
      message: error instanceof Error ? error.message : String(error),
      code,
      stack: error instanceof Error ? error.stack : undefined,
    };
    this.log.error(
      { stage: name, errorCode: code, durationMs: stage.durationMs, err: error },
      `Stage ${name} failed: ${code}`
    );
  }

  /** Mark a stage as skipped */
  stageSkipped(name: CampaignStageName, reason?: string): void {
    this.stages.push({
      name,
      status: 'skipped',
      startedAt: new Date(),
      metadata: reason ? { reason } : undefined,
    });
    this.log.info({ stage: name, reason }, `Stage ${name} skipped`);
  }

  /** Finalize as completed and persist to MongoDB */
  async complete(brandingId: string): Promise<void> {
    this.status = 'completed';
    const totalDurationMs = Date.now() - this.startTime;

    this.log.info(
      { brandingId, totalDurationMs },
      `Campaign completed in ${totalDurationMs}ms`
    );

    await this.persist(brandingId, totalDurationMs);
  }

  /** Finalize as failed and persist to MongoDB */
  async fail(error: unknown): Promise<void> {
    this.status = 'failed';
    const totalDurationMs = Date.now() - this.startTime;

    this.log.error(
      { totalDurationMs, err: error },
      `Campaign failed after ${totalDurationMs}ms`
    );

    await this.persist(null, totalDurationMs);
  }

  /** Persist the full campaign log document to MongoDB */
  private async persist(brandingId: string | null, totalDurationMs: number): Promise<void> {
    try {
      await CampaignLogModel.create({
        correlationId: this.correlationId,
        brandingId: brandingId ?? undefined,
        request: this.request,
        status: this.status,
        stages: this.stages,
        totalDurationMs,
        completedAt: new Date(),
      });
    } catch (err) {
      // Log persistence failure but don't throw — campaign itself already succeeded/failed
      this.log.error({ err }, 'Failed to persist campaign log to MongoDB');
    }
  }

  /** Find the last stage entry with the given name that is still 'started' */
  private findStage(name: CampaignStageName): ICampaignStage | undefined {
    for (let i = this.stages.length - 1; i >= 0; i--) {
      if (this.stages[i].name === name && this.stages[i].status === 'started') {
        return this.stages[i];
      }
    }
    return undefined;
  }

  /** Add a new stage entry (used when stageFailed is called without a prior stageStart) */
  private addNewStage(name: CampaignStageName): ICampaignStage {
    const stage: ICampaignStage = {
      name,
      status: 'started',
      startedAt: new Date(),
    };
    this.stages.push(stage);
    return stage;
  }
}
