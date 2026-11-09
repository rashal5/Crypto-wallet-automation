import type { RequestHandler } from "express";
import {
  DEFAULT_CANDLE_LIMIT,
  LOG_LEVELS,
  MAX_HISTORY_LIMIT,
  TRADE_STATUS,
} from "../../config/constants";
import type { LogFilter, TradeFilter } from "../../database/repositories/interfaces";
import type { IHistoryService } from "../../services/history/history.service";
import type { ISettingsService } from "../../services/settings/settings.service";
import type { TradeStatus } from "../../types/domain";
import { asyncHandler } from "../../utils/async-handler";
import {
  optionalEnum,
  optionalString,
  parseDateValue,
  parseLimit,
  parseOffset,
} from "../../utils/validation";
import { sendData } from "../response";

export class TradeController {
  constructor(
    private readonly settingsService: ISettingsService,
    private readonly historyService: IHistoryService,
  ) {}

  getTrades: RequestHandler = asyncHandler(async (req, res) => {
    const settings = await this.settingsService.get();
    const symbol =
      optionalString(req.query.symbol, "symbol", 30)?.toUpperCase() ?? settings.symbol;
    const status = optionalEnum(
      req.query.status,
      [TRADE_STATUS.OPEN, TRADE_STATUS.CLOSED] as const,
      "status",
    );
    const limit = parseLimit(req.query.limit, DEFAULT_CANDLE_LIMIT, MAX_HISTORY_LIMIT);
    const offset = parseOffset(req.query.offset);
    const from = parseDateValue(req.query.from, "from");
    const to = parseDateValue(req.query.to, "to");
    const order = optionalEnum(req.query.order, ["asc", "desc"] as const, "order") ?? "desc";

    const filter: TradeFilter = {
      symbol,
      status,
      from,
      to,
      dateField: "buyTime",
      limit,
      offset,
      order,
    };

    const result = await this.historyService.getTrades(filter);

    sendData(res, result.items, { limit, offset, total: result.total, order });
  });

  getHistory: RequestHandler = asyncHandler(async (req, res) => {
    const settings = await this.settingsService.get();
    const symbol =
      optionalString(req.query.symbol, "symbol", 30)?.toUpperCase() ?? settings.symbol;
    const status: TradeStatus =
      optionalEnum(
        req.query.status,
        [TRADE_STATUS.OPEN, TRADE_STATUS.CLOSED] as const,
        "status",
      ) ?? TRADE_STATUS.CLOSED;
    const limit = parseLimit(req.query.limit, DEFAULT_CANDLE_LIMIT, MAX_HISTORY_LIMIT);
    const offset = parseOffset(req.query.offset);
    const from = parseDateValue(req.query.from, "from");
    const to = parseDateValue(req.query.to, "to");
    const order = optionalEnum(req.query.order, ["asc", "desc"] as const, "order") ?? "desc";

    const result = await this.historyService.getTrades({
      symbol,
      status,
      from,
      to,
      dateField: status === TRADE_STATUS.OPEN ? "buyTime" : "sellTime",
      limit,
      offset,
      order,
    });

    sendData(
      res,
      { trades: result.items, equityCurve: result.equityCurve },
      { limit, offset, total: result.total, order, status },
    );
  });

  getLogs: RequestHandler = asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, DEFAULT_CANDLE_LIMIT, MAX_HISTORY_LIMIT);
    const offset = parseOffset(req.query.offset);
    const level = optionalEnum(req.query.level, LOG_LEVELS, "level");
    const module = optionalString(req.query.module, "module", 100);
    const from = parseDateValue(req.query.from, "from");
    const to = parseDateValue(req.query.to, "to");

    const filter: LogFilter = { level, module, from, to, limit, offset };
    const result = await this.historyService.getLogs(filter);

    sendData(res, result.items, { limit, offset, total: result.total });
  });
}
