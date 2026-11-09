import type { RequestHandler } from "express";
import { SUPPORTED_INTERVALS } from "../../config/constants";
import type { ISchedulerService } from "../../services/scheduler/scheduler.service";
import type { ISettingsService } from "../../services/settings/settings.service";
import type { IStrategyRegistry } from "../../services/strategy/strategy.registry";
import type { SettingsUpdate } from "../../types/domain";
import { asyncHandler } from "../../utils/async-handler";
import { ValidationError } from "../../utils/errors";
import {
  optionalBoolean,
  optionalEnum,
  optionalNumber,
  optionalString,
} from "../../utils/validation";
import { sendData } from "../response";

function asObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export class SettingsController {
  constructor(
    private readonly settingsService: ISettingsService,
    private readonly schedulerService: ISchedulerService,
    private readonly strategyRegistry: IStrategyRegistry,
  ) {}

  getSettings: RequestHandler = asyncHandler(async (_req, res) => {
    const settings = await this.settingsService.get();
    sendData(res, settings, { running: this.schedulerService.isRunning() });
  });

  updateSettings: RequestHandler = asyncHandler(async (req, res) => {
    const body = asObject(req.body);

    const strategyName = optionalString(body.strategyName, "strategyName", 100);
    if (strategyName && !this.strategyRegistry.has(strategyName)) {
      throw new ValidationError(`Unknown strategy "${strategyName}"`, {
        available: this.strategyRegistry.list(),
      });
    }

    const update: SettingsUpdate = {};
    const startingBalance = optionalNumber(body.startingBalance, "startingBalance", {
      min: 0.01,
      max: 1_000_000_000,
    });
    const buyFeePercent = optionalNumber(body.buyFeePercent, "buyFeePercent", {
      min: 0,
      max: 100,
    });
    const sellFeePercent = optionalNumber(body.sellFeePercent, "sellFeePercent", {
      min: 0,
      max: 100,
    });
    const stopLossPercent = optionalNumber(body.stopLossPercent, "stopLossPercent", {
      min: 0,
      max: 100,
    });
    const takeProfitPercent = optionalNumber(body.takeProfitPercent, "takeProfitPercent", {
      min: 0,
      max: 100,
    });
    const maxTradeSize = optionalNumber(body.maxTradeSize, "maxTradeSize", {
      min: 0.01,
      max: 1_000_000_000,
    });
    const rsiBuyThreshold = optionalNumber(body.rsiBuyThreshold, "rsiBuyThreshold", {
      min: 0,
      max: 100,
    });
    const aiConfidenceThreshold = optionalNumber(
      body.aiConfidenceThreshold,
      "aiConfidenceThreshold",
      { min: 0, max: 100 },
    );
    const paperTradingEnabled = optionalBoolean(
      body.paperTradingEnabled,
      "paperTradingEnabled",
    );
    const symbol = optionalString(body.symbol, "symbol", 30)?.toUpperCase();
    const interval = optionalEnum(body.interval, SUPPORTED_INTERVALS, "interval");

    if (startingBalance !== undefined) update.startingBalance = startingBalance;
    if (buyFeePercent !== undefined) update.buyFeePercent = buyFeePercent;
    if (sellFeePercent !== undefined) update.sellFeePercent = sellFeePercent;
    if (stopLossPercent !== undefined) update.stopLossPercent = stopLossPercent;
    if (takeProfitPercent !== undefined) update.takeProfitPercent = takeProfitPercent;
    if (maxTradeSize !== undefined) update.maxTradeSize = maxTradeSize;
    if (rsiBuyThreshold !== undefined) update.rsiBuyThreshold = rsiBuyThreshold;
    if (aiConfidenceThreshold !== undefined) {
      update.aiConfidenceThreshold = aiConfidenceThreshold;
    }
    if (paperTradingEnabled !== undefined) {
      update.paperTradingEnabled = paperTradingEnabled;
    }
    if (symbol !== undefined) update.symbol = symbol;
    if (interval !== undefined) update.interval = interval;
    if (strategyName !== undefined) update.strategyName = strategyName;

    if (Object.keys(update).length === 0) {
      throw new ValidationError("No supported settings fields were provided");
    }

    const settings = await this.settingsService.update(update);

    if (settings.paperTradingEnabled) {
      this.schedulerService.start();
    } else {
      this.schedulerService.stop();
    }

    sendData(res, settings, { running: this.schedulerService.isRunning() });
  });
}
