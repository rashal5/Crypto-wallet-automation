import { Router } from "express";
import type { SettingsController } from "../controllers/settings.controller";

export function createSettingsRoutes(controller: SettingsController): Router {
  const router = Router();
  router.get("/", controller.getSettings);
  router.put("/", controller.updateSettings);
  return router;
}
