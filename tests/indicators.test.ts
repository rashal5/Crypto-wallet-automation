import assert from "node:assert/strict";
import test from "node:test";
import { computeIndicatorSeries } from "../src/services/indicators/series";
import type { Candle } from "../src/types/domain";

function candles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.5;
    return {
      id: index + 1,
      symbol: "BTCUSDT",
      interval: "1",
      timestamp: new Date(Date.UTC(2026, 0, 1) + index * 60_000),
      open: close - 0.2,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000 + index,
    };
  });
}

test("indicator series is aligned with candles and starts after EMA200 warm-up", () => {
  const input = candles(260);
  const series = computeIndicatorSeries(input);

  assert.equal(series.length, input.length);
  assert.equal(series[198]?.values, null);
  assert.notEqual(series[199]?.values, null);
  assert.equal(series[series.length - 1]?.candle.timestamp.getTime(), input[259]?.timestamp.getTime());
});

test("computed indicators are finite and internally consistent", () => {
  const series = computeIndicatorSeries(candles(260));
  const latest = series[series.length - 1]?.values;

  assert.ok(latest);
  for (const value of Object.values(latest)) {
    assert.ok(Number.isFinite(value));
  }
  assert.ok(latest.rsi >= 0 && latest.rsi <= 100);
  assert.ok(latest.bbUpper > latest.bbLower);
  assert.ok(latest.ema20 >= latest.ema50);
  assert.ok(latest.volumeAverage > 0);
});

test("empty input returns an empty series", () => {
  assert.deepEqual(computeIndicatorSeries([]), []);
});
