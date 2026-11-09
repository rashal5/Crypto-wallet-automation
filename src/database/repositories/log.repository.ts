import type { LogEntry, LogLevel } from "../../types/domain";
import type { Db } from "./db";
import type { ILogRepository, LogFilter } from "./interfaces";

function mapLog(row: {
  id: number;
  time: Date;
  module: string;
  message: string;
  level: string;
}): LogEntry {
  return { ...row, level: row.level as LogLevel };
}

export class LogRepository implements ILogRepository {
  constructor(private readonly db: Db) {}

  async create(entry: Omit<LogEntry, "id">): Promise<LogEntry> {
    const row = await this.db.log.create({ data: entry });
    return mapLog(row);
  }

  async findMany(filter: LogFilter = {}): Promise<LogEntry[]> {
    const rows = await this.db.log.findMany({
      where: {
        level: filter.level,
        module: filter.module,
        time:
          filter.from || filter.to
            ? {
                gte: filter.from,
                lte: filter.to,
              }
            : undefined,
      },
      orderBy: { time: "desc" },
      take: filter.limit,
      skip: filter.offset,
    });
    return rows.map(mapLog);
  }

  async count(filter: LogFilter = {}): Promise<number> {
    return this.db.log.count({
      where: {
        level: filter.level,
        module: filter.module,
        time:
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
