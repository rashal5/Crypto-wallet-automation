import type { AppConfig } from "../../config";
import type { IHttpClient } from "../../utils/http-client";
import type { ILogger } from "../../utils/logger";
import { ExternalServiceError, ValidationError } from "../../utils/errors";
import { MODULES } from "../../config/constants";

export interface RawCandle {
  symbol: string;
  interval: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CoinbaseCandle {
  start: string;
  low: string;
  high: string;
  open: string;
  close: string;
  volume: string;
}

export interface CoinbaseCandlesResponse {
  candles?: CoinbaseCandle[];
}

export interface FetchKlinesParams {
  symbol: string;
  interval: string;
  limit: number;
  /** Exclusive range end as epoch milliseconds. */
  end?: number;
  /** Inclusive range start as epoch milliseconds. */
  start?: number;
}

export interface ICoinbaseClient {
  fetchKlines(params: FetchKlinesParams): Promise<RawCandle[]>;
}

/**
 * Local interval strings map to the granularities accepted by the Coinbase
 * Advanced Trade market-data endpoint.
 */
const GRANULARITY_BY_INTERVAL: Record<string, string> = {
  "1": "ONE_MINUTE",
  "5": "FIVE_MINUTE",
  "15": "FIFTEEN_MINUTE",
  "30": "THIRTY_MINUTE",
  "60": "ONE_HOUR",
  "120": "TWO_HOUR",
  "360": "SIX_HOUR",
  D: "ONE_DAY",
};

const GRANULARITY_SECONDS: Record<string, number> = {
  ONE_MINUTE: 60,
  FIVE_MINUTE: 300,
  FIFTEEN_MINUTE: 900,
  THIRTY_MINUTE: 1_800,
  ONE_HOUR: 3_600,
  TWO_HOUR: 7_200,
  SIX_HOUR: 21_600,
  ONE_DAY: 86_400,
};

function parseNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ExternalServiceError(`Coinbase returned a non-numeric ${field}: ${value}`);
  }
  return parsed;
}

/**
 * Normalizes common symbol formats to the Coinbase product id form (BASE-QUOTE),
 * e.g. BTCUSDT -> BTC-USD and ethusd -> ETH-USD.
 */
export function toProductId(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (upper === "") {
    throw new ValidationError("Symbol is required");
  }
  if (upper.includes("-")) return upper;

  const match = /^([A-Z0-9]{2,12})(USDT|USDC|USD|EUR|GBP|BTC|ETH)$/.exec(upper);
  if (!match) {
    throw new ValidationError(
      `Cannot map symbol "${symbol}" to a Coinbase product id (expected e.g. BTC-USD)`,
    );
  }

  const base = match[1] as string;
  const quote = match[2] === "USDT" ? "USD" : (match[2] as string);
  return `${base}-${quote}`;
}

/**
 * Public market-data client for the Coinbase Advanced Trade brokerage API. This
 * client has no authentication and can only read candles. It deliberately
 * exposes no order/trading methods.
 */
export class CoinbaseClient implements ICoinbaseClient {
  constructor(
    private readonly http: IHttpClient,
    private readonly config: AppConfig,
    private readonly logger: ILogger,
  ) {}

  async fetchKlines(params: FetchKlinesParams): Promise<RawCandle[]> {
    if (params.limit < 1 || params.limit > this.config.coinbase.maxKlineLimit) {
      throw new ValidationError(
        `Kline limit must be between 1 and ${this.config.coinbase.maxKlineLimit}`,
      );
    }

    const granularity = GRANULARITY_BY_INTERVAL[params.interval];
    if (!granularity) {
      throw new ValidationError(
        `Coinbase does not support interval "${params.interval}". Supported: ${Object.keys(
          GRANULARITY_BY_INTERVAL,
        ).join(", ")}`,
      );
    }

    const productId = toProductId(params.symbol);
    const intervalSeconds = GRANULARITY_SECONDS[granularity] as number;
    const endSeconds =
      params.end !== undefined ? Math.floor(params.end / 1_000) : Math.floor(Date.now() / 1_000);
    const startSeconds =
      params.start !== undefined
        ? Math.floor(params.start / 1_000)
        : endSeconds - intervalSeconds * Math.max(1, params.limit);

    this.logger.debug(MODULES.MARKET, "Fetching Coinbase candles", {
      productId,
      granularity,
      start: startSeconds,
      end: endSeconds,
    });

    const response = await this.http.get<CoinbaseCandlesResponse>(
      `/api/v3/brokerage/market/products/${encodeURIComponent(productId)}/candles`,
      {
        params: {
          granularity,
          start: String(startSeconds),
          end: String(endSeconds),
        },
      },
    );

    const list = response.candles ?? [];
    const candles: RawCandle[] = [];
    const seen = new Set<number>();

    for (const row of list) {
      if (!row || typeof row !== "object") {
        this.logger.warn(MODULES.MARKET, "Skipping malformed Coinbase candle row", { row });
        continue;
      }

      const startSecondsValue = parseNumber(row.start, "start");
      const timestampMs = startSecondsValue * 1_000;
      if (seen.has(timestampMs)) continue;
      seen.add(timestampMs);

      const candle: RawCandle = {
        symbol: params.symbol,
        interval: params.interval,
        timestamp: new Date(timestampMs),
        open: parseNumber(row.open, "open"),
        high: parseNumber(row.high, "high"),
        low: parseNumber(row.low, "low"),
        close: parseNumber(row.close, "close"),
        volume: parseNumber(row.volume, "volume"),
      };

      if (candle.timestamp.getTime() <= 0) {
        this.logger.warn(MODULES.MARKET, "Skipping candle with invalid timestamp", { row });
        continue;
      }

      candles.push(candle);
    }

    // Coinbase returns newest first; the rest of the system expects chronological data.
    candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return candles;
  }
}
