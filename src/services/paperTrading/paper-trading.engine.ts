import { MODULES } from "../../config/constants";
import type { IUnitOfWork } from "../../database/unit-of-work";
import type {
  Candle,
  IndicatorValues,
  PredictionResult,
  SettingsModel,
  Trade,
} from "../../types/domain";
import { ConfigurationError } from "../../utils/errors";
import type { ILogger } from "../../utils/logger";
import { round, roundMoney } from "../../utils/number";
import type { IFeeService } from "./fee.service";
import { applyClose, applyOpen } from "./wallet-math";
import type { IStrategyRegistry } from "../strategy/strategy.registry";
import type { StrategyDecision } from "../strategy/strategy.interface";

export type TradeAction = "OPENED" | "CLOSED" | "HOLD" | "SKIPPED";

export interface TradeActionResult {
  action: TradeAction;
  reason: string;
  trade: Trade | null;
  decision: StrategyDecision;
}

export interface PaperTradingInput {
  candle: Candle;
  indicators: IndicatorValues;
  prediction: PredictionResult;
  settings: SettingsModel;
}

export interface IPaperTradingEngine {
  process(input: PaperTradingInput): Promise<TradeActionResult>;
}

/**
 * PAPER TRADING ENGINE.
 *
 * This class simulates fills locally. It has no exchange client dependency and no
 * method capable of submitting a real order. Every state transition updates the
 * virtual wallet and is persisted atomically with the trade row.
 */
export class PaperTradingEngine implements IPaperTradingEngine {
  constructor(
    private readonly unitOfWork: IUnitOfWork,
    private readonly feeService: IFeeService,
    private readonly strategyRegistry: IStrategyRegistry,
    private readonly logger: ILogger,
  ) {}

  async process(input: PaperTradingInput): Promise<TradeActionResult> {
    const { candle, indicators, prediction, settings } = input;
    const strategy = this.strategyRegistry.get(settings.strategyName);

    const openTrade = await this.unitOfWork.repos.trade.findOpen(candle.symbol);

    if (openTrade) {
      const decision = strategy.evaluateExit({
        symbol: candle.symbol,
        currentPrice: candle.close,
        indicators,
        prediction,
        settings,
        position: openTrade,
      });

      if (decision.action !== "SELL") {
        this.logger.debug(MODULES.PAPER_TRADING, "Holding open position", {
          tradeId: openTrade.id,
          reason: decision.reason,
        });
        return { action: "HOLD", reason: decision.reason, trade: openTrade, decision };
      }

      return this.closePosition(openTrade.id, candle, settings, decision);
    }

    const decision = strategy.evaluateEntry({
      symbol: candle.symbol,
      currentPrice: candle.close,
      indicators,
      prediction,
      settings,
      position: null,
    });

    if (decision.action !== "BUY") {
      return { action: "HOLD", reason: decision.reason, trade: null, decision };
    }

    return this.openPosition(candle, settings, decision);
  }

  private async openPosition(
    candle: Candle,
    settings: SettingsModel,
    decision: StrategyDecision,
  ): Promise<TradeActionResult> {
    const result = await this.unitOfWork.transaction(async (repos) => {
      const existing = await repos.trade.findOpen(candle.symbol);
      if (existing) {
        return {
          action: "SKIPPED" as TradeAction,
          reason: "Duplicate entry prevented: an open trade already exists",
          trade: existing,
        };
      }

      const wallet = await repos.wallet.getSingleton();
      if (!wallet) {
        throw new ConfigurationError("Paper wallet is not initialized");
      }

      if (!Number.isFinite(candle.close) || candle.close <= 0) {
        return { action: "SKIPPED" as TradeAction, reason: "Invalid market price", trade: null };
      }

      const notional = roundMoney(settings.maxTradeSize);
      const buyFee = this.feeService.calculateBuyFee(notional, settings.buyFeePercent);
      const requiredCash = roundMoney(notional + buyFee);

      // Never deploy the entire wallet, and never open a position that cannot pay its fee.
      if (notional <= 0 || requiredCash >= wallet.available) {
        return {
          action: "SKIPPED" as TradeAction,
          reason: `Insufficient available balance (need ${requiredCash}, have ${wallet.available})`,
          trade: null,
        };
      }

      const quantity = round(notional / candle.close, 8);
      if (quantity <= 0) {
        return { action: "SKIPPED" as TradeAction, reason: "Calculated quantity is zero", trade: null };
      }

      const trade = await repos.trade.create({
        symbol: candle.symbol,
        buyPrice: round(candle.close, 8),
        quantity,
        investment: notional,
        fees: buyFee,
        buyTime: candle.timestamp,
        status: "OPEN",
        reason: `Entry: ${decision.reason}`,
      });

      const nextWallet = applyOpen(wallet, notional, buyFee);
      await repos.wallet.update(wallet.id, nextWallet);

      return {
        action: "OPENED" as TradeAction,
        reason: decision.reason,
        trade,
      };
    });

    if (result.action === "OPENED" && result.trade) {
      this.logger.info(MODULES.PAPER_TRADING, "PAPER BUY executed", {
        tradeId: result.trade.id,
        symbol: result.trade.symbol,
        price: result.trade.buyPrice,
        quantity: result.trade.quantity,
        investment: result.trade.investment,
        fees: result.trade.fees,
        reason: result.reason,
      });
    } else if (result.action === "SKIPPED") {
      this.logger.warn(MODULES.PAPER_TRADING, `Paper buy skipped: ${result.reason}`, {
        symbol: candle.symbol,
        price: candle.close,
      });
    }

    return { ...result, decision };
  }

  private async closePosition(
    tradeId: number,
    candle: Candle,
    settings: SettingsModel,
    decision: StrategyDecision,
  ): Promise<TradeActionResult> {
    const result = await this.unitOfWork.transaction(async (repos) => {
      const trade = await repos.trade.findById(tradeId);
      if (!trade || trade.status !== "OPEN") {
        return {
          action: "SKIPPED" as TradeAction,
          reason: "Trade is no longer open",
          trade: trade ?? null,
        };
      }

      const wallet = await repos.wallet.getSingleton();
      if (!wallet) {
        throw new ConfigurationError("Paper wallet is not initialized");
      }

      const sellPrice = round(candle.close, 8);
      const grossProceeds = roundMoney(trade.quantity * sellPrice);
      const buyFee = trade.fees;
      const sellFee = this.feeService.calculateSellFee(grossProceeds, settings.sellFeePercent);
      const grossProfit = roundMoney(grossProceeds - trade.investment);
      const totalFees = roundMoney(buyFee + sellFee);
      const netProfit = roundMoney(grossProceeds - sellFee - trade.investment - buyFee);

      const closed = await repos.trade.close(trade.id, {
        sellPrice,
        sellTime: candle.timestamp,
        profit: grossProfit,
        fees: totalFees,
        netProfit,
        status: "CLOSED",
        reason: decision.reason,
      });

      const nextWallet = applyClose(wallet, {
        investment: trade.investment,
        buyFee,
        grossProceeds,
        sellFee,
        netProfit,
      });
      await repos.wallet.update(wallet.id, nextWallet);

      return {
        action: "CLOSED" as TradeAction,
        reason: decision.reason,
        trade: closed,
      };
    });

    if (result.action === "CLOSED" && result.trade) {
      this.logger.info(MODULES.PAPER_TRADING, "PAPER SELL executed", {
        tradeId: result.trade.id,
        symbol: result.trade.symbol,
        buyPrice: result.trade.buyPrice,
        sellPrice: result.trade.sellPrice,
        quantity: result.trade.quantity,
        grossProfit: result.trade.profit,
        fees: result.trade.fees,
        netProfit: result.trade.netProfit,
        reason: result.reason,
      });
    } else if (result.action === "SKIPPED") {
      this.logger.warn(MODULES.PAPER_TRADING, `Paper sell skipped: ${result.reason}`, { tradeId });
    }

    return { ...result, decision };
  }
}
