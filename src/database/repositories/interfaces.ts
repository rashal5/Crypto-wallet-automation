import type {
  Candle,
  CandleInput,
  IndicatorInput,
  IndicatorRow,
  IndicatorWithCandle,
  LogEntry,
  LogLevel,
  PredictionRow,
  SettingsModel,
  SettingsUpdate,
  Trade,
  TradeCloseInput,
  TradeInput,
  TradeStatus,
  WalletRow,
  WalletState,
} from "../../types/domain";

export interface CandleFilter {
  symbol?: string;
  interval?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

export interface ICandleRepository {
  upsertMany(candles: CandleInput[]): Promise<number>;
  upsert(candle: CandleInput): Promise<Candle>;
  findLatest(symbol: string, interval: string): Promise<Candle | null>;
  findById(id: number): Promise<Candle | null>;
  findMany(filter?: CandleFilter): Promise<Candle[]>;
  findRecent(symbol: string, interval: string, limit: number): Promise<Candle[]>;
  count(symbol?: string, interval?: string): Promise<number>;
  countMatching(filter?: CandleFilter): Promise<number>;
}

export interface IndicatorFilter {
  symbol?: string;
  interval?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

export interface IIndicatorRepository {
  upsertMany(indicators: IndicatorInput[]): Promise<number>;
  findByCandleId(candleId: number): Promise<IndicatorRow | null>;
  findLatest(symbol: string, interval: string): Promise<IndicatorWithCandle | null>;
  findLatestCandleTimestamp(symbol: string, interval: string): Promise<Date | null>;
  findMany(filter?: IndicatorFilter): Promise<IndicatorWithCandle[]>;
  count(filter?: IndicatorFilter): Promise<number>;
}

export interface TradeFilter {
  symbol?: string;
  status?: TradeStatus;
  from?: Date;
  to?: Date;
  dateField?: "buyTime" | "sellTime";
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

export interface ITradeRepository {
  create(input: TradeInput): Promise<Trade>;
  close(id: number, input: TradeCloseInput): Promise<Trade>;
  findById(id: number): Promise<Trade | null>;
  findOpen(symbol?: string): Promise<Trade | null>;
  findMany(filter?: TradeFilter): Promise<Trade[]>;
  findClosed(filter?: Omit<TradeFilter, "status">): Promise<Trade[]>;
  count(filter?: TradeFilter): Promise<number>;
  sumNetProfit(from: Date, to?: Date): Promise<number>;
}

export interface IWalletRepository {
  getSingleton(): Promise<WalletRow | null>;
  create(state: WalletState): Promise<WalletRow>;
  update(id: number, state: Partial<WalletState>): Promise<WalletRow>;
  upsertSingleton(state: WalletState): Promise<WalletRow>;
}

export interface IPredictionRepository {
  create(prediction: Omit<PredictionRow, "id">): Promise<PredictionRow>;
  findLatest(): Promise<PredictionRow | null>;
  findMany(limit?: number): Promise<PredictionRow[]>;
}

export interface LogFilter {
  level?: LogLevel;
  module?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface ILogRepository {
  create(entry: Omit<LogEntry, "id">): Promise<LogEntry>;
  findMany(filter?: LogFilter): Promise<LogEntry[]>;
  count(filter?: LogFilter): Promise<number>;
}

export type SettingsCreateInput = Omit<SettingsModel, "id" | "createdAt" | "updatedAt">;

export interface ISettingsRepository {
  getSingleton(): Promise<SettingsModel | null>;
  upsertSingleton(settings: SettingsCreateInput): Promise<SettingsModel>;
  update(id: number, settings: SettingsUpdate): Promise<SettingsModel>;
}

export interface Repositories {
  candle: ICandleRepository;
  indicator: IIndicatorRepository;
  trade: ITradeRepository;
  wallet: IWalletRepository;
  prediction: IPredictionRepository;
  log: ILogRepository;
  settings: ISettingsRepository;
}
