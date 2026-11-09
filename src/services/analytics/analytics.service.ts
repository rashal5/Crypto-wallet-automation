import type {
  ICandleRepository,
  ITradeRepository,
} from "../../database/repositories/interfaces";
import type { TradeStatistics } from "../../types/domain";
import type { ISettingsService } from "../settings/settings.service";
import type { IWalletService } from "../wallet/wallet.service";
import { computeTradeStatistics, type CompletedTrade } from "./statistics";

export interface IAnalyticsService {
  getAnalytics(): Promise<TradeStatistics>;
}

export class AnalyticsService implements IAnalyticsService {
  constructor(
    private readonly tradeRepository: ITradeRepository,
    private readonly candleRepository: ICandleRepository,
    private readonly walletService: IWalletService,
    private readonly settingsService: ISettingsService,
  ) {}

  async getAnalytics(): Promise<TradeStatistics> {
    const settings = await this.settingsService.get();

    const [closedTrades, latestCandle] = await Promise.all([
      this.tradeRepository.findClosed({ order: "asc", limit: 100_000 }),
      this.candleRepository.findLatest(settings.symbol, settings.interval),
    ]);

    const wallet = await this.walletService.getSnapshot(latestCandle?.close);

    const completed: CompletedTrade[] = closedTrades.map((trade) => ({
      netProfit: trade.netProfit ?? 0,
      fees: trade.fees,
      sellTime: trade.sellTime ?? trade.buyTime,
    }));

    return computeTradeStatistics(completed, settings.startingBalance, wallet.currentEquity);
  }
}
