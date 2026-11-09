import { Router } from "express";
import type { BacktestController } from "../controllers/backtest.controller";

export function createBacktestRoutes(controller: BacktestController): Router {
  const router = Router();
  router.post("/", controller.runBacktest);
  return router;
}
