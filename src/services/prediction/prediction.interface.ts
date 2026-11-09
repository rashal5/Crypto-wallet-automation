import type { FeatureVector, RawPrediction } from "../../types/domain";

/**
 * Both the Python bridge and the offline heuristic implement this contract, so
 * the prediction service can swap providers without changing callers.
 */
export interface IPredictionProvider {
  readonly name: string;
  predict(features: FeatureVector): Promise<RawPrediction>;
}
