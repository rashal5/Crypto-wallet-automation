import type { AppConfig } from "../../config";
import { MODULES } from "../../config/constants";
import type { ISettingsRepository } from "../../database/repositories/interfaces";
import type { SettingsModel, SettingsUpdate } from "../../types/domain";
import type { ILogger } from "../../utils/logger";

export interface ISettingsService {
  get(): Promise<SettingsModel>;
  update(update: SettingsUpdate): Promise<SettingsModel>;
  setPaperTradingEnabled(enabled: boolean): Promise<SettingsModel>;
  markProcessedCandle(timestamp: Date): Promise<SettingsModel>;
  markCycle(): Promise<SettingsModel>;
}

export class SettingsService implements ISettingsService {
  constructor(
    private readonly repository: ISettingsRepository,
    private readonly config: AppConfig,
    private readonly logger: ILogger,
  ) {}

  async get(): Promise<SettingsModel> {
    const existing = await this.repository.getSingleton();
    if (existing) return existing;

    const created = await this.repository.upsertSingleton({
      startingBalance: this.config.trading.startingBalance,
      buyFeePercent: this.config.trading.buyFeePercent,
      sellFeePercent: this.config.trading.sellFeePercent,
      stopLossPercent: this.config.trading.stopLossPercent,
      takeProfitPercent: this.config.trading.takeProfitPercent,
      maxTradeSize: this.config.trading.tradeSize,
      paperTradingEnabled: this.config.trading.paperTradingEnabled,
      symbol: this.config.market.symbol,
      interval: this.config.market.interval,
      rsiBuyThreshold: this.config.trading.rsiBuyThreshold,
      aiConfidenceThreshold: this.config.trading.aiConfidenceThreshold,
      strategyName: this.config.trading.strategyName,
      lastProcessedCandleAt: null,
      lastCycleAt: null,
    });

    this.logger.info(MODULES.SETTINGS, "Default settings created from environment", {
      symbol: created.symbol,
      interval: created.interval,
      paperTradingEnabled: created.paperTradingEnabled,
    });

    return created;
  }

  async update(update: SettingsUpdate): Promise<SettingsModel> {
    const current = await this.get();
    const nextUpdate: SettingsUpdate = { ...update };

    // A different market stream has its own candle timeline, so the previous
    // idempotency marker must not suppress the first cycle on the new stream.
    const symbolChanged = update.symbol !== undefined && update.symbol !== current.symbol;
    const intervalChanged = update.interval !== undefined && update.interval !== current.interval;
    if (symbolChanged || intervalChanged) {
      nextUpdate.lastProcessedCandleAt = null;
    }

    const updated = await this.repository.update(current.id, nextUpdate);

    this.logger.info(MODULES.SETTINGS, "Settings updated", {
      fields: Object.keys(nextUpdate),
      paperTradingEnabled: updated.paperTradingEnabled,
      strategyName: updated.strategyName,
      symbol: updated.symbol,
      interval: updated.interval,
    });

    return updated;
  }

  async setPaperTradingEnabled(enabled: boolean): Promise<SettingsModel> {
    return this.update({ paperTradingEnabled: enabled });
  }

  async markProcessedCandle(timestamp: Date): Promise<SettingsModel> {
    return this.update({
      lastProcessedCandleAt: timestamp,
      lastCycleAt: new Date(),
    });
  }

  async markCycle(): Promise<SettingsModel> {
    return this.update({ lastCycleAt: new Date() });
  }
}
