export interface IJobQueue {
  start(): Promise<void>;
  stop(): Promise<void>;
  createQueue(queueName: string): Promise<void>;
  send<T>(queueName: string, data: T): Promise<void>;
  work<T>(queueName: string, handler: (job: T) => Promise<void>): Promise<void>;
  isReady(): boolean;
}
