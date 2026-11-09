import { Router } from "express";
import type { PredictionController } from "../controllers/prediction.controller";

export function createPredictionRoutes(controller: PredictionController): Router {
  const router = Router();
  router.get("/", controller.getLatest);
  router.get("/history", controller.getHistory);
  return router;
}
