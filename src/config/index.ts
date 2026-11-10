import dotenv from "dotenv";
import path from "node:path";
import type { LogLevel } from "../types/domain";

dotenv.config();

function readString(key: string, fallback: string): string {
  const value = process.env[key];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

function readNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${key} must be a number (received "${raw}")`);
  }
  return parsed;
}

function readBoolean(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`Environment variable ${key} must be a boolean (received "${raw}")`);
}

function readLogLevel(key: string, fallback: LogLevel): LogLevel {
  const raw = readString(key, fallback).toLowerCase();
  if (!["debug", "info", "warn", "error"].includes(raw)) {
    throw new Error(`Environment variable ${key} must be debug|info|warn|error`);
  }
  return raw as LogLevel;
}

export interface AppConfig {
  readonly nodeEnv: string;
  readonly isProduction: boolean;
  readonly port: number;
  readonly databaseUrl: string;
  readonly coinbase: {
    readonly baseUrl: string;
    readonly timeoutMs: number;
    readonly retries: number;
    readonly maxKlineLimit: number;
  };
  readonly market: {
    readonly symbol: string;
    readonly interval: string;
    readonly historyCandles: number;
    readonly lookbackCandles: number;
  };
  readonly trading: {
    readonly startingBalance: number;
    readonly tradeSize: number;
    readonly buyFeePercent: number;
    readonly sellFeePercent: number;
    readonly stopLossPercent: number;
    readonly takeProfitPercent: number;
    readonly paperTradingEnabled: boolean;
    readonly rsiBuyThreshold: number;
    readonly aiConfidenceThreshold: number;
    readonly strategyName: string;
  };
  readonly prediction: {
    readonly pythonBin: string;
    readonly scriptPath: string;
    readonly timeoutMs: number;
  };
  readonly scheduler: {
    readonly cronExpression: string;
  };
  readonly logging: {
    readonly level: LogLevel;
  };
  readonly http: {
    readonly corsOrigin: string;
    readonly apiPrefix: string;
  };
}

const nodeEnv = readString("NODE_ENV", "development");

export const config: AppConfig = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: readNumber("PORT", 4000),
  databaseUrl: readString("DATABASE_URL", "file:./dev.db"),
  coinbase: Object.freeze({
    baseUrl: readString("COINBASE_BASE_URL", "https://api.coinbase.com"),
    timeoutMs: readNumber("COINBASE_TIMEOUT_MS", 15_000),
    retries: readNumber("COINBASE_RETRIES", 3),
    maxKlineLimit: 350,
  }),
  market: Object.freeze({
    symbol: readString("SYMBOL", "BTC-USD"),
    interval: readString("INTERVAL", "1"),
    historyCandles: readNumber("HISTORY_CANDLES", 1000),
    lookbackCandles: readNumber("MARKET_LOOKBACK_CANDLES", 400),
  }),
  trading: Object.freeze({
    startingBalance: readNumber("STARTING_BALANCE", 80),
    tradeSize: readNumber("TRADE_SIZE", 10),
    buyFeePercent: readNumber("BUY_FEE", 0.1),
    sellFeePercent: readNumber("SELL_FEE", 0.1),
    stopLossPercent: readNumber("STOP_LOSS", 2),
    takeProfitPercent: readNumber("TAKE_PROFIT", 3),
    paperTradingEnabled: readBoolean("PAPER_TRADING_ENABLED", true),
    rsiBuyThreshold: readNumber("RSI_BUY_THRESHOLD", 35),
    aiConfidenceThreshold: readNumber("AI_CONFIDENCE_THRESHOLD", 80),
    strategyName: readString("STRATEGY_NAME", "rsi-ema-ai"),
  }),
  prediction: Object.freeze({
    pythonBin: readString("PREDICTION_PYTHON", process.platform === "win32" ? "python" : "python3"),
    scriptPath: path.resolve(process.cwd(), readString("PREDICTION_SCRIPT", "python/predictor.py")),
    timeoutMs: readNumber("PREDICTION_TIMEOUT_MS", 15_000),
  }),
  scheduler: Object.freeze({
    cronExpression: readString("CRON_EXPRESSION", "* * * * *"),
  }),
  logging: Object.freeze({
    level: readLogLevel("LOG_LEVEL", "info"),
  }),
  http: Object.freeze({
    corsOrigin: readString("CORS_ORIGIN", "*"),
    apiPrefix: readString("API_PREFIX", "/api"),
  }),
});
