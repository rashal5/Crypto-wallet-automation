import type { Db } from "./db";
import type { Repositories } from "./interfaces";
import { CandleRepository } from "./candle.repository";
import { IndicatorRepository } from "./indicator.repository";
import { TradeRepository } from "./trade.repository";
import { WalletRepository } from "./wallet.repository";
import { PredictionRepository } from "./prediction.repository";
import { LogRepository } from "./log.repository";
import { SettingsRepository } from "./settings.repository";

export function createRepositories(db: Db): Repositories {
  return {
    candle: new CandleRepository(db),
    indicator: new IndicatorRepository(db),
    trade: new TradeRepository(db),
    wallet: new WalletRepository(db),
    prediction: new PredictionRepository(db),
    log: new LogRepository(db),
    settings: new SettingsRepository(db),
  };
}

export type { Repositories } from "./interfaces";
