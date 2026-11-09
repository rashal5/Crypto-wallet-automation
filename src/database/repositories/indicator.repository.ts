import type { IndicatorInput, IndicatorRow, IndicatorWithCandle } from "../../types/domain";
import type { Db } from "./db";
import type { IIndicatorRepository, IndicatorFilter } from "./interfaces";

export class IndicatorRepository implements IIndicatorRepository {
  constructor(private readonly db: Db) {}

  async upsertMany(indicators: IndicatorInput[]): Promise<number> {
    let persisted = 0;
    for (const indicator of indicators) {
      await this.db.indicator.upsert({
        where: { candleId: indicator.candleId },
        create: indicator,
        update: {
          ema20: indicator.ema20,
          ema50: indicator.ema50,
          ema200: indicator.ema200,
          rsi: indicator.rsi,
          macd: indicator.macd,
          macdSignal: indicator.macdSignal,
          macdHistogram: indicator.macdHistogram,
          atr: indicator.atr,
          bbUpper: indicator.bbUpper,
          bbLower: indicator.bbLower,
          volumeAverage: indicator.volumeAverage,
        },
      });
      persisted += 1;
    }
    return persisted;
  }

  async findByCandleId(candleId: number): Promise<IndicatorRow | null> {
    return this.db.indicator.findUnique({ where: { candleId } });
  }

  async findLatest(symbol: string, interval: string): Promise<IndicatorWithCandle | null> {
    return this.db.indicator.findFirst({
      where: { candle: { symbol, interval } },
      orderBy: { candle: { timestamp: "desc" } },
      include: { candle: true },
    });
  }

  async findLatestCandleTimestamp(symbol: string, interval: string): Promise<Date | null> {
    const row = await this.db.indicator.findFirst({
      where: { candle: { symbol, interval } },
      orderBy: { candle: { timestamp: "desc" } },
      select: { candle: { select: { timestamp: true } } },
    });
    return row?.candle.timestamp ?? null;
  }

  async findMany(filter: IndicatorFilter = {}): Promise<IndicatorWithCandle[]> {
    const order = filter.order ?? "desc";
    return this.db.indicator.findMany({
      where: {
        candle: {
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
      },
      orderBy: { candle: { timestamp: order } },
      take: filter.limit,
      skip: filter.offset,
      include: { candle: true },
    });
  }

  async count(filter: IndicatorFilter = {}): Promise<number> {
    return this.db.indicator.count({
      where: {
        candle: {
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
      },
    });
  }
}
