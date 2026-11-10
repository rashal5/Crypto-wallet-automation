import { INTERVAL_MS } from "../config/constants";

export function now(): Date {
  return new Date();
}

export function startOfUtcDay(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function endOfUtcDay(date: Date = new Date()): Date {
  return new Date(startOfUtcDay(date).getTime() + 86_400_000 - 1);
}

export function addMilliseconds(date: Date, milliseconds: number): Date {
  return new Date(date.getTime() + milliseconds);
}

export function intervalToMilliseconds(interval: string): number {
  const value = INTERVAL_MS[interval];
  if (!value) {
    throw new Error(`Unsupported candle interval: ${interval}`);
  }
  return value;
}

/**
 * Exchanges return the currently forming candle too. Paper trading must only run on
 * closed candles, so a candle is considered closed once timestamp + interval <= now.
 */
export function isCandleClosed(timestamp: Date, interval: string, reference: Date = new Date()): boolean {
  const intervalMs = intervalToMilliseconds(interval);
  return timestamp.getTime() + intervalMs <= reference.getTime();
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(1)}s`;
  return `${(milliseconds / 60_000).toFixed(1)}m`;
}
