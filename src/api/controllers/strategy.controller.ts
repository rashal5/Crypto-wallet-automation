import type { RequestHandler } from "express";
import type { ISchedulerService } from "../../services/scheduler/scheduler.service";
import type { ISettingsService } from "../../services/settings/settings.service";
import type { IStrategyRegistry } from "../../services/strategy/strategy.registry";
import { asyncHandler } from "../../utils/async-handler";
import { sendData } from "../response";

export class StrategyController {
  constructor(
    private readonly settingsService: ISettingsService,
    private readonly schedulerService: ISchedulerService,
    private readonly strategyRegistry: IStrategyRegistry,
  ) {}

  getStatus: RequestHandler = asyncHandler(async (_req, res) => {
    sendData(res, await this.buildStatus());
  });

  start: RequestHandler = asyncHandler(async (_req, res) => {
    await this.settingsService.setPaperTradingEnabled(true);
    this.schedulerService.start();
    const cycle = await this.schedulerService.runOnceNow("strategy-start");

    sendData(res, { ...(await this.buildStatus()), initialCycle: cycle });
  });

  stop: RequestHandler = asyncHandler(async (_req, res) => {
    await this.settingsService.setPaperTradingEnabled(false);
    this.schedulerService.stop();

    sendData(res, await this.buildStatus());
  });

  private async buildStatus(): Promise<Record<string, unknown>> {
    const settings = await this.settingsService.get();

    return {
      enabled: settings.paperTradingEnabled,
      running: this.schedulerService.isRunning(),
      symbol: settings.symbol,
      interval: settings.interval,
      strategyName: settings.strategyName,
      availableStrategies: this.strategyRegistry.list(),
      rsiBuyThreshold: settings.rsiBuyThreshold,
      aiConfidenceThreshold: settings.aiConfidenceThreshold,
      stopLossPercent: settings.stopLossPercent,
      takeProfitPercent: settings.takeProfitPercent,
      lastProcessedCandleAt: settings.lastProcessedCandleAt,
      lastCycleAt: settings.lastCycleAt,
    };
  }
}
