import { Router } from "express";
import type { WalletController } from "../controllers/wallet.controller";

export function createWalletRoutes(controller: WalletController): Router {
  const router = Router();
  router.get("/", controller.getWallet);
  return router;
}
