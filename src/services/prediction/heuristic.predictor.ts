import type { FeatureVector, RawPrediction } from "../../types/domain";
import { clamp } from "../../utils/number";
import type { IPredictionProvider } from "./prediction.interface";
import { normalizePrediction } from "./prediction.utils";

/**
 * Offline baseline model.
 *
 * It is used for two purposes:
 *  1. Backtests: calling a Python process for every historical candle would be
 *     prohibitively slow, so the same transparent scoring model is evaluated in-process.
 *  2. Resilience: if the Python service is unavailable, the live cycle can still
 *     produce a prediction instead of stalling.
 *
 * The Python predictor is the primary live model and can be replaced by a trained
 * scikit-learn model without touching this file.
 */
export class HeuristicPredictionProvider implements IPredictionProvider {
  readonly name = "heuristic-baseline";

  async predict(features: FeatureVector): Promise<RawPrediction> {
    let score = 0;

    score += features.ema20 > features.ema50 ? 1.4 : -1.4;
    score += features.ema50 > features.ema200 ? 1.0 : -1.0;
    score += (50 - features.rsi) / 20;
    score += features.macdHistogram > 0 ? 1.2 : -1.2;
    score += features.priceChangePct > 0 ? 0.9 : -0.9;
    score += features.prevReturn1 > 0 ? 0.6 : -0.6;

    if (features.rsi < 35) {
      score += 1.3;
    } else if (features.rsi > 65) {
      score -= 1.3;
    }

    score -= Math.min(Math.abs(features.volatility), 5) * 0.15;

    const buyProbability = clamp(1 / (1 + Math.exp(-score / 1.4)), 0.02, 0.98);

    return normalizePrediction({
      prediction: buyProbability >= 0.5 ? "BUY" : "SELL",
      buyProbability,
      sellProbability: 1 - buyProbability,
      confidence: Math.max(buyProbability, 1 - buyProbability) * 100,
    });
  }
}
