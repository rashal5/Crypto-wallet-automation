import type {
  ILogRepository,
  ITradeRepository,
  LogFilter,
  TradeFilter,
} from "../../database/repositories/interfaces";
import type { EquityPoint, LogEntry, Trade } from "../../types/domain";
import { buildEquityCurve } from "../analytics/statistics";
import type { ISettingsService } from "../settings/settings.service";

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface TradeHistoryResult extends PaginatedResult<Trade> {
  equityCurve: EquityPoint[];
}

export interface IHistoryService {
  getTrades(filter?: TradeFilter): Promise<TradeHistoryResult>;
  getLogs(filter?: LogFilter): Promise<PaginatedResult<LogEntry>>;
}

export class HistoryService implements IHistoryService {
  constructor(
    private readonly tradeRepository: ITradeRepository,
    private readonly logRepository: ILogRepository,
    private readonly settingsService: ISettingsService,
  ) {}

  async getTrades(filter: TradeFilter = {}): Promise<TradeHistoryResult> {
    const [items, total, closedTrades, settings] = await Promise.all([
      this.tradeRepository.findMany(filter),
      this.tradeRepository.count(filter),
      this.tradeRepository.findClosed({ order: "asc", limit: 100_000 }),
      this.settingsService.get(),
    ]);

    const equityCurve = buildEquityCurve(
      closedTrades.map((trade) => ({
        netProfit: trade.netProfit ?? 0,
        fees: trade.fees,
        sellTime: trade.sellTime ?? trade.buyTime,
      })),
      settings.startingBalance,
    );

    return {
      items,
      total,
      limit: filter.limit ?? items.length,
      offset: filter.offset ?? 0,
      equityCurve,
    };
  }

  async getLogs(filter: LogFilter = {}): Promise<PaginatedResult<LogEntry>> {
    const [items, total] = await Promise.all([
      this.logRepository.findMany(filter),
      this.logRepository.count(filter),
    ]);

    return {
      items,
      total,
      limit: filter.limit ?? items.length,
      offset: filter.offset ?? 0,
    };
  }
}
