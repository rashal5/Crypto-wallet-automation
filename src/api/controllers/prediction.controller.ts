import type { RequestHandler } from "express";
import { DEFAULT_CANDLE_LIMIT, MAX_HISTORY_LIMIT } from "../../config/constants";
import type { IPredictionService } from "../../services/prediction/prediction.service";
import { asyncHandler } from "../../utils/async-handler";
import { parseLimit } from "../../utils/validation";
import { sendData } from "../response";

export class PredictionController {
  constructor(private readonly predictionService: IPredictionService) {}

  getLatest: RequestHandler = asyncHandler(async (_req, res) => {
    const prediction = await this.predictionService.getLatest();
    sendData(res, prediction);
  });

  getHistory: RequestHandler = asyncHandler(async (req, res) => {
    const limit = parseLimit(req.query.limit, DEFAULT_CANDLE_LIMIT, MAX_HISTORY_LIMIT);
    const predictions = await this.predictionService.getHistory(limit);
    sendData(res, predictions, { limit, count: predictions.length });
  });
}
