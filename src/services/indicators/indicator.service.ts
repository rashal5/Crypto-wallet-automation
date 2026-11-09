import type { AppConfig } from "../../config";
import { MODULES } from "../../config/constants";
import type {
  ICandleRepository,
  IIndicatorRepository,
  IndicatorFilter,
} from "../../database/repositories/interfaces";
import type { Candle, IndicatorValues, IndicatorWithCandle } from "../../types/domain";
import type { ILogger } from "../../utils/logger";
import { computeIndicatorSeries, type IndicatorConfig } from "./series";

export interface IndicatorSnapshot {
  candle: Candle;
  indicators: IndicatorValues;
  persisted: number;
}

export interface IIndicatorService {
  syncRecent(symbol?: string, interval?: string): Promise<IndicatorSnapshot | null>;
  recomputeAll(symbol?: string, interval?: string): Promise<number>;
  getLatest(symbol?: string, interval?: string): Promise<IndicatorWithCandle | null>;
  getMany(filter?: IndicatorFilter): Promise<IndicatorWithCandle[]>;
  count(filter?: IndicatorFilter): Promise<number>;
}

export class IndicatorService implements IIndicatorService {
  constructor(
    private readonly candleRepository: ICandleRepository,
    private readonly indicatorRepository: IIndicatorRepository,
    private readonly config: AppConfig,
    private readonly logger: ILogger,
    private readonly indicatorConfig: IndicatorConfig | undefined = undefined,
  ) {}

  private get minimumCandles(): number {
    return Math.max(this.indicatorConfig?.ema200 ?? 200, 200);
  }

  /**
   * Recomputes the recent indicator window and persists only candles that are not
   * already stored. This makes the once-per-minute cycle cheap while still
   * repairing missing indicator rows after an outage.
   */
  async syncRecent(symbol?: string, interval?: string): Promise<IndicatorSnapshot | null> {
    const resolvedSymbol = symbol ?? this.config.market.symbol;
    const resolvedInterval = interval ?? this.config.market.interval;
    const lookback = Math.max(this.config.market.lookbackCandles, this.minimumCandles + 50);

    const candles = await this.candleRepository.findRecent(
      resolvedSymbol,
      resolvedInterval,
      lookback,
    );

    if (candles.length < this.minimumCandles) {
      this.logger.warn(MODULES.INDICATORS, "Not enough candles to calculate indicators", {
        symbol: resolvedSymbol,
        interval: resolvedInterval,
        candles: candles.length,
        required: this.minimumCandles,
      });
      return null;
    }

    const series = computeIndicatorSeries(candles, this.indicatorConfig);
    const latestStored = await this.indicatorRepository.findLatestCandleTimestamp(
      resolvedSymbol,
      resolvedInterval,
    );

    const toPersist = series
      .filter(
        (point) =>
          point.values !== null &&
          (latestStored === null || point.candle.timestamp.getTime() > latestStored.getTime()),
      )
      .map((point) => ({
        candleId: point.candle.id,
        ...(point.values as IndicatorValues),
      }));

    const persisted =
      toPersist.length > 0 ? await this.indicatorRepository.upsertMany(toPersist) : 0;

    const latest = series[series.length - 1];
    if (!latest || !latest.values) {
      this.logger.warn(MODULES.INDICATORS, "Latest candle does not have complete indicators");
      return null;
    }

    this.logger.debug(MODULES.INDICATORS, "Indicators synchronized", {
      symbol: resolvedSymbol,
      interval: resolvedInterval,
      candle: latest.candle.timestamp,
      persisted,
      rsi: latest.values.rsi,
      ema50: latest.values.ema50,
      ema200: latest.values.ema200,
    });

    return { candle: latest.candle, indicators: latest.values, persisted };
  }

  /**
   * Full rebuild used by the historical download script and recovery tooling.
   */
  async recomputeAll(symbol?: string, interval?: string): Promise<number> {
    const resolvedSymbol = symbol ?? this.config.market.symbol;
    const resolvedInterval = interval ?? this.config.market.interval;

    const candles = await this.candleRepository.findMany({
      symbol: resolvedSymbol,
      interval: resolvedInterval,
      order: "asc",
      limit: 100_000,
    });

    if (candles.length === 0) {
      this.logger.warn(MODULES.INDICATORS, "No candles available for indicator rebuild", {
        symbol: resolvedSymbol,
        interval: resolvedInterval,
      });
      return 0;
    }

    const series = computeIndicatorSeries(candles, this.indicatorConfig);
    const inputs = series
      .filter((point) => point.values !== null)
      .map((point) => ({
        candleId: point.candle.id,
        ...(point.values as IndicatorValues),
      }));

    const persisted = await this.indicatorRepository.upsertMany(inputs);

    this.logger.info(MODULES.INDICATORS, "Indicators rebuilt", {
      symbol: resolvedSymbol,
      interval: resolvedInterval,
      candles: candles.length,
      persisted,
    });

    return persisted;
  }

  async getLatest(symbol?: string, interval?: string): Promise<IndicatorWithCandle | null> {
    return this.indicatorRepository.findLatest(
      symbol ?? this.config.market.symbol,
      interval ?? this.config.market.interval,
    );
  }

  async getMany(filter: IndicatorFilter = {}): Promise<IndicatorWithCandle[]> {
    return this.indicatorRepository.findMany(filter);
  }

  async count(filter: IndicatorFilter = {}): Promise<number> {
    return this.indicatorRepository.count(filter);
  }
}
