import { MAX_BACKTEST_CANDLES, MODULES, TRADE_STATUS } from "../../config/constants";
import type { IIndicatorRepository } from "../../database/repositories/interfaces";
import type {
  IndicatorWithCandle,
  PredictionResult,
  SettingsModel,
  Trade,
  TradeStatistics,
} from "../../types/domain";
import { BadRequestError } from "../../utils/errors";
import type { ILogger } from "../../utils/logger";
import { round, roundMoney } from "../../utils/number";
import { computeTradeStatistics } from "../analytics/statistics";
import { applyClose, applyOpen, createWalletState } from "../paperTrading/wallet-math";
import type { IFeeService } from "../paperTrading/fee.service";
import type { IFeatureService } from "../prediction/feature.service";
import { MINIMUM_FEATURE_CANDLES } from "../prediction/feature.service";
import type { IPredictionProvider } from "../prediction/prediction.interface";
import type { ISettingsService } from "../settings/settings.service";
import type { IStrategyRegistry } from "../strategy/strategy.registry";

export interface BacktestParams {
  symbol?: string;
  interval?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  strategyName?: string;
  initialBalance?: number;
  tradeSize?: number;
  buyFeePercent?: number;
  sellFeePercent?: number;
  stopLossPercent?: number;
  takeProfitPercent?: number;
  rsiBuyThreshold?: number;
  aiConfidenceThreshold?: number;
}

export interface BacktestTrade {
  entryTime: Date;
  exitTime: Date;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  investment: number;
  buyFee: number;
  sellFee: number;
  totalFees: number;
  grossProfit: number;
  netProfit: number;
  reason: string;
}

export interface BacktestReport {
  symbol: string;
  interval: string;
  strategy: string;
  period: {
    from: Date;
    to: Date;
    candles: number;
  };
  parameters: {
    initialBalance: number;
    tradeSize: number;
    buyFeePercent: number;
    sellFeePercent: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    rsiBuyThreshold: number;
    aiConfidenceThreshold: number;
  };
  summary: TradeStatistics;
  trades: BacktestTrade[];
  equityCurve: TradeStatistics["equityCurve"];
  generatedAt: Date;
}

export interface IBacktestService {
  run(params?: BacktestParams): Promise<BacktestReport>;
}

interface SimulatedPosition {
  buyPrice: number;
  quantity: number;
  investment: number;
  buyFee: number;
  buyTime: Date;
}

export class BacktestService implements IBacktestService {
  constructor(
    private readonly indicatorRepository: IIndicatorRepository,
    private readonly featureService: IFeatureService,
    private readonly heuristicProvider: IPredictionProvider,
    private readonly strategyRegistry: IStrategyRegistry,
    private readonly feeService: IFeeService,
    private readonly settingsService: ISettingsService,
    private readonly logger: ILogger,
  ) {}

  async run(params: BacktestParams = {}): Promise<BacktestReport> {
    const settings = await this.settingsService.get();
    const symbol = params.symbol ?? settings.symbol;
    const interval = params.interval ?? settings.interval;
    const strategyName = params.strategyName ?? settings.strategyName;
    const strategy = this.strategyRegistry.get(strategyName);
    const limit = Math.min(params.limit ?? 2_000, MAX_BACKTEST_CANDLES);

    // Fetch the most recent window, then walk it oldest-first.
    const recentRows = await this.indicatorRepository.findMany({
      symbol,
      interval,
      from: params.from,
      to: params.to,
      order: "desc",
      limit,
    });
    const rows = recentRows.slice().reverse();

    if (rows.length < MINIMUM_FEATURE_CANDLES) {
      throw new BadRequestError(
        `Not enough candles with indicators for a backtest (need at least ${MINIMUM_FEATURE_CANDLES}). Download historical data first.`,
        { symbol, interval, candles: rows.length },
      );
    }

    const initialBalance = params.initialBalance ?? settings.startingBalance;
    const simulatedSettings: SettingsModel = {
      ...settings,
      strategyName,
      paperTradingEnabled: true,
      startingBalance: initialBalance,
      maxTradeSize: params.tradeSize ?? settings.maxTradeSize,
      buyFeePercent: params.buyFeePercent ?? settings.buyFeePercent,
      sellFeePercent: params.sellFeePercent ?? settings.sellFeePercent,
      stopLossPercent: params.stopLossPercent ?? settings.stopLossPercent,
      takeProfitPercent: params.takeProfitPercent ?? settings.takeProfitPercent,
      rsiBuyThreshold: params.rsiBuyThreshold ?? settings.rsiBuyThreshold,
      aiConfidenceThreshold: params.aiConfidenceThreshold ?? settings.aiConfidenceThreshold,
    };

    let wallet = createWalletState(initialBalance);
    let position: SimulatedPosition | null = null;
    const trades: BacktestTrade[] = [];
    const equityCurve: TradeStatistics["equityCurve"] = [];
    const candles = rows.map((row) => row.candle);
    const startIndex = MINIMUM_FEATURE_CANDLES - 1;

    for (let i = startIndex; i < rows.length; i += 1) {
      const row = rows[i] as IndicatorWithCandle;
      const candle = row.candle;
      const slice = candles.slice(Math.max(0, i - 59), i + 1);
      const features = this.featureService.build(slice, row);
      const rawPrediction = await this.heuristicProvider.predict(features);
      const prediction: PredictionResult = { ...rawPrediction, time: candle.timestamp };

      const syntheticPosition: Trade | null = position
        ? {
            id: -1,
            symbol,
            buyPrice: position.buyPrice,
            sellPrice: null,
            quantity: position.quantity,
            investment: position.investment,
            profit: null,
            fees: position.buyFee,
            netProfit: null,
            buyTime: position.buyTime,
            sellTime: null,
            status: TRADE_STATUS.OPEN,
            reason: null,
          }
        : null;

      if (position) {
        const exitDecision = strategy.evaluateExit({
          symbol,
          currentPrice: candle.close,
          indicators: row,
          prediction,
          settings: simulatedSettings,
          position: syntheticPosition,
        });

        if (exitDecision.action === "SELL") {
          const exit = this.closeSimulated(
            position,
            candle.close,
            candle.timestamp,
            simulatedSettings.sellFeePercent,
          );
          wallet = applyClose(wallet, {
            investment: position.investment,
            buyFee: position.buyFee,
            grossProceeds: exit.grossProceeds,
            sellFee: exit.sellFee,
            netProfit: exit.netProfit,
          });
          trades.push(exit.trade);
          position = null;
        }
      }

      if (!position) {
        const entryDecision = strategy.evaluateEntry({
          symbol,
          currentPrice: candle.close,
          indicators: row,
          prediction,
          settings: simulatedSettings,
          position: null,
        });

        if (entryDecision.action === "BUY") {
          const notional = roundMoney(simulatedSettings.maxTradeSize);
          const buyFee = this.feeService.calculateBuyFee(notional, simulatedSettings.buyFeePercent);
          const requiredCash = roundMoney(notional + buyFee);

          if (notional > 0 && requiredCash < wallet.available && candle.close > 0) {
            wallet = applyOpen(wallet, notional, buyFee);
            position = {
              buyPrice: candle.close,
              quantity: round(notional / candle.close, 8),
              investment: notional,
              buyFee,
              buyTime: candle.timestamp,
            };
          }
        }
      }

      const marketValue = position ? position.quantity * candle.close : 0;
      equityCurve.push({
        time: candle.timestamp,
        equity: roundMoney(wallet.available + marketValue),
      });
    }

    // Force-close any position still open at the end of the dataset.
    if (position) {
      const lastCandle = rows[rows.length - 1]?.candle;
      if (lastCandle) {
        const exit = this.closeSimulated(
          position,
          lastCandle.close,
          lastCandle.timestamp,
          simulatedSettings.sellFeePercent,
          "END_OF_DATA",
        );
        wallet = applyClose(wallet, {
          investment: position.investment,
          buyFee: position.buyFee,
          grossProceeds: exit.grossProceeds,
          sellFee: exit.sellFee,
          netProfit: exit.netProfit,
        });
        trades.push(exit.trade);
        position = null;

        const lastPoint = equityCurve[equityCurve.length - 1];
        if (lastPoint) lastPoint.equity = wallet.available;
      }
    }

    const finalEquity = wallet.available;
    const summary = computeTradeStatistics(
      trades.map((trade) => ({
        netProfit: trade.netProfit,
        fees: trade.totalFees,
        sellTime: trade.exitTime,
      })),
      initialBalance,
      finalEquity,
      rows[rows.length - 1]?.candle.timestamp ?? new Date(),
    );

    const report: BacktestReport = {
      symbol,
      interval,
      strategy: strategyName,
      period: {
        from: rows[0]?.candle.timestamp ?? new Date(),
        to: rows[rows.length - 1]?.candle.timestamp ?? new Date(),
        candles: rows.length,
      },
      parameters: {
        initialBalance,
        tradeSize: simulatedSettings.maxTradeSize,
        buyFeePercent: simulatedSettings.buyFeePercent,
        sellFeePercent: simulatedSettings.sellFeePercent,
        stopLossPercent: simulatedSettings.stopLossPercent,
        takeProfitPercent: simulatedSettings.takeProfitPercent,
        rsiBuyThreshold: simulatedSettings.rsiBuyThreshold,
        aiConfidenceThreshold: simulatedSettings.aiConfidenceThreshold,
      },
      summary,
      trades: trades.slice(-1_000),
      equityCurve: summary.equityCurve,
      generatedAt: new Date(),
    };

    this.logger.info(MODULES.BACKTEST, "Backtest completed", {
      symbol,
      interval,
      strategy: strategyName,
      candles: rows.length,
      trades: summary.totalTrades,
      totalProfit: summary.totalProfit,
      winRate: summary.winRate,
      maxDrawdownPercent: summary.maxDrawdownPercent,
    });

    return report;
  }

  private closeSimulated(
    position: SimulatedPosition,
    sellPrice: number,
    sellTime: Date,
    sellFeePercent: number,
    reason = "STRATEGY_EXIT",
  ): {
    trade: BacktestTrade;
    grossProceeds: number;
    sellFee: number;
    netProfit: number;
  } {
    const grossProceeds = roundMoney(position.quantity * sellPrice);
    const sellFee = this.feeService.calculateSellFee(grossProceeds, sellFeePercent);
    return {
      trade: {
        entryTime: position.buyTime,
        exitTime: sellTime,
        buyPrice: position.buyPrice,
        sellPrice,
        quantity: position.quantity,
        investment: position.investment,
        buyFee: position.buyFee,
        sellFee,
        totalFees: roundMoney(position.buyFee + sellFee),
        grossProfit: roundMoney(grossProceeds - position.investment),
        netProfit: roundMoney(grossProceeds - sellFee - position.investment - position.buyFee),
        reason,
      },
      grossProceeds,
      sellFee,
      netProfit: roundMoney(grossProceeds - sellFee - position.investment - position.buyFee),
    };
  }
}
