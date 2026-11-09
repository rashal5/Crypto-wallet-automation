import { MODULES } from "../../config/constants";
import type { Candle, PredictionRow } from "../../types/domain";
import { toErrorMessage } from "../../utils/errors";
import type { ILogger } from "../../utils/logger";
import { formatDuration } from "../../utils/time";
import type { IIndicatorService } from "../indicators/indicator.service";
import type { IMarketService } from "../market/market.service";
import type {
  IPaperTradingEngine,
  TradeActionResult,
} from "../paperTrading/paper-trading.engine";
import type { IPredictionService } from "../prediction/prediction.service";
import type { ISettingsService } from "../settings/settings.service";

export type CycleStatus = "PROCESSED" | "SKIPPED" | "DISABLED" | "NO_DATA" | "ERROR";

export interface CycleResult {
  status: CycleStatus;
  reason: string;
  candle: Candle | null;
  prediction: PredictionRow | null;
  trade: TradeActionResult | null;
  durationMs: number;
}

export interface ITradingCycleService {
  runOnce(trigger?: string): Promise<CycleResult>;
}

/**
 * One complete minute of the paper-trading pipeline:
 * fetch candle -> indicators -> AI prediction -> strategy -> simulated trade -> wallet.
 */
export class TradingCycleService implements ITradingCycleService {
  constructor(
    private readonly settingsService: ISettingsService,
    private readonly marketService: IMarketService,
    private readonly indicatorService: IIndicatorService,
    private readonly predictionService: IPredictionService,
    private readonly tradingEngine: IPaperTradingEngine,
    private readonly logger: ILogger,
  ) {}

  async runOnce(trigger = "scheduler"): Promise<CycleResult> {
    const startedAt = Date.now();
    const settings = await this.settingsService.get();

    if (!settings.paperTradingEnabled) {
      return {
        status: "DISABLED",
        reason: "Paper trading is disabled",
        candle: null,
        prediction: null,
        trade: null,
        durationMs: Date.now() - startedAt,
      };
    }

    try {
      const latest = await this.marketService.syncLatest(settings.symbol, settings.interval);

      if (!latest) {
        await this.settingsService.markCycle();
        this.logger.warn(MODULES.SCHEDULER, "Cycle skipped: no market data", { trigger });
        return {
          status: "NO_DATA",
          reason: "No latest candle available",
          candle: null,
          prediction: null,
          trade: null,
          durationMs: Date.now() - startedAt,
        };
      }

      // Idempotency: a closed candle is processed exactly once, even across restarts.
      if (
        settings.lastProcessedCandleAt &&
        latest.timestamp.getTime() <= settings.lastProcessedCandleAt.getTime()
      ) {
        await this.settingsService.markCycle();
        this.logger.debug(MODULES.SCHEDULER, "Cycle skipped: candle already processed", {
          trigger,
          candle: latest.timestamp,
        });
        return {
          status: "SKIPPED",
          reason: "Latest candle has already been processed",
          candle: latest,
          prediction: null,
          trade: null,
          durationMs: Date.now() - startedAt,
        };
      }

      const snapshot = await this.indicatorService.syncRecent(settings.symbol, settings.interval);

      if (!snapshot) {
        await this.settingsService.markCycle();
        this.logger.warn(MODULES.SCHEDULER, "Cycle skipped: indicators unavailable", {
          trigger,
          candle: latest.timestamp,
        });
        return {
          status: "NO_DATA",
          reason: "Not enough candles to calculate indicators",
          candle: latest,
          prediction: null,
          trade: null,
          durationMs: Date.now() - startedAt,
        };
      }

      const prediction = await this.predictionService.generate(
        snapshot.candle,
        snapshot.indicators,
      );

      const trade = await this.tradingEngine.process({
        candle: snapshot.candle,
        indicators: snapshot.indicators,
        prediction,
        settings,
      });

      await this.settingsService.markProcessedCandle(snapshot.candle.timestamp);

      const durationMs = Date.now() - startedAt;
      this.logger.info(MODULES.SCHEDULER, "Trading cycle completed", {
        trigger,
        candle: snapshot.candle.timestamp,
        close: snapshot.candle.close,
        prediction: prediction.prediction,
        confidence: prediction.confidence,
        action: trade.action,
        reason: trade.reason,
        duration: formatDuration(durationMs),
      });

      return {
        status: "PROCESSED",
        reason: trade.reason,
        candle: snapshot.candle,
        prediction,
        trade,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.error(MODULES.SCHEDULER, `Trading cycle failed (${trigger})`, error, {
        duration: formatDuration(durationMs),
      });

      return {
        status: "ERROR",
        reason: toErrorMessage(error),
        candle: null,
        prediction: null,
        trade: null,
        durationMs,
      };
    }
  }
}
