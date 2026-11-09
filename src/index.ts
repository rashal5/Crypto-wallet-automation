import type { Server } from "node:http";
import { createApp } from "./app";
import { config } from "./config";
import { MODULES } from "./config/constants";
import { createContainer } from "./container";
import { initializeDatabase } from "./database/init";
import { connectDatabase, disconnectDatabase } from "./database/prisma";
import { intervalToMilliseconds } from "./utils/time";

async function bootstrapMarketData(container: ReturnType<typeof createContainer>): Promise<void> {
  const { services, logger, config: appConfig } = container;
  const settings = await services.settings.get();

  try {
    await services.market.ensureSeeded(250);

    const [latestCandle, latestIndicator] = await Promise.all([
      services.market.getLatest(settings.symbol, settings.interval),
      services.indicators.getLatest(settings.symbol, settings.interval),
    ]);

    const intervalMs = intervalToMilliseconds(settings.interval);
    const gapMs =
      latestCandle && latestIndicator
        ? latestCandle.timestamp.getTime() - latestIndicator.candle.timestamp.getTime()
        : Number.POSITIVE_INFINITY;
    const needsRebuild = !latestIndicator || gapMs > intervalMs * appConfig.market.lookbackCandles;

    if (needsRebuild) {
      await services.indicators.recomputeAll(settings.symbol, settings.interval);
      logger.info(MODULES.APP, "Indicators reconstructed from stored candles", {
        symbol: settings.symbol,
        interval: settings.interval,
      });
    } else {
      await services.indicators.syncRecent(settings.symbol, settings.interval);
    }
  } catch (error) {
    logger.error(MODULES.APP, "Market data bootstrap failed; API will still serve", error);
  }
}

async function main(): Promise<void> {
  await connectDatabase();

  const container = createContainer();
  const { logger, services } = container;

  await initializeDatabase(container.unitOfWork.repos, config);

  const app = createApp(container);
  const server: Server = app.listen(config.port, () => {
    logger.info(MODULES.APP, `API listening on http://localhost:${config.port}`, {
      nodeEnv: config.nodeEnv,
      apiPrefix: config.http.apiPrefix,
    });
    logger.info(MODULES.APP, "PAPER TRADING ONLY: no real orders can be placed by this server");
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(MODULES.APP, `Shutting down (${signal})`);
    services.scheduler.stop();

    const forcedExit = setTimeout(() => {
      logger.error(MODULES.APP, "Forced shutdown after timeout");
      process.exit(1);
    }, 10_000);
    forcedExit.unref();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    await disconnectDatabase();
    logger.info(MODULES.APP, "Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGBREAK", () => void shutdown("SIGBREAK"));

  process.on("unhandledRejection", (reason) => {
    logger.error(MODULES.APP, "Unhandled promise rejection", reason);
  });

  process.on("uncaughtException", (error) => {
    logger.error(MODULES.APP, "Uncaught exception", error);
    void shutdown("uncaughtException");
  });

  await bootstrapMarketData(container);

  if (services.scheduler.isRunning()) {
    logger.info(MODULES.APP, "Scheduler already active");
    return;
  }

  const settings = await services.settings.get();
  if (settings.paperTradingEnabled) {
    services.scheduler.start();
  } else {
    logger.info(MODULES.APP, "Paper trading disabled; scheduler not started");
  }
}

main().catch(async (error: unknown) => {
  console.error("Fatal startup error:", error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
