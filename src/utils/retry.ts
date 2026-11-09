import { sleep } from "./time";
import { toErrorMessage } from "./errors";

export interface RetryOptions {
  retries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Exponential backoff with jitter. Used for exchange and Python calls where a
 * transient failure should not abort the trading cycle.
 */
export async function retry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const retries = Math.max(0, options.retries);
  const baseDelay = options.baseDelayMs ?? 250;
  const maxDelay = options.maxDelayMs ?? 5_000;
  const shouldRetry = options.shouldRetry ?? (() => true);

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === retries;

      if (isLastAttempt || !shouldRetry(error, attempt)) {
        throw error;
      }

      const exponential = Math.min(maxDelay, baseDelay * 2 ** attempt);
      const delay = Math.round(exponential * (0.75 + Math.random() * 0.5));
      options.onRetry?.(error, attempt + 1, delay);
      await sleep(delay);
    }
  }

  throw new Error(`Retry operation failed: ${toErrorMessage(lastError)}`);
}
