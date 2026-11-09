import { roundMoney } from "../../utils/number";

export interface IFeeService {
  calculateBuyFee(notional: number, feePercent: number): number;
  calculateSellFee(grossProceeds: number, feePercent: number): number;
}

/**
 * Fees are configured as percentages (0.1 means 0.1%) to match the settings UI.
 * All amounts are quote currency (USDT).
 */
export class FeeService implements IFeeService {
  calculateBuyFee(notional: number, feePercent: number): number {
    return roundMoney(notional * (feePercent / 100));
  }

  calculateSellFee(grossProceeds: number, feePercent: number): number {
    return roundMoney(grossProceeds * (feePercent / 100));
  }
}
