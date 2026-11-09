import type {
  ITradeRepository,
  IWalletRepository,
} from "../../database/repositories/interfaces";
import { TRADE_STATUS } from "../../config/constants";
import type { OpenPosition, Trade, WalletRow } from "../../types/domain";
import { roundMoney } from "../../utils/number";
import { ConfigurationError } from "../../utils/errors";
import { createWalletState } from "../paperTrading/wallet-math";
import type { ISettingsService } from "../settings/settings.service";

export interface WalletSnapshot extends WalletRow {
  currentEquity: number;
  unrealizedPnl: number;
  openPositionCount: number;
  openPosition: OpenPosition | null;
}

export interface IWalletService {
  getWallet(): Promise<WalletRow>;
  getSnapshot(markPrice?: number): Promise<WalletSnapshot>;
}

export class WalletService implements IWalletService {
  constructor(
    private readonly walletRepository: IWalletRepository,
    private readonly tradeRepository: ITradeRepository,
    private readonly settingsService: ISettingsService,
  ) {}

  async getWallet(): Promise<WalletRow> {
    const existing = await this.walletRepository.getSingleton();
    if (existing) return existing;

    const settings = await this.settingsService.get();
    const created = await this.walletRepository.create(createWalletState(settings.startingBalance));
    return created;
  }

  /**
   * Computes mark-to-market equity without mutating stored wallet balances.
   * Stored `balance` is the cost-basis equity (available + invested), while
   * `currentEquity` reflects the latest market price when supplied.
   */
  async getSnapshot(markPrice?: number): Promise<WalletSnapshot> {
    const wallet = await this.getWallet();
    const openTrades = await this.tradeRepository.findMany({
      status: TRADE_STATUS.OPEN,
      order: "asc",
      limit: 100,
    });

    const openPosition = this.buildOpenPosition(openTrades[0], markPrice);
    const unrealizedPnl = roundMoney(
      openTrades.reduce((total, trade) => {
        const price = markPrice ?? trade.buyPrice;
        return total + trade.quantity * price - trade.investment - trade.fees;
      }, 0),
    );

    const marketValue = roundMoney(
      openTrades.reduce((total, trade) => {
        const price = markPrice ?? trade.buyPrice;
        return total + trade.quantity * price;
      }, 0),
    );

    const currentEquity = roundMoney(wallet.available + marketValue);

    return {
      ...wallet,
      currentEquity,
      unrealizedPnl,
      openPositionCount: openTrades.length,
      openPosition,
    };
  }

  private buildOpenPosition(trade: Trade | undefined, markPrice?: number): OpenPosition | null {
    if (!trade) return null;

    const price = markPrice ?? trade.buyPrice;
    const marketValue = roundMoney(trade.quantity * price);
    const costBasis = trade.investment + trade.fees;
    const unrealizedPnl = roundMoney(marketValue - costBasis);

    if (costBasis <= 0) {
      throw new ConfigurationError("Open trade has an invalid cost basis");
    }

    return {
      trade,
      markPrice: price,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPercent: roundMoney((unrealizedPnl / costBasis) * 100),
    };
  }
}
