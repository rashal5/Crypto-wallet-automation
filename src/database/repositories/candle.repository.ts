import type { Candle, CandleInput } from "../../types/domain";
import type { CandleFilter, ICandleRepository } from "./interfaces";
import type { Db } from "./db";

export class CandleRepository implements ICandleRepository {
  constructor(private readonly db: Db) {}

  async upsert(candle: CandleInput): Promise<Candle> {
    return this.db.candle.upsert({
      where: {
        symbol_interval_timestamp: {
          symbol: candle.symbol,
          interval: candle.interval,
          timestamp: candle.timestamp,
        },
      },
      create: candle,
      update: {
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      },
    });
  }

  async upsertMany(candles: CandleInput[]): Promise<number> {
    let persisted = 0;
    for (const candle of candles) {
      await this.upsert(candle);
      persisted += 1;
    }
    return persisted;
  }

  async findLatest(symbol: string, interval: string): Promise<Candle | null> {
    return this.db.candle.findFirst({
      where: { symbol, interval },
      orderBy: { timestamp: "desc" },
    });
  }

  async findById(id: number): Promise<Candle | null> {
    return this.db.candle.findUnique({ where: { id } });
  }

  async findMany(filter: CandleFilter = {}): Promise<Candle[]> {
    const order = filter.order ?? "desc";
    return this.db.candle.findMany({
      where: {
        symbol: filter.symbol,
        interval: filter.interval,
        timestamp:
          filter.from || filter.to
            ? {
                gte: filter.from,
                lte: filter.to,
              }
            : undefined,
      },
      orderBy: { timestamp: order },
      take: filter.limit,
      skip: filter.offset,
    });
  }

  async findRecent(symbol: string, interval: string, limit: number): Promise<Candle[]> {
    const rows = await this.db.candle.findMany({
      where: { symbol, interval },
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    return rows.reverse();
  }

  async count(symbol?: string, interval?: string): Promise<number> {
    return this.db.candle.count({
      where: {
        symbol,
        interval,
      },
    });
  }

  async countMatching(filter: CandleFilter = {}): Promise<number> {
    return this.db.candle.count({
      where: {
        symbol: filter.symbol,
        interval: filter.interval,
        timestamp:
          filter.from || filter.to
            ? {
                gte: filter.from,
                lte: filter.to,
              }
            : undefined,
      },
    });
  }
}
