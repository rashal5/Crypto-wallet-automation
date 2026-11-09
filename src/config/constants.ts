export const TRADE_STATUS = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;

export const PREDICTION_DIRECTION = {
  BUY: "BUY",
  SELL: "SELL",
  HOLD: "HOLD",
} as const;

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export const MODULES = {
  APP: "app",
  DATABASE: "database",
  MARKET: "market",
  INDICATORS: "indicators",
  PREDICTION: "prediction",
  STRATEGY: "strategy",
  PAPER_TRADING: "paper-trading",
  WALLET: "wallet",
  ANALYTICS: "analytics",
  BACKTEST: "backtest",
  SCHEDULER: "scheduler",
  SETTINGS: "settings",
  HTTP: "http",
} as const;

export const SUPPORTED_INTERVALS = [
  "1",
  "3",
  "5",
  "15",
  "30",
  "60",
  "120",
  "240",
  "360",
  "720",
  "D",
  "W",
  "M",
] as const;

export const INTERVAL_MS: Record<string, number> = {
  "1": 60_000,
  "3": 180_000,
  "5": 300_000,
  "15": 900_000,
  "30": 1_800_000,
  "60": 3_600_000,
  "120": 7_200_000,
  "240": 14_400_000,
  "360": 21_600_000,
  "720": 43_200_000,
  D: 86_400_000,
  W: 604_800_000,
  M: 2_592_000_000,
};

export const DEFAULT_CANDLE_LIMIT = 100;
export const MAX_CANDLE_LIMIT = 1000;
export const MAX_BACKTEST_CANDLES = 10_000;
export const MAX_HISTORY_LIMIT = 500;
