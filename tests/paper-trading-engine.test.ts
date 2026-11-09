import assert from "node:assert/strict";
import test from "node:test";

import type { Repositories } from "../src/database/repositories/interfaces";
import type { IUnitOfWork } from "../src/database/unit-of-work";
import { FeeService } from "../src/services/paperTrading/fee.service";
import { PaperTradingEngine } from "../src/services/paperTrading/paper-trading.engine";
import { createWalletState } from "../src/services/paperTrading/wallet-math";
import type { StrategyDecision } from "../src/services/strategy/strategy.interface";
import type { IStrategyRegistry } from "../src/services/strategy/strategy.registry";
import type {
  Candle,
  IndicatorValues,
  PredictionResult,
  SettingsModel,
  Trade,
  TradeCloseInput,
  TradeInput,
  WalletRow,
} from "../src/types/domain";

function createSettings(): SettingsModel {
  return {
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
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function createCandle(close: number, minute: number): Candle {
  return {
    id: minute,
    symbol: "BTCUSDT",
    interval: "1",
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, minute)),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
  };
}

function createPrediction(direction: "BUY" | "SELL"): PredictionResult {
  return {
    time: new Date(0),
    prediction: direction,
    buyProbability: direction === "BUY" ? 0.9 : 0.1,
    sellProbability: direction === "BUY" ? 0.1 : 0.9,
    confidence: 90,
  };
}

const indicators: IndicatorValues = {
  ema20: 100,
  ema50: 101,
  ema200: 99,
  rsi: 30,
  macd: 1,
  macdSignal: 0.5,
  macdHistogram: 0.5,
  atr: 0.5,
  bbUpper: 102,
  bbLower: 98,
  volumeAverage: 1,
};

interface FakeState {
  wallet: WalletRow;
  trades: Trade[];
  nextTradeId: number;
  entryDecision: StrategyDecision;
  exitDecision: StrategyDecision;
}

function createFakeEngine(state: FakeState): PaperTradingEngine {
  const repos = {
    trade: {
      async findOpen(symbol?: string): Promise<Trade | null> {
        return (
          state.trades.find(
            (trade) => trade.status === "OPEN" && (!symbol || trade.symbol === symbol),
          ) ?? null
        );
      },
      async create(input: TradeInput): Promise<Trade> {
        const trade: Trade = {
          id: state.nextTradeId++,
          symbol: input.symbol,
          buyPrice: input.buyPrice,
          sellPrice: null,
          quantity: input.quantity,
          investment: input.investment,
          profit: null,
          fees: input.fees,
          netProfit: null,
          buyTime: input.buyTime,
          sellTime: null,
          status: input.status,
          reason: input.reason ?? null,
        };
        state.trades.push(trade);
        return trade;
      },
      async findById(id: number): Promise<Trade | null> {
        return state.trades.find((trade) => trade.id === id) ?? null;
      },
      async close(id: number, input: TradeCloseInput): Promise<Trade> {
        const trade = state.trades.find((candidate) => candidate.id === id);
        if (!trade) throw new Error("trade not found");
        Object.assign(trade, input);
        return trade;
      },
    },
    wallet: {
      async getSingleton(): Promise<WalletRow> {
        return state.wallet;
      },
      async update(_id: number, update: Partial<WalletRow>): Promise<WalletRow> {
        state.wallet = { ...state.wallet, ...update };
        return state.wallet;
      },
    },
  } as unknown as Repositories;

  const unitOfWork = {
    repos,
    transaction: async <T>(work: (scoped: Repositories) => Promise<T>): Promise<T> => work(repos),
  } as IUnitOfWork;

  const strategyRegistry = {
    get: () => ({
      name: "fake",
      evaluateEntry: () => state.entryDecision,
      evaluateExit: () => state.exitDecision,
    }),
  } as unknown as IStrategyRegistry;

  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  } as unknown as ConstructorParameters<typeof PaperTradingEngine>[3];

  return new PaperTradingEngine(unitOfWork, new FeeService(), strategyRegistry, logger);
}

test("engine opens one paper position, blocks duplicates and closes with net fees", async () => {
  const state: FakeState = {
    wallet: { id: 1, ...createWalletState(80) },
    trades: [],
    nextTradeId: 1,
    entryDecision: { action: "BUY", reason: "test entry" },
    exitDecision: { action: "HOLD", reason: "test hold" },
  };
  const engine = createFakeEngine(state);
  const settings = createSettings();
  const buyCandle = createCandle(100, 0);

  const opened = await engine.process({
    candle: buyCandle,
    indicators,
    prediction: createPrediction("BUY"),
    settings,
  });

  assert.equal(opened.action, "OPENED");
  assert.equal(opened.trade?.status, "OPEN");
  assert.equal(state.wallet.available, 69.99);
  assert.equal(state.wallet.invested, 10.01);
  assert.equal(state.wallet.balance, 80);
  assert.equal(state.wallet.totalFees, 0.01);

  const duplicate = await engine.process({
    candle: createCandle(100, 1),
    indicators,
    prediction: createPrediction("BUY"),
    settings,
  });

  assert.equal(duplicate.action, "HOLD");
  assert.equal(duplicate.trade?.id, opened.trade?.id);
  assert.equal(state.trades.length, 1);

  state.exitDecision = { action: "SELL", reason: "test exit" };
  const closed = await engine.process({
    candle: createCandle(103, 2),
    indicators,
    prediction: createPrediction("SELL"),
    settings,
  });

  assert.equal(closed.action, "CLOSED");
  assert.equal(closed.trade?.status, "CLOSED");
  assert.equal(state.wallet.invested, 0);
  assert.equal(state.wallet.available, 80.2797);
  assert.equal(state.wallet.balance, 80.2797);
  assert.equal(state.wallet.totalProfit, 0.2797);
  assert.equal(state.wallet.totalFees, 0.0203);
  assert.equal(state.wallet.totalTrades, 1);
  assert.equal(state.wallet.winningTrades, 1);
  assert.equal(state.wallet.winRate, 100);
});

test("engine refuses to open when the wallet cannot pay notional plus fee", async () => {
  const state: FakeState = {
    wallet: { id: 1, ...createWalletState(0) },
    trades: [],
    nextTradeId: 1,
    entryDecision: { action: "BUY", reason: "test entry" },
    exitDecision: { action: "HOLD", reason: "test hold" },
  };
  const engine = createFakeEngine(state);

  const result = await engine.process({
    candle: createCandle(100, 0),
    indicators,
    prediction: createPrediction("BUY"),
    settings: createSettings(),
  });

  assert.equal(result.action, "SKIPPED");
  assert.equal(result.trade, null);
  assert.equal(state.trades.length, 0);
  assert.equal(state.wallet.available, 0);
});
