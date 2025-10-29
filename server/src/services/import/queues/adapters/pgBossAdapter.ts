import PgBoss, { Job } from "pg-boss";
import { IJobQueue } from "../jobQueue.js";
import { CSV_PARSE_QUEUE, DATA_INSERT_QUEUE } from "../../workers/jobs.js";
import { createCsvParseWorker } from "../../workers/csvParseWorker.js";
import { createDataInsertWorker } from "../../workers/dataInsertWorker.js";

export class PgBossAdapter implements IJobQueue {
  private boss: PgBoss;
  private ready: boolean = false;

  constructor() {
    this.boss = new PgBoss({
      host: process.env.POSTGRES_HOST || "postgres",
      port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      schema: "pgboss",
      application_name: "data-import-system",
      retryLimit: 0,
    });

    this.boss.on("error", error => {
      console.error("[PgBoss] Error:", error);
    });
  }

  async start(): Promise<void> {
    try {
      await this.boss.start();

      await this.createQueue(CSV_PARSE_QUEUE);
      await this.createQueue(DATA_INSERT_QUEUE);

      await createCsvParseWorker(this);
      await createDataInsertWorker(this);

      this.ready = true;
      console.info("[PgBoss] Started successfully");
    } catch (error) {
      this.ready = false;
      console.error("[PgBoss] Failed to initialize:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.boss.stop();
    console.info("[PgBoss] Stopped successfully");
  }

  async createQueue(queueName: string): Promise<void> {
    await this.boss.createQueue(queueName);
  }

  async send<T>(queueName: string, data: T): Promise<void> {
    await this.boss.send(queueName, data as object);
  }

  async work<T>(queueName: string, handler: (job: T) => Promise<void>): Promise<void> {
    await this.boss.work(
      queueName,
      {
        batchSize: 1,
        pollingIntervalSeconds: 3,
      },
      async ([job]: Job<T>[]) => {
        await handler(job.data);
      }
    );
  }

  isReady(): boolean {
    return this.ready;
  }
}
