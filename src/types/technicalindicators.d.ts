// Minimal ambient typings for `technicalindicators` (the package does not ship
// its own types and no DefinitelyTyped package is published as of this build).
declare module "technicalindicators" {
  export interface IndicatorInput {
    period: number;
    values: number[];
    format?: (value: number) => number;
  }

  export interface MacdInput {
    values: number[];
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
    SimpleMAOscillator?: boolean;
    SimpleMASignal?: boolean;
    format?: (value: number) => number;
  }

  export interface MacdOutput {
    MACD?: number;
    signal?: number;
    histogram?: number;
  }

  export interface AtrInput {
    period: number;
    high: number[];
    low: number[];
    close: number[];
    format?: (value: number) => number;
  }

  export interface BollingerBandsInput {
    period: number;
    stdDev: number;
    values: number[];
    format?: (value: number) => number;
  }

  export interface BollingerBandsOutput {
    upper: number;
    middle: number;
    lower: number;
    pb?: number;
  }

  export const EMA: { calculate(input: IndicatorInput): number[] };
  export const SMA: { calculate(input: IndicatorInput): number[] };
  export const RSI: { calculate(input: IndicatorInput): number[] };
  export const ATR: { calculate(input: AtrInput): number[] };
  export const MACD: { calculate(input: MacdInput): MacdOutput[] };
  export const BollingerBands: { calculate(input: BollingerBandsInput): BollingerBandsOutput[] };
}
