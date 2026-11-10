import type { AppConfig } from "../../config";
import { MODULES } from "../../config/constants";
import type { ICandleRepository, CandleFilter } from "../../database/repositories/interfaces";
import type { Candle } from "../../types/domain";
import { ExternalServiceError } from "../../utils/errors";
import type { ILogger } from "../../utils/logger";
import { intervalToMilliseconds, isCandleClosed } from "../../utils/time";
import type { ICoinbaseClient } from "./coinbase.client";

export interface HistoricalSyncOptions {
  symbol?: string;
  interval?: string;
  total?: number;
}

export interface HistoricalSyncResult {
  symbol: string;
  interval: string;
  inserted: number;
  from: Date | null;
  to: Date | null;
}

export interface IMarketService {
  syncHistorical(options?: HistoricalSyncOptions): Promise<HistoricalSyncResult>;
  syncLatest(symbol?: string, interval?: string): Promise<Candle | null>;
  ensureSeeded(minimumCandles?: number): Promise<void>;
  getLatest(symbol?: string, interval?: string): Promise<Candle | null>;
  getCandles(filter?: CandleFilter): Promise<Candle[]>;
  count(symbol?: string, interval?: string): Promise<number>;
  countMatching(filter?: CandleFilter): Promise<number>;
}

export class MarketService implements IMarketService {
  constructor(
    private readonly client: ICoinbaseClient,
    private readonly candleRepository: ICandleRepository,
    private readonly config: AppConfig,
    private readonly logger: ILogger,
  ) {}

  /**
   * Downloads candles backwards in pages (Coinbase caps a page at 350). Coinbase
   * has no "offset", so we walk the `end` cursor and stop when a page cannot
   * provide new data.
   */
  async syncHistorical(options: HistoricalSyncOptions = {}): Promise<HistoricalSyncResult> {
    const symbol = options.symbol ?? this.config.market.symbol;
    const interval = options.interval ?? this.config.market.interval;
    const total = Math.max(1, options.total ?? this.config.market.historyCandles);
    const pageLimit = this.config.coinbase.maxKlineLimit;

    const collected = new Map<number, Awaited<ReturnType<ICoinbaseClient["fetchKlines"]>>[number]>();
    let remaining = total;
    let end: number | undefined;
    let previousEnd: number | undefined;

    while (remaining > 0) {
      const limit = Math.min(pageLimit, remaining);
      const batch = await this.client.fetchKlines({ symbol, interval, limit, end });
      if (batch.length === 0) break;

      for (const candle of batch) {
        collected.set(candle.timestamp.getTime(), candle);
      }

      remaining -= batch.length;
      const oldest = batch[0]?.timestamp.getTime();
      if (oldest === undefined) break;

      const nextEnd = oldest - 1;
      if (previousEnd !== undefined && nextEnd >= previousEnd) break;
      previousEnd = nextEnd;
      end = nextEnd;
    }

    const intervalMs = intervalToMilliseconds(interval);
    const reference = new Date();
    const closed = [...collected.values()]
      .filter((candle) => candle.timestamp.getTime() + intervalMs <= reference.getTime())
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (closed.length === 0) {
      throw new ExternalServiceError(`Coinbase returned no closed candles for ${symbol} ${interval}`);
    }

    const inserted = await this.candleRepository.upsertMany(
      closed.map((candle) => ({
        symbol,
        interval,
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      })),
    );

    const from = closed[0]?.timestamp ?? null;
    const to = closed[closed.length - 1]?.timestamp ?? null;

    this.logger.info(MODULES.MARKET, "Historical candles synchronized", {
      symbol,
      interval,
      requested: total,
      received: closed.length,
      persisted: inserted,
      from,
      to,
    });

    return { symbol, interval, inserted, from, to };
  }

  /**
   * Fetches the most recent candles and persists only closed ones, preventing a
   * partially formed candle from influencing indicators or trades.
   */
  async syncLatest(symbol?: string, interval?: string): Promise<Candle | null> {
    const resolvedSymbol = symbol ?? this.config.market.symbol;
    const resolvedInterval = interval ?? this.config.market.interval;

    const batch = await this.client.fetchKlines({
      symbol: resolvedSymbol,
      interval: resolvedInterval,
      limit: 3,
    });

    const closed = batch.filter((candle) =>
      isCandleClosed(candle.timestamp, resolvedInterval, new Date()),
    );

    if (closed.length > 0) {
      await this.candleRepository.upsertMany(
        closed.map((candle) => ({
          symbol: resolvedSymbol,
          interval: resolvedInterval,
          timestamp: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        })),
      );
    }

    const latest = await this.candleRepository.findLatest(resolvedSymbol, resolvedInterval);

    if (latest) {
      this.logger.debug(MODULES.MARKET, "Latest candle fetched", {
        symbol: resolvedSymbol,
        interval: resolvedInterval,
        timestamp: latest.timestamp,
        close: latest.close,
      });
    }

    return latest;
  }

  async ensureSeeded(minimumCandles = 250): Promise<void> {
    const { symbol, interval } = this.config.market;
    const count = await this.candleRepository.count(symbol, interval);

    if (count >= minimumCandles) {
      this.logger.debug(MODULES.MARKET, "Market data already seeded", { symbol, interval, count });
      return;
    }

    this.logger.info(MODULES.MARKET, "Seeding market data", {
      symbol,
      interval,
      existing: count,
      minimumCandles,
    });

    await this.syncHistorical({ symbol, interval, total: this.config.market.historyCandles });
  }

  async getLatest(symbol?: string, interval?: string): Promise<Candle | null> {
    return this.candleRepository.findLatest(
      symbol ?? this.config.market.symbol,
      interval ?? this.config.market.interval,
    );
  }

  async getCandles(filter: CandleFilter = {}): Promise<Candle[]> {
    return this.candleRepository.findMany(filter);
  }

  async count(symbol?: string, interval?: string): Promise<number> {
    return this.candleRepository.count(symbol, interval);
  }

  async countMatching(filter: CandleFilter = {}): Promise<number> {
    return this.candleRepository.countMatching(filter);
  }
}
