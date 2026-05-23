import { logger } from './logger.ts';

export async function processBatchWithRateLimit<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: { concurrency?: number; delayMs?: number } = {}
): Promise<R[]> {
  const { concurrency = 1, delayMs = 0 } = options;

  const results: R[] = [];
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];

      try {
        const result = await processor(item);
        results[currentIndex] = result;
        
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (err) {
        logger.error('batch-processor', `Failed to process item ${currentIndex}`, {
          error: String(err),
        });
      }
    }
  };

  const workers = Array(concurrency).fill(null).map(() => worker());
  await Promise.all(workers);

  return results;
}
