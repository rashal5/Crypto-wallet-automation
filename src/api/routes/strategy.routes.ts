import { Router } from "express";
import type { StrategyController } from "../controllers/strategy.controller";

export function createStrategyRoutes(controller: StrategyController): Router {
  const router = Router();
  router.get("/", controller.getStatus);
  router.get("/status", controller.getStatus);
  router.post("/start", controller.start);
  router.post("/stop", controller.stop);
  return router;
}
