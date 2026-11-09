import type { ILogRepository } from "../database/repositories/interfaces";
import type { LogLevel } from "../types/domain";
import { toErrorMessage } from "./errors";

export interface ILogger {
  debug(module: string, message: string, meta?: Record<string, unknown>): void;
  info(module: string, message: string, meta?: Record<string, unknown>): void;
  warn(module: string, message: string, meta?: Record<string, unknown>): void;
  error(module: string, message: string, error?: unknown, meta?: Record<string, unknown>): void;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function stringifyMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) return "";
  try {
    return ` ${JSON.stringify(meta, (_key, value) => {
      if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
      }
      if (typeof value === "bigint") return value.toString();
      return value;
    })}`;
  } catch {
    return ` ${String(meta)}`;
  }
}

/**
 * Structured logger writing to stdout/stderr and (best effort) to the Logs table.
 * Persistence failures never break the caller, which is important for a trading loop.
 */
export class Logger implements ILogger {
  private readonly minWeight: number;

  constructor(
    private readonly repository: ILogRepository | null,
    minLevel: LogLevel = "info",
  ) {
    this.minWeight = LEVEL_WEIGHT[minLevel];
  }

  debug(module: string, message: string, meta?: Record<string, unknown>): void {
    this.write("debug", module, message, meta);
  }

  info(module: string, message: string, meta?: Record<string, unknown>): void {
    this.write("info", module, message, meta);
  }

  warn(module: string, message: string, meta?: Record<string, unknown>): void {
    this.write("warn", module, message, meta);
  }

  error(module: string, message: string, error?: unknown, meta?: Record<string, unknown>): void {
    const errorMessage = error === undefined ? "" : `: ${toErrorMessage(error)}`;
    const enriched: Record<string, unknown> = { ...(meta ?? {}) };
    if (error instanceof Error && error.stack) enriched.stack = error.stack;
    this.write("error", module, `${message}${errorMessage}`, enriched);
  }

  private write(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_WEIGHT[level] < this.minWeight) return;

    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${stringifyMeta(meta)}`;

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.log(line);
    }

    if (!this.repository) return;

    void this.repository
      .create({
        time: new Date(),
        module,
        message: `${message}${stringifyMeta(meta)}`,
        level,
      })
      .catch((error: unknown) => {
        console.error(`[logger] failed to persist log entry: ${toErrorMessage(error)}`);
      });
  }
}
