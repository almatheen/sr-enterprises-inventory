/** Product categories: code → label. Codes are part of generated product IDs (SR-MC-00001). */
export const CATS: Record<string, string> = {
  MC: 'Mobile Covers',
  CH: 'Chargers',
  CB: 'Cables',
  AU: 'Audio',
  TO: 'Toys',
  AC: 'Accessories'
};
export const CAT_CODES = Object.keys(CATS) as [string, ...string[]];
export const GST_RATES = [0, 5, 12, 18, 28] as const;
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Credit', 'Mixed'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const ADJUST_TYPES = ['ADD', 'REMOVE', 'DAMAGE', 'RETURN', 'CORRECTION'] as const;
export const PAGE_SIZE = 50;
/** India Standard Time offset (no DST). All business days/reports are bucketed in IST. */
export const TZ_OFFSET_MINUTES = 330;
export const TZ_NAME = 'Asia/Kolkata';
