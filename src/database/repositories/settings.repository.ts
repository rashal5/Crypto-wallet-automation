import type { SettingsModel, SettingsUpdate } from "../../types/domain";
import type { Db } from "./db";
import type { ISettingsRepository, SettingsCreateInput } from "./interfaces";

export class SettingsRepository implements ISettingsRepository {
  constructor(private readonly db: Db) {}

  async getSingleton(): Promise<SettingsModel | null> {
    return this.db.settings.findUnique({ where: { id: 1 } });
  }

  async upsertSingleton(settings: SettingsCreateInput): Promise<SettingsModel> {
    return this.db.settings.upsert({
      where: { id: 1 },
      create: { id: 1, ...settings },
      update: settings,
    });
  }

  async update(id: number, settings: SettingsUpdate): Promise<SettingsModel> {
    return this.db.settings.update({
      where: { id },
      data: settings,
    });
  }
}
