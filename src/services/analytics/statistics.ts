import type { EquityPoint, TradeStatistics } from "../../types/domain";
import { mean, round, safeDivide, standardDeviation, sum } from "../../utils/number";

export interface CompletedTrade {
  netProfit: number;
  fees: number;
  sellTime: Date;
}

export interface StreakResult {
  longestWinningStreak: number;
  longestLosingStreak: number;
}

export function computeStreaks(trades: CompletedTrade[]): StreakResult {
  let currentWin = 0;
  let currentLoss = 0;
  let longestWin = 0;
  let longestLoss = 0;

  for (const trade of trades) {
    if (trade.netProfit > 0) {
      currentWin += 1;
      currentLoss = 0;
      longestWin = Math.max(longestWin, currentWin);
    } else {
      currentLoss += 1;
      currentWin = 0;
      longestLoss = Math.max(longestLoss, currentLoss);
    }
  }

  return { longestWinningStreak: longestWin, longestLosingStreak: longestLoss };
}

export function computeMaxDrawdown(equityCurve: EquityPoint[]): { value: number; percent: number } {
  if (equityCurve.length === 0) return { value: 0, percent: 0 };

  let peak = equityCurve[0]?.equity ?? 0;
  let maxValue = 0;
  let maxPercent = 0;

  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    const drawdown = peak - point.equity;
    const percent = peak > 0 ? (drawdown / peak) * 100 : 0;
    if (drawdown > maxValue) maxValue = drawdown;
    if (percent > maxPercent) maxPercent = percent;
  }

  return { value: round(maxValue), percent: round(maxPercent, 4) };
}

/**
 * Sharpe ratio from daily equity returns, annualized with sqrt(365).
 * Returns null when there are fewer than two usable daily returns.
 */
export function computeSharpeRatio(equityCurve: EquityPoint[], initialBalance: number): number | null {
  if (equityCurve.length === 0 || initialBalance <= 0) return null;

  const dayEndEquity = new Map<string, number>();
  for (const point of equityCurve) {
    dayEndEquity.set(point.time.toISOString().slice(0, 10), point.equity);
  }

  const sortedDays = [...dayEndEquity.entries()].sort(([a], [b]) => a.localeCompare(b));
  const returns: number[] = [];
  let previousEquity = initialBalance;

  for (const [, equity] of sortedDays) {
    if (previousEquity > 0) {
      returns.push((equity - previousEquity) / previousEquity);
    }
    previousEquity = equity;
  }

  if (returns.length < 2) return null;

  const deviation = standardDeviation(returns);
  if (deviation === 0) return null;

  return round((mean(returns) / deviation) * Math.sqrt(365), 4);
}

export function buildEquityCurve(trades: CompletedTrade[], initialBalance: number): EquityPoint[] {
  let equity = initialBalance;
  const curve: EquityPoint[] = [];

  for (const trade of trades) {
    equity += trade.netProfit;
    curve.push({ time: trade.sellTime, equity: round(equity) });
  }

  return curve;
}

export function computeTradeStatistics(
  trades: CompletedTrade[],
  initialBalance: number,
  currentEquity: number,
  finalTime: Date = new Date(),
): TradeStatistics {
  const ordered = [...trades].sort((a, b) => a.sellTime.getTime() - b.sellTime.getTime());
  const netProfits = ordered.map((trade) => trade.netProfit);
  const wins = netProfits.filter((profit) => profit > 0);
  const losses = netProfits.filter((profit) => profit <= 0);

  const totalProfit = round(sum(netProfits));
  const totalFees = round(sum(ordered.map((trade) => trade.fees)));
  const totalTrades = ordered.length;
  const winRate = totalTrades > 0 ? round((wins.length / totalTrades) * 100, 2) : 0;
  const lossRate = totalTrades > 0 ? round((losses.length / totalTrades) * 100, 2) : 0;

  const averageWin = round(wins.length > 0 ? mean(wins) : 0);
  const averageLoss = round(losses.length > 0 ? mean(losses) : 0);
  const riskRewardRatio =
    averageLoss === 0 ? null : round(Math.abs(safeDivide(averageWin, averageLoss)), 4);

  const grossProfit = sum(wins);
  const grossLoss = Math.abs(sum(losses));
  const profitFactor =
    grossLoss === 0 ? (grossProfit > 0 ? null : 0) : round(safeDivide(grossProfit, grossLoss), 4);

  const closedCurve = buildEquityCurve(ordered, initialBalance);
  const equityCurve = [...closedCurve];
  const lastPoint = equityCurve[equityCurve.length - 1];
  if (!lastPoint || lastPoint.equity !== round(currentEquity)) {
    equityCurve.push({ time: finalTime, equity: round(currentEquity) });
  }

  const drawdown = computeMaxDrawdown(equityCurve);
  const streaks = computeStreaks(ordered);

  return {
    initialBalance: round(initialBalance),
    currentEquity: round(currentEquity),
    totalProfit,
    totalReturnPercent:
      initialBalance > 0
        ? round(((currentEquity - initialBalance) / initialBalance) * 100, 4)
        : 0,
    totalFees,
    totalTrades,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate,
    lossRate,
    averageWin,
    averageLoss,
    riskRewardRatio,
    profitFactor,
    maxDrawdownValue: drawdown.value,
    maxDrawdownPercent: drawdown.percent,
    longestWinningStreak: streaks.longestWinningStreak,
    longestLosingStreak: streaks.longestLosingStreak,
    sharpeRatio: computeSharpeRatio(equityCurve, initialBalance),
    equityCurve,
  };
}
