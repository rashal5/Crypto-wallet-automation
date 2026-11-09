import { Router } from "express";
import type { AppContainer } from "../../container";
import { createControllers } from "../controllers";
import { createAnalyticsRoutes } from "./analytics.routes";
import { createBacktestRoutes } from "./backtest.routes";
import { createCandleRoutes } from "./candle.routes";
import { createIndicatorRoutes } from "./indicator.routes";
import { createPredictionRoutes } from "./prediction.routes";
import { createSettingsRoutes } from "./settings.routes";
import { createStrategyRoutes } from "./strategy.routes";
import { createTradeRoutes } from "./trade.routes";
import { createWalletRoutes } from "./wallet.routes";

export function createApiRouter(container: AppContainer): Router {
  const controllers = createControllers(container);
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      success: true,
      data: {
        status: "ok",
        uptimeSeconds: Math.round(process.uptime()),
        paperTradingOnly: true,
        timestamp: new Date().toISOString(),
      },
    });
  });

  router.use("/wallet", createWalletRoutes(controllers.wallet));
  router.use("/candles", createCandleRoutes(controllers.candle));
  router.use("/indicators", createIndicatorRoutes(controllers.indicator));
  router.use("/trades", createTradeRoutes(controllers.trade));
  router.get("/history", controllers.trade.getHistory);
  router.get("/logs", controllers.trade.getLogs);
  router.use("/prediction", createPredictionRoutes(controllers.prediction));
  router.use("/", createAnalyticsRoutes(controllers.analytics));
  router.use("/strategy", createStrategyRoutes(controllers.strategy));
  router.use("/backtest", createBacktestRoutes(controllers.backtest));
  router.use("/settings", createSettingsRoutes(controllers.settings));

  return router;
}
