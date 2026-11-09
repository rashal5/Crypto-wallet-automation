import type { WalletRow, WalletState } from "../../types/domain";
import type { Db } from "./db";
import type { IWalletRepository } from "./interfaces";

export class WalletRepository implements IWalletRepository {
  constructor(private readonly db: Db) {}

  async getSingleton(): Promise<WalletRow | null> {
    return this.db.wallet.findUnique({ where: { id: 1 } });
  }

  async create(state: WalletState): Promise<WalletRow> {
    return this.db.wallet.create({
      data: { id: 1, ...state },
    });
  }

  async update(id: number, state: Partial<WalletState>): Promise<WalletRow> {
    return this.db.wallet.update({
      where: { id },
      data: state,
    });
  }

  async upsertSingleton(state: WalletState): Promise<WalletRow> {
    return this.db.wallet.upsert({
      where: { id: 1 },
      create: { id: 1, ...state },
      update: state,
    });
  }
}
