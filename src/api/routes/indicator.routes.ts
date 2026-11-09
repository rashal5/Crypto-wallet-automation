import { Router } from "express";
import type { IndicatorController } from "../controllers/indicator.controller";

export function createIndicatorRoutes(controller: IndicatorController): Router {
  const router = Router();
  router.get("/", controller.getIndicators);
  return router;
}
