import type { ITradeRepository } from "../../database/repositories/interfaces";
import type {
  Candle,
  IndicatorWithCandle,
  PredictionRow,
  SettingsModel,
  Trade,
  WalletRow,
} from "../../types/domain";
import { TRADE_STATUS } from "../../config/constants";
import { endOfUtcDay, startOfUtcDay } from "../../utils/time";
import { roundMoney } from "../../utils/number";
import type { IIndicatorService } from "../indicators/indicator.service";
import type { IMarketService } from "../market/market.service";
import type { IPredictionService } from "../prediction/prediction.service";
import type { ISettingsService } from "../settings/settings.service";
import type { IWalletService, WalletSnapshot } from "../wallet/wallet.service";

export interface DashboardResponse {
  wallet: WalletSnapshot;
  todayProfit: number;
  todayTrades: number;
  totalProfit: number;
  currentPosition: WalletSnapshot["openPosition"];
  openTrade: Trade | null;
  fees: number;
  winRate: number;
  prediction: PredictionRow | null;
  latestCandle: Candle | null;
  latestIndicators: IndicatorWithCandle | null;
  settings: {
    symbol: string;
    interval: string;
    paperTradingEnabled: boolean;
    strategyName: string;
    startingBalance: number;
    maxTradeSize: number;
  };
  scheduler: {
    lastCycleAt: Date | null;
    lastProcessedCandleAt: Date | null;
  };
  updatedAt: Date;
}

export interface IDashboardService {
  getDashboard(): Promise<DashboardResponse>;
}

export class DashboardService implements IDashboardService {
  constructor(
    private readonly settingsService: ISettingsService,
    private readonly marketService: IMarketService,
    private readonly indicatorService: IIndicatorService,
    private readonly predictionService: IPredictionService,
    private readonly walletService: IWalletService,
    private readonly tradeRepository: ITradeRepository,
  ) {}

  async getDashboard(): Promise<DashboardResponse> {
    const settings: SettingsModel = await this.settingsService.get();

    const [latestCandle, prediction, latestIndicators] = await Promise.all([
      this.marketService.getLatest(settings.symbol, settings.interval),
      this.predictionService.getLatest(),
      this.indicatorService.getLatest(settings.symbol, settings.interval),
    ]);

    const wallet = await this.walletService.getSnapshot(latestCandle?.close);

    const from = startOfUtcDay();
    const to = endOfUtcDay();
    const [todayProfit, todayTrades] = await Promise.all([
      this.tradeRepository.sumNetProfit(from, to),
      this.tradeRepository.count({
        status: TRADE_STATUS.CLOSED,
        dateField: "sellTime",
        from,
        to,
      }),
    ]);

    return {
      wallet,
      todayProfit: roundMoney(todayProfit),
      todayTrades,
      totalProfit: wallet.totalProfit,
      currentPosition: wallet.openPosition,
      openTrade: wallet.openPosition?.trade ?? null,
      fees: wallet.totalFees,
      winRate: wallet.winRate,
      prediction,
      latestCandle,
      latestIndicators,
      settings: {
        symbol: settings.symbol,
        interval: settings.interval,
        paperTradingEnabled: settings.paperTradingEnabled,
        strategyName: settings.strategyName,
        startingBalance: settings.startingBalance,
        maxTradeSize: settings.maxTradeSize,
      },
      scheduler: {
        lastCycleAt: settings.lastCycleAt,
        lastProcessedCandleAt: settings.lastProcessedCandleAt,
      },
      updatedAt: new Date(),
    };
  }
}
