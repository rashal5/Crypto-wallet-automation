import { Router } from "express";
import type { TradeController } from "../controllers/trade.controller";

export function createTradeRoutes(controller: TradeController): Router {
  const router = Router();
  router.get("/", controller.getTrades);
  return router;
}
