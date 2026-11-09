import type { AppConfig } from "../config";
import type { SettingsModel, WalletRow } from "../types/domain";
import type { Repositories } from "./repositories/interfaces";

/**
 * Creates the singleton settings row and paper wallet on first boot.
 * Existing state is never overwritten, so restarts preserve the simulation.
 */
export async function initializeDatabase(
  repos: Repositories,
  config: AppConfig,
): Promise<{ settings: SettingsModel; wallet: WalletRow }> {
  const existingSettings = await repos.settings.getSingleton();

  const settings =
    existingSettings ??
    (await repos.settings.upsertSingleton({
      startingBalance: config.trading.startingBalance,
      buyFeePercent: config.trading.buyFeePercent,
      sellFeePercent: config.trading.sellFeePercent,
      stopLossPercent: config.trading.stopLossPercent,
      takeProfitPercent: config.trading.takeProfitPercent,
      maxTradeSize: config.trading.tradeSize,
      paperTradingEnabled: config.trading.paperTradingEnabled,
      symbol: config.market.symbol,
      interval: config.market.interval,
      rsiBuyThreshold: config.trading.rsiBuyThreshold,
      aiConfidenceThreshold: config.trading.aiConfidenceThreshold,
      strategyName: config.trading.strategyName,
      lastProcessedCandleAt: null,
      lastCycleAt: null,
    }));

  const existingWallet = await repos.wallet.getSingleton();

  const wallet =
    existingWallet ??
    (await repos.wallet.create({
      balance: settings.startingBalance,
      available: settings.startingBalance,
      invested: 0,
      totalFees: 0,
      totalProfit: 0,
      winRate: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
    }));

  return { settings, wallet };
}
