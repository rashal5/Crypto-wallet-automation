import assert from "node:assert/strict";
import test from "node:test";
import {
  computeMaxDrawdown,
  computeStreaks,
  computeTradeStatistics,
  type CompletedTrade,
} from "../src/services/analytics/statistics";

function trade(netProfit: number, day: number, fees = 0.02): CompletedTrade {
  return {
    netProfit,
    fees,
    sellTime: new Date(Date.UTC(2026, 0, day)),
  };
}

test("trade statistics aggregate profit, win rate and fees", () => {
  const stats = computeTradeStatistics(
    [trade(2, 1), trade(-1, 2), trade(3, 3)],
    80,
    84,
    new Date(Date.UTC(2026, 0, 4)),
  );

  assert.equal(stats.totalTrades, 3);
  assert.equal(stats.winningTrades, 2);
  assert.equal(stats.losingTrades, 1);
  assert.equal(stats.winRate, 66.67);
  assert.equal(stats.lossRate, 33.33);
  assert.equal(stats.totalProfit, 4);
  assert.equal(stats.totalFees, 0.06);
  assert.equal(stats.averageWin, 2.5);
  assert.equal(stats.averageLoss, -1);
  assert.equal(stats.riskRewardRatio, 2.5);
  assert.equal(stats.profitFactor, 5);
  assert.equal(stats.currentEquity, 84);
  assert.equal(stats.totalReturnPercent, 5);
});

test("max drawdown tracks the deepest peak-to-trough drop", () => {
  const result = computeMaxDrawdown([
    { time: new Date(Date.UTC(2026, 0, 1)), equity: 100 },
    { time: new Date(Date.UTC(2026, 0, 2)), equity: 120 },
    { time: new Date(Date.UTC(2026, 0, 3)), equity: 90 },
    { time: new Date(Date.UTC(2026, 0, 4)), equity: 110 },
  ]);

  assert.equal(result.value, 30);
  assert.equal(result.percent, 25);
});

test("streaks count consecutive wins and losses", () => {
  const streak = computeStreaks([
    trade(1, 1),
    trade(2, 2),
    trade(-1, 3),
    trade(-2, 4),
    trade(-3, 5),
    trade(4, 6),
  ]);

  assert.equal(streak.longestWinningStreak, 2);
  assert.equal(streak.longestLosingStreak, 3);
});

test("empty history produces zeroed statistics without throwing", () => {
  const stats = computeTradeStatistics([], 80, 80);

  assert.equal(stats.totalTrades, 0);
  assert.equal(stats.winRate, 0);
  assert.equal(stats.totalProfit, 0);
  assert.equal(stats.riskRewardRatio, null);
  assert.equal(stats.sharpeRatio, null);
  assert.equal(stats.equityCurve.length, 1);
});
