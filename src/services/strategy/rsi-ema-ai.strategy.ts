import { round } from "../../utils/number";
import type { IStrategy, StrategyContext, StrategyDecision } from "./strategy.interface";

/**
 * Default strategy.
 *
 * BUY:
 *   RSI < 35
 *   EMA50 > EMA200 (trend filter)
 *   AI prediction is BUY with confidence > 80
 *
 * SELL (first matching rule wins):
 *   profit >= takeProfit
 *   loss   <= stopLoss
 *   AI prediction is SELL
 */
export class RsiEmaAiStrategy implements IStrategy {
  readonly name = "rsi-ema-ai";

  evaluateEntry(context: StrategyContext): StrategyDecision {
    const { indicators, prediction, settings, position } = context;

    if (!settings.paperTradingEnabled) {
      return { action: "HOLD", reason: "Paper trading is disabled" };
    }
    if (position) {
      return { action: "HOLD", reason: "A position is already open" };
    }
    if (prediction.prediction !== "BUY") {
      return { action: "HOLD", reason: `AI prediction is ${prediction.prediction}` };
    }
    if (prediction.confidence <= settings.aiConfidenceThreshold) {
      return {
        action: "HOLD",
        reason: `AI confidence ${prediction.confidence.toFixed(2)} <= ${settings.aiConfidenceThreshold}`,
      };
    }
    if (indicators.rsi >= settings.rsiBuyThreshold) {
      return {
        action: "HOLD",
        reason: `RSI ${indicators.rsi.toFixed(2)} is not below ${settings.rsiBuyThreshold}`,
      };
    }
    if (indicators.ema50 <= indicators.ema200) {
      return { action: "HOLD", reason: "EMA50 is not above EMA200 (bearish trend filter)" };
    }

    return {
      action: "BUY",
      reason: `RSI ${indicators.rsi.toFixed(2)}, EMA50 ${indicators.ema50.toFixed(2)} > EMA200 ${indicators.ema200.toFixed(2)}, AI ${prediction.prediction} ${prediction.confidence.toFixed(2)}%`,
      metadata: {
        rsi: indicators.rsi,
        ema50: indicators.ema50,
        ema200: indicators.ema200,
        aiConfidence: prediction.confidence,
      },
    };
  }

  evaluateExit(context: StrategyContext): StrategyDecision {
    const { position, currentPrice, prediction, settings } = context;

    if (!position) {
      return { action: "HOLD", reason: "No open position" };
    }

    const pnlPercent = round(((currentPrice - position.buyPrice) / position.buyPrice) * 100, 4);

    // Risk rules take precedence over signal rules.
    if (pnlPercent <= -settings.stopLossPercent) {
      return {
        action: "SELL",
        reason: `Stop loss hit: ${pnlPercent.toFixed(2)}% <= -${settings.stopLossPercent}%`,
        metadata: { pnlPercent, rule: "STOP_LOSS" },
      };
    }
    if (pnlPercent >= settings.takeProfitPercent) {
      return {
        action: "SELL",
        reason: `Take profit hit: ${pnlPercent.toFixed(2)}% >= ${settings.takeProfitPercent}%`,
        metadata: { pnlPercent, rule: "TAKE_PROFIT" },
      };
    }
    if (prediction.prediction === "SELL") {
      return {
        action: "SELL",
        reason: `AI predicted SELL with ${prediction.confidence.toFixed(2)}% confidence`,
        metadata: { pnlPercent, rule: "AI_SELL" },
      };
    }

    return {
      action: "HOLD",
      reason: `Open position PnL ${pnlPercent.toFixed(2)}%`,
      metadata: { pnlPercent },
    };
  }
}
