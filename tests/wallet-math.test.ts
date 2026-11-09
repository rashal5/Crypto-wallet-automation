import assert from "node:assert/strict";
import test from "node:test";
import {
  applyClose,
  applyOpen,
  createWalletState,
} from "../src/services/paperTrading/wallet-math";

test("opening a paper position charges the buy fee and moves cash into invested", () => {
  const wallet = createWalletState(80);
  const next = applyOpen(wallet, 10, 0.01);

  assert.equal(next.available, 69.99);
  assert.equal(next.invested, 10.01);
  assert.equal(next.balance, 80);
  assert.equal(next.totalFees, 0.01);
  assert.equal(next.totalTrades, 0);
});

test("closing a winning paper position realizes net profit and releases the position", () => {
  const opened = applyOpen(createWalletState(80), 10, 0.01);
  const closed = applyClose(opened, {
    investment: 10,
    buyFee: 0.01,
    grossProceeds: 10.3,
    sellFee: 0.01,
    netProfit: 0.28,
  });

  assert.equal(closed.available, 80.28);
  assert.equal(closed.invested, 0);
  assert.equal(closed.balance, 80.28);
  assert.equal(closed.totalFees, 0.02);
  assert.equal(closed.totalProfit, 0.28);
  assert.equal(closed.totalTrades, 1);
  assert.equal(closed.winningTrades, 1);
  assert.equal(closed.losingTrades, 0);
  assert.equal(closed.winRate, 100);
});

test("closing a losing paper position updates losing counters", () => {
  const opened = applyOpen(createWalletState(80), 10, 0.01);
  const closed = applyClose(opened, {
    investment: 10,
    buyFee: 0.01,
    grossProceeds: 9.8,
    sellFee: 0.01,
    netProfit: -0.22,
  });

  assert.equal(closed.totalTrades, 1);
  assert.equal(closed.winningTrades, 0);
  assert.equal(closed.losingTrades, 1);
  assert.equal(closed.winRate, 0);
  assert.equal(closed.totalProfit, -0.22);
  assert.equal(closed.available, 79.78);
});
