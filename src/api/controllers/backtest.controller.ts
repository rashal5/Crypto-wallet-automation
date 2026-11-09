import type { RequestHandler } from "express";
import { MAX_BACKTEST_CANDLES, SUPPORTED_INTERVALS } from "../../config/constants";
import type { BacktestParams, IBacktestService } from "../../services/backtest/backtest.service";
import type { IStrategyRegistry } from "../../services/strategy/strategy.registry";
import { asyncHandler } from "../../utils/async-handler";
import { ValidationError } from "../../utils/errors";
import {
  optionalEnum,
  optionalNumber,
  optionalString,
  parseDateValue,
} from "../../utils/validation";
import { sendData } from "../response";

function asObject(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export class BacktestController {
  constructor(
    private readonly backtestService: IBacktestService,
    private readonly strategyRegistry: IStrategyRegistry,
  ) {}

  runBacktest: RequestHandler = asyncHandler(async (req, res) => {
    const body = asObject(req.body);

    const strategyName = optionalString(body.strategyName, "strategyName", 100);
    if (strategyName && !this.strategyRegistry.has(strategyName)) {
      throw new ValidationError(`Unknown strategy "${strategyName}"`, {
        available: this.strategyRegistry.list(),
      });
    }

    const from = parseDateValue(body.from, "from");
    const to = parseDateValue(body.to, "to");
    if (from && to && from.getTime() > to.getTime()) {
      throw new ValidationError("from must be before or equal to to");
    }

    const params: BacktestParams = {
      symbol: optionalString(body.symbol, "symbol", 30)?.toUpperCase(),
      interval: optionalEnum(body.interval, SUPPORTED_INTERVALS, "interval"),
      from,
      to,
      limit: optionalNumber(body.limit, "limit", {
        min: 2,
        max: MAX_BACKTEST_CANDLES,
        integer: true,
      }),
      strategyName,
      initialBalance: optionalNumber(body.initialBalance, "initialBalance", {
        min: 0.01,
        max: 1_000_000_000,
      }),
      tradeSize: optionalNumber(body.tradeSize, "tradeSize", {
        min: 0.01,
        max: 1_000_000_000,
      }),
      buyFeePercent: optionalNumber(body.buyFeePercent, "buyFeePercent", {
        min: 0,
        max: 100,
      }),
      sellFeePercent: optionalNumber(body.sellFeePercent, "sellFeePercent", {
        min: 0,
        max: 100,
      }),
      stopLossPercent: optionalNumber(body.stopLossPercent, "stopLossPercent", {
        min: 0,
        max: 100,
      }),
      takeProfitPercent: optionalNumber(body.takeProfitPercent, "takeProfitPercent", {
        min: 0,
        max: 100,
      }),
      rsiBuyThreshold: optionalNumber(body.rsiBuyThreshold, "rsiBuyThreshold", {
        min: 0,
        max: 100,
      }),
      aiConfidenceThreshold: optionalNumber(
        body.aiConfidenceThreshold,
        "aiConfidenceThreshold",
        { min: 0, max: 100 },
      ),
    };

    const report = await this.backtestService.run(params);
    sendData(res, report);
  });
}
