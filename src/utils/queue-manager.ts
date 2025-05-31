import PQueue from 'p-queue';
import { logger } from './logger.js';

export class QueueManager {
  private queues = new Map<string, PQueue>();

  constructor(private defaultConcurrency = 5) {}

  getQueue(name: string, concurrency?: number): PQueue {
    const existingQueue = this.queues.get(name);
    if (existingQueue) {
      return existingQueue;
    }

    const queue = new PQueue({
      concurrency: concurrency || this.defaultConcurrency,
      throwOnTimeout: true
    });

    queue.on('active', () => {
      logger.debug({ queue: name, size: queue.size, pending: queue.pending }, 'Queue active');
    });

    queue.on('error', error => {
      logger.error({ error, queue: name }, 'Queue error');
    });

    this.queues.set(name, queue);
    return queue;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down queue manager...');

    const shutdownPromises = Array.from(this.queues.entries()).map(async ([name, queue]) => {
      logger.debug({ queue: name }, 'Shutting down queue');
      queue.pause();
      await queue.onIdle();
      queue.clear();
    });

    await Promise.all(shutdownPromises);
    this.queues.clear();

    logger.info('Queue manager shut down complete');
  }

  getStats(): Record<string, { size: number; pending: number; isPaused: boolean }> {
    const stats: Record<string, { size: number; pending: number; isPaused: boolean }> = {};

    for (const [name, queue] of this.queues.entries()) {
      stats[name] = {
        size: queue.size,
        pending: queue.pending,
        isPaused: queue.isPaused
      };
    }

    return stats;
  }
}

export const queueManager = new QueueManager();
