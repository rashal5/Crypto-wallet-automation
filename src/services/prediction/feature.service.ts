import type { Candle, FeatureVector, IndicatorValues } from "../../types/domain";
import { ValidationError } from "../../utils/errors";
import { mean, round, standardDeviation } from "../../utils/number";

export interface IFeatureService {
  build(candles: Candle[], indicators: IndicatorValues): FeatureVector;
}

const RETURN_WINDOW = 30;
const ROLLING_WINDOW = 20;

export const MINIMUM_FEATURE_CANDLES = ROLLING_WINDOW + 1;

/**
 * Feature engineering shared by the live prediction path and the backtest.
 * Input candles must be chronological (oldest first).
 */
export class FeatureService implements IFeatureService {
  build(candles: Candle[], indicators: IndicatorValues): FeatureVector {
    if (candles.length < MINIMUM_FEATURE_CANDLES) {
      throw new ValidationError(
        `At least ${MINIMUM_FEATURE_CANDLES} candles are required to build features`,
        { received: candles.length },
      );
    }

    const closes = candles.map((candle) => candle.close);
    const currentPrice = closes[closes.length - 1] as number;
    const previousPrice = closes[closes.length - 2] as number;

    const returns: number[] = [];
    const start = Math.max(1, closes.length - RETURN_WINDOW);
    for (let i = start; i < closes.length; i += 1) {
      const current = closes[i] as number;
      const previous = closes[i - 1] as number;
      returns.push(previous === 0 ? 0 : ((current - previous) / previous) * 100);
    }

    const recentReturns = returns.slice(-5).reverse();
    const rollingAverage = mean(closes.slice(-ROLLING_WINDOW));
    const volatility = standardDeviation(returns);

    return {
      currentPrice: round(currentPrice),
      ema20: round(indicators.ema20),
      ema50: round(indicators.ema50),
      ema200: round(indicators.ema200),
      rsi: round(indicators.rsi, 4),
      macd: round(indicators.macd),
      macdHistogram: round(indicators.macdHistogram),
      atr: round(indicators.atr),
      volume: round(candles[candles.length - 1]?.volume ?? 0, 4),
      priceChangePct: round(
        previousPrice === 0 ? 0 : ((currentPrice - previousPrice) / previousPrice) * 100,
        6,
      ),
      prevReturn1: round(recentReturns[0] ?? 0, 6),
      prevReturn2: round(recentReturns[1] ?? 0, 6),
      prevReturn3: round(recentReturns[2] ?? 0, 6),
      prevReturn4: round(recentReturns[3] ?? 0, 6),
      prevReturn5: round(recentReturns[4] ?? 0, 6),
      rollingAverage: round(rollingAverage),
      volatility: round(volatility, 6),
      volumeAverage: round(indicators.volumeAverage, 4),
    };
  }
}
