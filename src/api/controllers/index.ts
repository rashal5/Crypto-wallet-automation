import type { AppContainer } from "../../container";
import { AnalyticsController } from "./analytics.controller";
import { BacktestController } from "./backtest.controller";
import { CandleController } from "./candle.controller";
import { IndicatorController } from "./indicator.controller";
import { PredictionController } from "./prediction.controller";
import { SettingsController } from "./settings.controller";
import { StrategyController } from "./strategy.controller";
import { TradeController } from "./trade.controller";
import { WalletController } from "./wallet.controller";

export interface ApiControllers {
  wallet: WalletController;
  candle: CandleController;
  indicator: IndicatorController;
  trade: TradeController;
  prediction: PredictionController;
  analytics: AnalyticsController;
  strategy: StrategyController;
  backtest: BacktestController;
  settings: SettingsController;
}

export function createControllers(container: AppContainer): ApiControllers {
  const { services } = container;

  return {
    wallet: new WalletController(services.settings, services.market, services.wallet),
    candle: new CandleController(services.settings, services.market),
    indicator: new IndicatorController(services.settings, services.indicators),
    trade: new TradeController(services.settings, services.history),
    prediction: new PredictionController(services.prediction),
    analytics: new AnalyticsController(services.analytics, services.dashboard),
    strategy: new StrategyController(
      services.settings,
      services.scheduler,
      services.strategyRegistry,
    ),
    backtest: new BacktestController(services.backtest, services.strategyRegistry),
    settings: new SettingsController(
      services.settings,
      services.scheduler,
      services.strategyRegistry,
    ),
  };
}
