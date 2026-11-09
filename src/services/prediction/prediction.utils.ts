import { PREDICTION_DIRECTION } from "../../config/constants";
import type { PredictionDirection, RawPrediction } from "../../types/domain";
import { ExternalServiceError } from "../../utils/errors";
import { clamp, roundProbability } from "../../utils/number";

const ALLOWED_DIRECTIONS: readonly PredictionDirection[] = [
  PREDICTION_DIRECTION.BUY,
  PREDICTION_DIRECTION.SELL,
  PREDICTION_DIRECTION.HOLD,
];

/**
 * Validates and normalizes the JSON returned by the Python service. A malformed
 * response is treated as an external-service error so the caller can fall back.
 */
export function normalizePrediction(input: unknown): RawPrediction {
  if (!input || typeof input !== "object") {
    throw new ExternalServiceError("Prediction response must be a JSON object");
  }

  const payload = input as Record<string, unknown>;
  const rawBuy = Number(payload.buyProbability);
  const rawSell = Number(payload.sellProbability);

  if (!Number.isFinite(rawBuy) || !Number.isFinite(rawSell)) {
    throw new ExternalServiceError("Prediction response is missing valid probabilities");
  }

  let buy = clamp(rawBuy, 0, 1);
  let sell = clamp(rawSell, 0, 1);
  const total = buy + sell;

  if (total <= 0) {
    throw new ExternalServiceError("Prediction probabilities cannot both be zero");
  }

  buy /= total;
  sell /= total;

  const rawConfidence = Number(payload.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? clamp(rawConfidence, 0, 100)
    : Math.max(buy, sell) * 100;

  let prediction = payload.prediction;
  if (typeof prediction !== "string" || !ALLOWED_DIRECTIONS.includes(prediction as PredictionDirection)) {
    prediction = buy >= sell ? PREDICTION_DIRECTION.BUY : PREDICTION_DIRECTION.SELL;
  }

  return {
    prediction: prediction as PredictionDirection,
    buyProbability: roundProbability(buy),
    sellProbability: roundProbability(sell),
    confidence: Math.round(confidence * 100) / 100,
  };
}
