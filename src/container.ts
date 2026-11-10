import { config, type AppConfig } from "./config";
import { MODULES } from "./config/constants";
import { prisma } from "./database/prisma";
import { UnitOfWork } from "./database/unit-of-work";
import { AnalyticsService } from "./services/analytics/analytics.service";
import { BacktestService } from "./services/backtest/backtest.service";
import { DashboardService } from "./services/dashboard/dashboard.service";
import { HistoryService } from "./services/history/history.service";
import { IndicatorService } from "./services/indicators/indicator.service";
import { CoinbaseClient } from "./services/market/coinbase.client";
import { MarketService } from "./services/market/market.service";
import { FeeService } from "./services/paperTrading/fee.service";
import { PaperTradingEngine } from "./services/paperTrading/paper-trading.engine";
import { FeatureService } from "./services/prediction/feature.service";
import { HeuristicPredictionProvider } from "./services/prediction/heuristic.predictor";
import { PredictionService } from "./services/prediction/prediction.service";
import { PythonPredictionProvider } from "./services/prediction/python.client";
import { SchedulerService } from "./services/scheduler/scheduler.service";
import { TradingCycleService } from "./services/scheduler/trading-cycle.service";
import { SettingsService } from "./services/settings/settings.service";
import { RsiEmaAiStrategy } from "./services/strategy/rsi-ema-ai.strategy";
import { StrategyRegistry } from "./services/strategy/strategy.registry";
import { WalletService } from "./services/wallet/wallet.service";
import { AxiosHttpClient } from "./utils/http-client";
import { Logger } from "./utils/logger";

export interface AppServices {
  settings: SettingsService;
  wallet: WalletService;
  market: MarketService;
  indicators: IndicatorService;
  prediction: PredictionService;
  strategyRegistry: StrategyRegistry;
  fee: FeeService;
  paperTrading: PaperTradingEngine;
  analytics: AnalyticsService;
  history: HistoryService;
  dashboard: DashboardService;
  backtest: BacktestService;
  cycle: TradingCycleService;
  scheduler: SchedulerService;
}

export interface AppContainer {
  config: AppConfig;
  prisma: typeof prisma;
  unitOfWork: UnitOfWork;
  logger: Logger;
  services: AppServices;
}

/**
 * Composition root. Every dependency is constructed explicitly here, which keeps
 * services free of global state and makes the paper-trading engine easy to test
 * with fakes.
 */
export function createContainer(): AppContainer {
  const unitOfWork = new UnitOfWork(prisma);
  const logger = new Logger(unitOfWork.repos.log, config.logging.level);

  const settingsService = new SettingsService(unitOfWork.repos.settings, config, logger);
  const walletService = new WalletService(
    unitOfWork.repos.wallet,
    unitOfWork.repos.trade,
    settingsService,
  );

  const httpClient = new AxiosHttpClient({
    baseURL: config.coinbase.baseUrl,
    timeoutMs: config.coinbase.timeoutMs,
    retries: config.coinbase.retries,
    onRetry: (message) => logger.warn(MODULES.MARKET, message),
  });

  const coinbaseClient = new CoinbaseClient(httpClient, config, logger);
  const marketService = new MarketService(coinbaseClient, unitOfWork.repos.candle, config, logger);
  const indicatorService = new IndicatorService(
    unitOfWork.repos.candle,
    unitOfWork.repos.indicator,
    config,
    logger,
  );

  const featureService = new FeatureService();
  const pythonProvider = new PythonPredictionProvider(config, logger);
  const heuristicProvider = new HeuristicPredictionProvider();
  const predictionService = new PredictionService(
    unitOfWork.repos.candle,
    unitOfWork.repos.prediction,
    featureService,
    pythonProvider,
    heuristicProvider,
    logger,
  );

  const strategyRegistry = new StrategyRegistry();
  strategyRegistry.register(new RsiEmaAiStrategy());

  const feeService = new FeeService();
  const paperTradingEngine = new PaperTradingEngine(
    unitOfWork,
    feeService,
    strategyRegistry,
    logger,
  );

  const analyticsService = new AnalyticsService(
    unitOfWork.repos.trade,
    unitOfWork.repos.candle,
    walletService,
    settingsService,
  );

  const historyService = new HistoryService(
    unitOfWork.repos.trade,
    unitOfWork.repos.log,
    settingsService,
  );

  const dashboardService = new DashboardService(
    settingsService,
    marketService,
    indicatorService,
    predictionService,
    walletService,
    unitOfWork.repos.trade,
  );

  const backtestService = new BacktestService(
    unitOfWork.repos.indicator,
    featureService,
    heuristicProvider,
    strategyRegistry,
    feeService,
    settingsService,
    logger,
  );

  const cycleService = new TradingCycleService(
    settingsService,
    marketService,
    indicatorService,
    predictionService,
    paperTradingEngine,
    logger,
  );

  const schedulerService = new SchedulerService(cycleService, config, logger);

  return {
    config,
    prisma,
    unitOfWork,
    logger,
    services: {
      settings: settingsService,
      wallet: walletService,
      market: marketService,
      indicators: indicatorService,
      prediction: predictionService,
      strategyRegistry,
      fee: feeService,
      paperTrading: paperTradingEngine,
      analytics: analyticsService,
      history: historyService,
      dashboard: dashboardService,
      backtest: backtestService,
      cycle: cycleService,
      scheduler: schedulerService,
    },
  };
}
