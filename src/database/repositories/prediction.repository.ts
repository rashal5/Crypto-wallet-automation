import type { PredictionDirection, PredictionRow } from "../../types/domain";
import type { Db } from "./db";
import type { IPredictionRepository } from "./interfaces";

function mapPrediction(row: {
  id: number;
  time: Date;
  buyProbability: number;
  sellProbability: number;
  confidence: number;
  prediction: string;
}): PredictionRow {
  return { ...row, prediction: row.prediction as PredictionDirection };
}

export class PredictionRepository implements IPredictionRepository {
  constructor(private readonly db: Db) {}

  async create(prediction: Omit<PredictionRow, "id">): Promise<PredictionRow> {
    const row = await this.db.prediction.create({
      data: {
        time: prediction.time,
        buyProbability: prediction.buyProbability,
        sellProbability: prediction.sellProbability,
        confidence: prediction.confidence,
        prediction: prediction.prediction,
      },
    });
    return mapPrediction(row);
  }

  async findLatest(): Promise<PredictionRow | null> {
    const row = await this.db.prediction.findFirst({ orderBy: { time: "desc" } });
    return row ? mapPrediction(row) : null;
  }

  async findMany(limit = 100): Promise<PredictionRow[]> {
    const rows = await this.db.prediction.findMany({
      orderBy: { time: "desc" },
      take: limit,
    });
    return rows.map(mapPrediction);
  }
}
