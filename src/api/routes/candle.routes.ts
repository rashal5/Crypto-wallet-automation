import { Router } from "express";
import type { CandleController } from "../controllers/candle.controller";

export function createCandleRoutes(controller: CandleController): Router {
  const router = Router();
  router.get("/", controller.getCandles);
  return router;
}
