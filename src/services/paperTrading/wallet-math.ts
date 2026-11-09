import type { WalletState } from "../../types/domain";
import { round } from "../../utils/number";

/**
 * Pure wallet transitions. Keeping this logic free of database and Express code
 * makes it trivial to unit test and reuse in the backtest engine.
 */

export function createWalletState(startingBalance: number): WalletState {
  return {
    balance: round(startingBalance),
    available: round(startingBalance),
    invested: 0,
    totalFees: 0,
    totalProfit: 0,
    winRate: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
  };
}

export function isWinningTrade(netProfit: number): boolean {
  return netProfit > 0;
}

export function calculateWinRate(winningTrades: number, totalTrades: number): number {
  if (totalTrades <= 0) return 0;
  return round((winningTrades / totalTrades) * 100, 2);
}

/**
 * Open a position:
 * - `notional` is the position size in quote currency (e.g. 10 USDT)
 * - the buy fee is charged immediately and is part of the invested cost basis
 */
export function applyOpen(wallet: WalletState, notional: number, buyFee: number): WalletState {
  const cashOut = round(notional + buyFee);
  const available = round(wallet.available - cashOut);
  const invested = round(wallet.invested + cashOut);

  return {
    ...wallet,
    available,
    invested,
    balance: round(available + invested),
    totalFees: round(wallet.totalFees + buyFee),
  };
}

export interface CloseInput {
  investment: number;
  buyFee: number;
  grossProceeds: number;
  sellFee: number;
  netProfit: number;
}

/**
 * Close a position. `grossProceeds` is quantity * sellPrice before the sell fee.
 * Total fees on the trade are buy fee + sell fee.
 */
export function applyClose(wallet: WalletState, input: CloseInput): WalletState {
  const netProceeds = round(input.grossProceeds - input.sellFee);
  const available = round(wallet.available + netProceeds);
  const invested = round(wallet.invested - (input.investment + input.buyFee));
  const totalTrades = wallet.totalTrades + 1;
  const winningTrades = wallet.winningTrades + (isWinningTrade(input.netProfit) ? 1 : 0);
  const losingTrades = wallet.losingTrades + (isWinningTrade(input.netProfit) ? 0 : 1);

  return {
    ...wallet,
    available,
    invested,
    totalFees: round(wallet.totalFees + input.sellFee),
    totalProfit: round(wallet.totalProfit + input.netProfit),
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: calculateWinRate(winningTrades, totalTrades),
    balance: round(available + invested),
  };
}
