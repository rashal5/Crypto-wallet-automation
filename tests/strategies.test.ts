import assert from "node:assert/strict";
import test from "node:test";
import { RsiEmaAiStrategy } from "../src/services/strategy/rsi-ema-ai.strategy";
import type { StrategyContext } from "../src/services/strategy/strategy.interface";
import type {
  IndicatorValues,
  PredictionResult,
  SettingsModel,
  Trade,
} from "../src/types/domain";

const strategy = new RsiEmaAiStrategy();

const settings: SettingsModel = {
  id: 1,
  startingBalance: 80,
  buyFeePercent: 0.1,
  sellFeePercent: 0.1,
  stopLossPercent: 2,
  takeProfitPercent: 3,
  maxTradeSize: 10,
  paperTradingEnabled: true,
  symbol: "BTCUSDT",
  interval: "1",
  rsiBuyThreshold: 35,
  aiConfidenceThreshold: 80,
  strategyName: "rsi-ema-ai",
  lastProcessedCandleAt: null,
  lastCycleAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const indicators: IndicatorValues = {
  ema20: 101,
  ema50: 105,
  ema200: 100,
  rsi: 30,
  macd: 1,
  macdSignal: 0.8,
  macdHistogram: 0.2,
  atr: 1,
  bbUpper: 110,
  bbLower: 95,
  volumeAverage: 1000,
};

function prediction(
  direction: PredictionResult["prediction"],
  confidence: number,
): PredictionResult {
  return {
    time: new Date(),
    prediction: direction,
    buyProbability: direction === "BUY" ? confidence / 100 : 1 - confidence / 100,
    sellProbability: direction === "SELL" ? confidence / 100 : 1 - confidence / 100,
    confidence,
  };
}

function position(buyPrice: number): Trade {
  return {
    id: 1,
    symbol: "BTCUSDT",
    buyPrice,
    sellPrice: null,
    quantity: 0.1,
    investment: 10,
    profit: null,
    fees: 0.01,
    netProfit: null,
    buyTime: new Date(),
    sellTime: null,
    status: "OPEN",
    reason: "test",
  };
}

function entryContext(overrides: Partial<StrategyContext> = {}): StrategyContext {
  return {
    symbol: "BTCUSDT",
    currentPrice: 100,
    indicators,
    prediction: prediction("BUY", 90),
    settings,
    position: null,
    ...overrides,
  };
}

test("entry buys when RSI is low, trend is bullish and AI is confident", () => {
  const decision = strategy.evaluateEntry(entryContext());
  assert.equal(decision.action, "BUY");
});

test("entry holds at the confidence boundary (must be strictly greater)", () => {
  const decision = strategy.evaluateEntry(
    entryContext({ prediction: prediction("BUY", 80) }),
  );
  assert.equal(decision.action, "HOLD");
});

test("entry holds when RSI is not below the threshold", () => {
  const decision = strategy.evaluateEntry(
    entryContext({ indicators: { ...indicators, rsi: 35 } }),
  );
  assert.equal(decision.action, "HOLD");
});

test("entry holds in a bearish EMA trend", () => {
  const decision = strategy.evaluateEntry(
    entryContext({ indicators: { ...indicators, ema50: 99, ema200: 100 } }),
  );
  assert.equal(decision.action, "HOLD");
});

test("entry holds when AI predicts SELL", () => {
  const decision = strategy.evaluateEntry(
    entryContext({ prediction: prediction("SELL", 95) }),
  );
  assert.equal(decision.action, "HOLD");
});

test("exit sells at take profit", () => {
  const decision = strategy.evaluateExit(
    entryContext({
      position: position(100),
      currentPrice: 103,
      prediction: prediction("BUY", 90),
    }),
  );
  assert.equal(decision.action, "SELL");
  assert.equal(decision.metadata?.rule, "TAKE_PROFIT");
});

test("exit sells at stop loss", () => {
  const decision = strategy.evaluateExit(
    entryContext({
      position: position(100),
      currentPrice: 98,
      prediction: prediction("BUY", 90),
    }),
  );
  assert.equal(decision.action, "SELL");
  assert.equal(decision.metadata?.rule, "STOP_LOSS");
});

test("exit sells on an AI SELL signal", () => {
  const decision = strategy.evaluateExit(
    entryContext({
      position: position(100),
      currentPrice: 101,
      prediction: prediction("SELL", 85),
    }),
  );
  assert.equal(decision.action, "SELL");
  assert.equal(decision.metadata?.rule, "AI_SELL");
});

test("exit holds inside the stop/take-profit band", () => {
  const decision = strategy.evaluateExit(
    entryContext({
      position: position(100),
      currentPrice: 101,
      prediction: prediction("BUY", 90),
    }),
  );
  assert.equal(decision.action, "HOLD");
});
