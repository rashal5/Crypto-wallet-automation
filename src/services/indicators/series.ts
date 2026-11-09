import { ATR, BollingerBands, EMA, MACD, RSI, SMA } from "technicalindicators";
import type { Candle, IndicatorValues } from "../../types/domain";
import { round } from "../../utils/number";

export interface IndicatorPoint {
  candle: Candle;
  values: IndicatorValues | null;
}

export interface IndicatorConfig {
  ema20: number;
  ema50: number;
  ema100?: number;
  ema200: number;
  rsi: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  atr: number;
  bollingerPeriod: number;
  bollingerStdDev: number;
  volumePeriod: number;
}

export const DEFAULT_INDICATOR_CONFIG: IndicatorConfig = {
  ema20: 20,
  ema50: 50,
  ema200: 200,
  rsi: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  atr: 14,
  bollingerPeriod: 20,
  bollingerStdDev: 2,
  volumePeriod: 20,
};

function valueAt<T>(series: T[], index: number, offset: number): T | undefined {
  const seriesIndex = index - offset;
  if (seriesIndex < 0 || seriesIndex >= series.length) return undefined;
  return series[seriesIndex];
}

/**
 * Computes a fully aligned indicator series for a chronological candle array.
 * Each point is null until every indicator has enough history.
 *
 * technicalindicators series offsets:
 *  - EMA/SMA/Bollinger: period - 1
 *  - RSI/ATR: period
 *  - MACD: slowPeriod - 1
 */
export function computeIndicatorSeries(
  candles: Candle[],
  cfg: IndicatorConfig = DEFAULT_INDICATOR_CONFIG,
): IndicatorPoint[] {
  if (candles.length === 0) return [];

  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume);

  const ema20 = EMA.calculate({ period: cfg.ema20, values: closes });
  const ema50 = EMA.calculate({ period: cfg.ema50, values: closes });
  const ema200 = EMA.calculate({ period: cfg.ema200, values: closes });
  const rsi = RSI.calculate({ period: cfg.rsi, values: closes });
  const macd = MACD.calculate({
    values: closes,
    fastPeriod: cfg.macdFast,
    slowPeriod: cfg.macdSlow,
    signalPeriod: cfg.macdSignal,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const atr = ATR.calculate({
    period: cfg.atr,
    high: highs,
    low: lows,
    close: closes,
  });
  const bollinger = BollingerBands.calculate({
    period: cfg.bollingerPeriod,
    stdDev: cfg.bollingerStdDev,
    values: closes,
  });
  const volumeSma = SMA.calculate({ period: cfg.volumePeriod, values: volumes });

  const points: IndicatorPoint[] = [];

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i] as Candle;
    const e20 = valueAt(ema20, i, cfg.ema20 - 1);
    const e50 = valueAt(ema50, i, cfg.ema50 - 1);
    const e200 = valueAt(ema200, i, cfg.ema200 - 1);
    const rsiValue = valueAt(rsi, i, cfg.rsi);
    const macdValue = valueAt(macd, i, cfg.macdSlow - 1);
    const atrValue = valueAt(atr, i, cfg.atr);
    const bbValue = valueAt(bollinger, i, cfg.bollingerPeriod - 1);
    const volumeAverage = valueAt(volumeSma, i, cfg.volumePeriod - 1);

    const complete =
      e20 !== undefined &&
      e50 !== undefined &&
      e200 !== undefined &&
      rsiValue !== undefined &&
      macdValue?.MACD !== undefined &&
      macdValue.signal !== undefined &&
      macdValue.histogram !== undefined &&
      atrValue !== undefined &&
      bbValue !== undefined &&
      volumeAverage !== undefined;

    if (!complete) {
      points.push({ candle, values: null });
      continue;
    }

    points.push({
      candle,
      values: {
        ema20: round(e20),
        ema50: round(e50),
        ema200: round(e200),
        rsi: round(rsiValue, 4),
        macd: round(macdValue.MACD as number),
        macdSignal: round(macdValue.signal as number),
        macdHistogram: round(macdValue.histogram as number),
        atr: round(atrValue),
        bbUpper: round(bbValue.upper),
        bbLower: round(bbValue.lower),
        volumeAverage: round(volumeAverage, 4),
      },
    });
  }

  return points;
}
