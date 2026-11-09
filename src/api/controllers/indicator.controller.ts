import type { RequestHandler } from "express";
import {
  DEFAULT_CANDLE_LIMIT,
  MAX_CANDLE_LIMIT,
  SUPPORTED_INTERVALS,
} from "../../config/constants";
import type { IndicatorFilter } from "../../database/repositories/interfaces";
import type { IIndicatorService } from "../../services/indicators/indicator.service";
import type { ISettingsService } from "../../services/settings/settings.service";
import { asyncHandler } from "../../utils/async-handler";
import {
  optionalEnum,
  optionalString,
  parseDateValue,
  parseLimit,
  parseOffset,
} from "../../utils/validation";
import { sendData } from "../response";

export class IndicatorController {
  constructor(
    private readonly settingsService: ISettingsService,
    private readonly indicatorService: IIndicatorService,
  ) {}

  getIndicators: RequestHandler = asyncHandler(async (req, res) => {
    const settings = await this.settingsService.get();

    const symbol =
      optionalString(req.query.symbol, "symbol", 30)?.toUpperCase() ?? settings.symbol;
    const interval =
      optionalEnum(req.query.interval, SUPPORTED_INTERVALS, "interval") ?? settings.interval;
    const limit = parseLimit(req.query.limit, DEFAULT_CANDLE_LIMIT, MAX_CANDLE_LIMIT);
    const offset = parseOffset(req.query.offset);
    const from = parseDateValue(req.query.from, "from");
    const to = parseDateValue(req.query.to, "to");
    const order = optionalEnum(req.query.order, ["asc", "desc"] as const, "order") ?? "desc";

    const filter: IndicatorFilter = { symbol, interval, from, to, limit, offset, order };
    const [indicators, total] = await Promise.all([
      this.indicatorService.getMany(filter),
      this.indicatorService.count({ symbol, interval, from, to }),
    ]);

    sendData(res, indicators, { symbol, interval, limit, offset, order, total });
  });
}
