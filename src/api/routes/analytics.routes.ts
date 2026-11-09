import { Router } from "express";
import type { AnalyticsController } from "../controllers/analytics.controller";

export function createAnalyticsRoutes(controller: AnalyticsController): Router {
  const router = Router();
  router.get("/analytics", controller.getAnalytics);
  router.get("/dashboard", controller.getDashboard);
  return router;
}
