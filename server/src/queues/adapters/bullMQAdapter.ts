import { Job, Queue, QueueEvents, Worker } from "bullmq";
import { IJobQueue, JobConfig, JobData, JobResult } from "../jobQueue.js";

export class BullMQAdapter implements IJobQueue {
  private readonly connection: { host: string; port: number; password?: string };
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  constructor() {
    this.connection = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
    };

    console.info(`[BullMQ] Configuration: Redis at ${this.connection.host}:${this.connection.port}`);
  }

  async start(): Promise<void> {
    console.info("[BullMQ] Started successfully");
  }

  async stop(): Promise<void> {
    console.info("[BullMQ] Stopping...");

    // Close all workers first
    await Promise.all(Array.from(this.workers.values()).map(worker => worker.close()));
    this.workers.clear();

    // Close all queue events
    await Promise.all(Array.from(this.queueEvents.values()).map(qe => qe.close()));
    this.queueEvents.clear();

    // Close all queues (this closes their Redis connections)
    await Promise.all(Array.from(this.queues.values()).map(queue => queue.close()));
    this.queues.clear();

    console.info("[BullMQ] Stopped successfully");
  }

  async createQueue(queueName: string): Promise<void> {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: this.connection,
        defaultJobOptions: {
          attempts: 1, // No retries, same as pg-boss
          removeOnComplete: true,
          removeOnFail: false, // Keep failed jobs for debugging
        },
      });

      this.queues.set(queueName, queue);

      // Create QueueEvents for monitoring
      const queueEvents = new QueueEvents(queueName, {
        connection: this.connection,
      });

      this.queueEvents.set(queueName, queueEvents);

      // Log job events
      queueEvents.on("completed", ({ jobId }) => {
        console.info(`[BullMQ] Job ${jobId} completed in queue ${queueName}`);
      });

      queueEvents.on("failed", ({ jobId, failedReason }) => {
        console.error(`[BullMQ] Job ${jobId} failed in queue ${queueName}:`, failedReason);
      });
    }
  }

  async send<T>(queueName: string, data: T, options?: { priority?: number; delay?: number }): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found. Call createQueue first.`);
    }

    const job = await queue.add(queueName, data, {
      priority: options?.priority,
      delay: options?.delay,
    });

    if (!job.id) {
      throw new Error(`Failed to enqueue job to ${queueName}`);
    }

    return job.id;
  }

  async work<T>(
    queueName: string,
    config: JobConfig,
    handler: (jobs: JobData<T>[]) => Promise<void | JobResult>
  ): Promise<void> {
    const worker = new Worker(
      queueName,
      async (job: Job<T>) => {
        const normalizedJob: JobData<T> = {
          id: job.id!,
          data: job.data,
        };

        // BullMQ processes one job at a time per worker
        // We wrap it in an array to match the interface
        await handler([normalizedJob]);
      },
      {
        connection: this.connection,
        concurrency: config.concurrency ?? config.batchSize ?? 1,
        limiter: config.limiter,
      }
    );

    worker.on("error", error => {
      console.error(`[BullMQ] Worker error in queue ${queueName}:`, error);
    });

    worker.on("failed", (job, error) => {
      console.error(`[BullMQ] Job ${job?.id} failed in queue ${queueName}:`, error);
    });

    this.workers.set(queueName, worker);
  }
}
