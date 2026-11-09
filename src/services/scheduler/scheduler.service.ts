import cron, { type ScheduledTask } from "node-cron";
import type { AppConfig } from "../../config";
import { MODULES } from "../../config/constants";
import { ConfigurationError } from "../../utils/errors";
import type { ILogger } from "../../utils/logger";
import { formatDuration } from "../../utils/time";
import type { CycleResult, ITradingCycleService } from "./trading-cycle.service";

export interface ISchedulerService {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  runOnceNow(trigger: string): Promise<CycleResult | null>;
}

/**
 * Runs the trading cycle every minute (configurable). A simple in-process lock
 * prevents overlapping cycles if a market/AI call takes longer than the interval.
 */
export class SchedulerService implements ISchedulerService {
  private task: ScheduledTask | null = null;
  private running = false;

  constructor(
    private readonly cycleService: ITradingCycleService,
    private readonly config: AppConfig,
    private readonly logger: ILogger,
  ) {}

  start(): void {
    if (this.task) return;

    const expression = this.config.scheduler.cronExpression;
    if (!cron.validate(expression)) {
      throw new ConfigurationError(`Invalid CRON_EXPRESSION: ${expression}`);
    }

    this.task = cron.schedule(
      expression,
      () => {
        void this.runScheduledCycle();
      },
      { timezone: "UTC" },
    );

    this.logger.info(MODULES.SCHEDULER, "Scheduler started", {
      cron: expression,
      timezone: "UTC",
    });
  }

  stop(): void {
    if (!this.task) return;
    this.task.stop();
    this.task = null;
    this.logger.info(MODULES.SCHEDULER, "Scheduler stopped");
  }

  isRunning(): boolean {
    return this.task !== null;
  }

  /**
   * Public manual execution used by POST /strategy/start. Returns null when a
   * cycle is already in progress.
   */
  async runOnceNow(trigger: string): Promise<CycleResult | null> {
    if (this.running) {
      this.logger.warn(MODULES.SCHEDULER, "Cycle already running; manual run skipped", { trigger });
      return null;
    }

    this.running = true;
    const startedAt = Date.now();
    try {
      return await this.cycleService.runOnce(trigger);
    } finally {
      this.running = false;
      this.logger.debug(MODULES.SCHEDULER, "Cycle lock released", {
        trigger,
        duration: formatDuration(Date.now() - startedAt),
      });
    }
  }

  private async runScheduledCycle(): Promise<void> {
    try {
      await this.runOnceNow("scheduler");
    } catch (error) {
      this.logger.error(MODULES.SCHEDULER, "Unhandled scheduler error", error);
    }
  }
}
