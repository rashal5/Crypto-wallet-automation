import type { Trade, TradeCloseInput, TradeInput, TradeStatus } from "../../types/domain";
import type { Db } from "./db";
import type { ITradeRepository, TradeFilter } from "./interfaces";

function mapTrade(row: {
  id: number;
  symbol: string;
  buyPrice: number;
  sellPrice: number | null;
  quantity: number;
  investment: number;
  profit: number | null;
  fees: number;
  netProfit: number | null;
  buyTime: Date;
  sellTime: Date | null;
  status: string;
  reason: string | null;
}): Trade {
  return { ...row, status: row.status as TradeStatus };
}

export class TradeRepository implements ITradeRepository {
  constructor(private readonly db: Db) {}

  async create(input: TradeInput): Promise<Trade> {
    const row = await this.db.trade.create({
      data: {
        symbol: input.symbol,
        buyPrice: input.buyPrice,
        quantity: input.quantity,
        investment: input.investment,
        fees: input.fees,
        buyTime: input.buyTime,
        status: input.status,
        reason: input.reason ?? null,
      },
    });
    return mapTrade(row);
  }

  async close(id: number, input: TradeCloseInput): Promise<Trade> {
    const row = await this.db.trade.update({
      where: { id },
      data: {
        sellPrice: input.sellPrice,
        sellTime: input.sellTime,
        profit: input.profit,
        fees: input.fees,
        netProfit: input.netProfit,
        status: input.status,
        reason: input.reason,
      },
    });
    return mapTrade(row);
  }

  async findById(id: number): Promise<Trade | null> {
    const row = await this.db.trade.findUnique({ where: { id } });
    return row ? mapTrade(row) : null;
  }

  async findOpen(symbol?: string): Promise<Trade | null> {
    const row = await this.db.trade.findFirst({
      where: { status: "OPEN", symbol },
      orderBy: { buyTime: "desc" },
    });
    return row ? mapTrade(row) : null;
  }

  async findMany(filter: TradeFilter = {}): Promise<Trade[]> {
    const order = filter.order ?? "desc";
    const dateField = filter.dateField ?? (filter.status === "CLOSED" ? "sellTime" : "buyTime");
    const rows = await this.db.trade.findMany({
      where: {
        symbol: filter.symbol,
        status: filter.status,
        [dateField]:
          filter.from || filter.to
            ? {
                gte: filter.from,
                lte: filter.to,
              }
            : undefined,
      },
      orderBy: { [dateField]: order },
      take: filter.limit,
      skip: filter.offset,
    });
    return rows.map(mapTrade);
  }

  async findClosed(filter: Omit<TradeFilter, "status"> = {}): Promise<Trade[]> {
    return this.findMany({ ...filter, status: "CLOSED", dateField: filter.dateField ?? "sellTime" });
  }

  async count(filter: TradeFilter = {}): Promise<number> {
    const dateField = filter.dateField ?? (filter.status === "CLOSED" ? "sellTime" : "buyTime");
    return this.db.trade.count({
      where: {
        symbol: filter.symbol,
        status: filter.status,
        [dateField]:
          filter.from || filter.to
            ? {
                gte: filter.from,
                lte: filter.to,
              }
            : undefined,
      },
    });
  }

  async sumNetProfit(from: Date, to?: Date): Promise<number> {
    const result = await this.db.trade.aggregate({
      where: {
        status: "CLOSED",
        sellTime: {
          gte: from,
          lte: to,
        },
      },
      _sum: { netProfit: true },
    });
    return result._sum.netProfit ?? 0;
  }
}
