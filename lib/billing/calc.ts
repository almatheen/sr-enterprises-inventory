
import { round2 } from '../format';

export interface CalcInput {
  id: string;
  name: string;
  price: number;
  gst: number;
  qty: number;
}

export interface CalcOptions {
  /** null = use each product's own GST; number = override all lines */
  gstOverride: number | null;
  discountType: 'pct' | 'amt';
  discountValue: number;
  interState: boolean;
}

export interface CalcLine extends CalcInput {
  amt: number;
  appliedGst: number;
}

export interface CalcResult {
  lines: CalcLine[];
  sub: number;
  disc: number;
  taxable: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  round: number;
  gt: number;
}

/**
 * Single source of truth for bill calculations.
 * Selling prices already include GST.
 *
 * Discounts reduce the GST-inclusive selling total.
 * GST is extracted from the discounted amount rather than
 * added on top of it.
 */
export function calculate(
  items: CalcInput[],
  o: CalcOptions
): CalcResult {
  const lines: CalcLine[] = items.map((x) => ({
    ...x,
    appliedGst:
      o.gstOverride != null ? o.gstOverride : x.gst,
    amt: round2(x.price * x.qty),
  }));

  // Total of GST-inclusive selling prices before discount.
  const sub = round2(
    lines.reduce((sum, line) => sum + line.amt, 0)
  );

  const dv = Math.max(0, Number(o.discountValue) || 0);

  const disc = round2(
    o.discountType === 'amt'
      ? Math.min(dv, sub)
      : Math.min((sub * dv) / 100, sub)
  );

  // Discounted customer amount, still inclusive of GST.
  const total = round2(Math.max(0, sub - disc));

  // Allocate the discount proportionally across lines,
  // then extract the GST included in each discounted line.
  let tax = 0;

  for (const line of lines) {
    const lineDiscount =
      sub > 0 ? (disc * line.amt) / sub : 0;

    const discountedGross = Math.max(
      0,
      line.amt - lineDiscount
    );

    const rate = Math.max(0, line.appliedGst);

    const includedTax =
      rate > 0
        ? (discountedGross * rate) / (100 + rate)
        : 0;

    tax += includedTax;
  }

  tax = round2(tax);

  // Taxable value excludes the GST included in the price.
  const taxable = round2(Math.max(0, total - tax));

  // Split the extracted tax for intra-state or inter-state sales.
  const cgst = o.interState ? 0 : round2(tax / 2);
  const sgst = o.interState ? 0 : round2(tax - cgst);
  const igst = o.interState ? tax : 0;

  // Customer pays the GST-inclusive amount, rounded to a rupee.
  const gt = Math.round(total);

  return {
    lines,
    sub,
    disc,
    taxable,
    tax,
    cgst,
    sgst,
    igst,
    total,
    round: round2(gt - total),
    gt,
  };
}
