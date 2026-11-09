import { config } from "../src/config";
import { MODULES } from "../src/config/constants";
import { createContainer } from "../src/container";
import { initializeDatabase } from "../src/database/init";
import { connectDatabase, disconnectDatabase } from "../src/database/prisma";

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function main(): Promise<void> {
  const symbol = (process.argv[3] ?? config.market.symbol).toUpperCase();
  const interval = process.argv[4] ?? config.market.interval;
  const total = positiveInteger(process.argv[2], config.market.historyCandles);

  await connectDatabase();
  const container = createContainer();
  const { logger, services } = container;

  try {
    await initializeDatabase(container.unitOfWork.repos, config);

    logger.info(MODULES.MARKET, "Downloading historical candles", { symbol, interval, total });
    const result = await services.market.syncHistorical({ symbol, interval, total });

    logger.info(MODULES.MARKET, "Historical candles stored", { ...result });

    const indicators = await services.indicators.recomputeAll(symbol, interval);
    logger.info(MODULES.INDICATORS, "Indicators recomputed", { symbol, interval, indicators });

    logger.info(MODULES.APP, "History download complete", {
      symbol,
      interval,
      candles: result.inserted,
      indicators,
    });
  } finally {
    await disconnectDatabase();
  }
}

main().catch((error: unknown) => {
  console.error("History download failed:", error);
  process.exit(1);
});
