import { ConfigurationError, NotFoundError } from "../../utils/errors";
import type { IStrategy } from "./strategy.interface";

export interface IStrategyRegistry {
  register(strategy: IStrategy): void;
  get(name: string): IStrategy;
  list(): string[];
  has(name: string): boolean;
}

export class StrategyRegistry implements IStrategyRegistry {
  private readonly strategies = new Map<string, IStrategy>();

  register(strategy: IStrategy): void {
    if (this.strategies.has(strategy.name)) {
      throw new ConfigurationError(`Strategy "${strategy.name}" is already registered`);
    }
    this.strategies.set(strategy.name, strategy);
  }

  get(name: string): IStrategy {
    const strategy = this.strategies.get(name);
    if (!strategy) {
      throw new NotFoundError(`Strategy "${name}" is not registered`, {
        available: this.list(),
      });
    }
    return strategy;
  }

  list(): string[] {
    return [...this.strategies.keys()];
  }

  has(name: string): boolean {
    return this.strategies.has(name);
  }
}
