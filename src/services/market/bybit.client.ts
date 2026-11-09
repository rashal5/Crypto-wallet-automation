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

export interface BybitKlineResponse {
  retCode: number | string;
  retMsg: string;
  result?: {
    category?: string;
    symbol?: string;
    list?: string[][];
  };
  time_now?: string;
}

export interface FetchKlinesParams {
  symbol: string;
  interval: string;
  limit: number;
  end?: number;
  start?: number;
}

export interface IBybitClient {
  fetchKlines(params: FetchKlinesParams): Promise<RawCandle[]>;
}

function parseNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ExternalServiceError(`Bybit returned a non-numeric ${field}: ${value}`);
  }
  return parsed;
}

/**
 * Public market-data client for Bybit v5. This client has no authentication and
 * can only read candles. It deliberately exposes no order/trading methods.
 */
export class BybitClient implements IBybitClient {
  constructor(
    private readonly http: IHttpClient,
    private readonly config: AppConfig,
    private readonly logger: ILogger,
  ) {}

  async fetchKlines(params: FetchKlinesParams): Promise<RawCandle[]> {
    if (params.limit < 1 || params.limit > this.config.bybit.maxKlineLimit) {
      throw new ValidationError(
        `Kline limit must be between 1 and ${this.config.bybit.maxKlineLimit}`,
      );
    }

    this.logger.debug(MODULES.MARKET, "Fetching Bybit klines", { ...params });

    const response = await this.http.get<BybitKlineResponse>("/v5/market/kline", {
      params: {
        category: this.config.bybit.category,
        symbol: params.symbol,
        interval: params.interval,
        limit: params.limit,
        end: params.end,
        start: params.start,
      },
    });

    if (Number(response.retCode) !== 0) {
      throw new ExternalServiceError(
        `Bybit kline request failed: ${response.retMsg || "unknown error"}`,
        { retCode: response.retCode, retMsg: response.retMsg },
      );
    }

    const list = response.result?.list ?? [];
    const candles: RawCandle[] = [];
    const seen = new Set<number>();

    for (const row of list) {
      if (!Array.isArray(row) || row.length < 6) {
        this.logger.warn(MODULES.MARKET, "Skipping malformed Bybit kline row", { row });
        continue;
      }

      const timestampMs = parseNumber(row[0] as string, "timestamp");
      if (seen.has(timestampMs)) continue;
      seen.add(timestampMs);

      const candle: RawCandle = {
        symbol: params.symbol,
        interval: params.interval,
        timestamp: new Date(timestampMs),
        open: parseNumber(row[1] as string, "open"),
        high: parseNumber(row[2] as string, "high"),
        low: parseNumber(row[3] as string, "low"),
        close: parseNumber(row[4] as string, "close"),
        volume: parseNumber(row[5] as string, "volume"),
      };

      if (candle.timestamp.getTime() <= 0) {
        this.logger.warn(MODULES.MARKET, "Skipping kline with invalid timestamp", { row });
        continue;
      }

      candles.push(candle);
    }

    // Bybit returns newest first; the rest of the system expects chronological data.
    candles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return candles;
  }
}
