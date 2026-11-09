import type { RequestHandler } from "express";
import {
  DEFAULT_CANDLE_LIMIT,
  MAX_CANDLE_LIMIT,
  SUPPORTED_INTERVALS,
} from "../../config/constants";
import type { CandleFilter } from "../../database/repositories/interfaces";
import type { IMarketService } from "../../services/market/market.service";
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

export class CandleController {
  constructor(
    private readonly settingsService: ISettingsService,
    private readonly marketService: IMarketService,
  ) {}

  getCandles: RequestHandler = asyncHandler(async (req, res) => {
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

    const filter: CandleFilter = { symbol, interval, from, to, limit, offset, order };
    const [candles, total] = await Promise.all([
      this.marketService.getCandles(filter),
      this.marketService.countMatching({ symbol, interval, from, to }),
    ]);

    sendData(res, candles, { symbol, interval, limit, offset, order, total });
  });
}
