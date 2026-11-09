import type { RequestHandler } from "express";
import type { ISettingsService } from "../../services/settings/settings.service";
import type { IMarketService } from "../../services/market/market.service";
import type { IWalletService } from "../../services/wallet/wallet.service";
import { asyncHandler } from "../../utils/async-handler";
import { sendData } from "../response";

export class WalletController {
  constructor(
    private readonly settingsService: ISettingsService,
    private readonly marketService: IMarketService,
    private readonly walletService: IWalletService,
  ) {}

  getWallet: RequestHandler = asyncHandler(async (_req, res) => {
    const settings = await this.settingsService.get();
    const latestCandle = await this.marketService.getLatest(settings.symbol, settings.interval);
    const snapshot = await this.walletService.getSnapshot(latestCandle?.close);

    sendData(res, snapshot, {
      symbol: settings.symbol,
      interval: settings.interval,
      markPrice: latestCandle?.close ?? null,
    });
  });
}
