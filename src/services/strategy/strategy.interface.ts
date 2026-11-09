import type {
  IndicatorValues,
  PredictionResult,
  SettingsModel,
  Trade,
} from "../../types/domain";

export interface StrategyContext {
  symbol: string;
  currentPrice: number;
  indicators: IndicatorValues;
  prediction: PredictionResult;
  settings: SettingsModel;
  position: Trade | null;
}

export type StrategyAction = "BUY" | "SELL" | "HOLD";

export interface StrategyDecision {
  action: StrategyAction;
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Replaceable strategy contract. New strategies implement this interface and are
 * registered in StrategyRegistry; no trading engine changes are required.
 */
export interface IStrategy {
  readonly name: string;
  evaluateEntry(context: StrategyContext): StrategyDecision;
  evaluateExit(context: StrategyContext): StrategyDecision;
}
