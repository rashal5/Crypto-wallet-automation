export type LogLevel = "debug" | "info" | "warn" | "error";
export type TradeStatus = "OPEN" | "CLOSED";
export type PredictionDirection = "BUY" | "SELL" | "HOLD";

export interface Candle {
  id: number;
  symbol: string;
  interval: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CandleInput {
  symbol: string;
  interval: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorValues {
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  atr: number;
  bbUpper: number;
  bbLower: number;
  volumeAverage: number;
}

export interface IndicatorRow extends IndicatorValues {
  id: number;
  candleId: number;
}

export interface IndicatorInput extends IndicatorValues {
  candleId: number;
}

export interface IndicatorWithCandle extends IndicatorRow {
  candle: Candle;
}

export interface Trade {
  id: number;
  symbol: string;
  buyPrice: number;
  sellPrice: number | null;
  quantity: number;
  investment: number;
  profit: number | null;
  fees: number;
  netProfit: number | null;
  buyTime: Date;
  sellTime: Date | null;
  status: TradeStatus;
  reason: string | null;
}

export interface TradeInput {
  symbol: string;
  buyPrice: number;
  quantity: number;
  investment: number;
  fees: number;
  buyTime: Date;
  status: TradeStatus;
  reason?: string | null;
}

export interface TradeCloseInput {
  sellPrice: number;
  sellTime: Date;
  profit: number;
  fees: number;
  netProfit: number;
  status: TradeStatus;
  reason: string;
}

export interface WalletState {
  balance: number;
  invested: number;
  available: number;
  totalFees: number;
  totalProfit: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
}

export interface WalletRow extends WalletState {
  id: number;
}

export interface PredictionRow {
  id: number;
  time: Date;
  buyProbability: number;
  sellProbability: number;
  confidence: number;
  prediction: PredictionDirection;
}

export interface PredictionResult {
  time: Date;
  buyProbability: number;
  sellProbability: number;
  confidence: number;
  prediction: PredictionDirection;
}

export interface RawPrediction {
  prediction: PredictionDirection;
  buyProbability: number;
  sellProbability: number;
  confidence: number;
}

export interface SettingsModel {
  id: number;
  startingBalance: number;
  buyFeePercent: number;
  sellFeePercent: number;
  stopLossPercent: number;
  takeProfitPercent: number;
  maxTradeSize: number;
  paperTradingEnabled: boolean;
  symbol: string;
  interval: string;
  rsiBuyThreshold: number;
  aiConfidenceThreshold: number;
  strategyName: string;
  lastProcessedCandleAt: Date | null;
  lastCycleAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettingsUpdate {
  startingBalance?: number;
  buyFeePercent?: number;
  sellFeePercent?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  maxTradeSize?: number;
  paperTradingEnabled?: boolean;
  symbol?: string;
  interval?: string;
  rsiBuyThreshold?: number;
  aiConfidenceThreshold?: number;
  strategyName?: string;
  lastProcessedCandleAt?: Date | null;
  lastCycleAt?: Date | null;
}

export interface LogEntry {
  id: number;
  time: Date;
  module: string;
  message: string;
  level: LogLevel;
}

export interface FeatureVector {
  currentPrice: number;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  macd: number;
  macdHistogram: number;
  atr: number;
  volume: number;
  priceChangePct: number;
  prevReturn1: number;
  prevReturn2: number;
  prevReturn3: number;
  prevReturn4: number;
  prevReturn5: number;
  rollingAverage: number;
  volatility: number;
  volumeAverage: number;
}

export interface OpenPosition {
  trade: Trade;
  markPrice: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

export interface EquityPoint {
  time: Date;
  equity: number;
}

export interface TradeStatistics {
  initialBalance: number;
  currentEquity: number;
  totalProfit: number;
  totalReturnPercent: number;
  totalFees: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  lossRate: number;
  averageWin: number;
  averageLoss: number;
  riskRewardRatio: number | null;
  profitFactor: number | null;
  maxDrawdownValue: number;
  maxDrawdownPercent: number;
  longestWinningStreak: number;
  longestLosingStreak: number;
  sharpeRatio: number | null;
  equityCurve: EquityPoint[];
}
