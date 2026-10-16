import { TZ_OFFSET_MINUTES } from './constants';

export const R = (n: number | string) =>
  '₹' + (+n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const shift = (d: Date) => new Date(d.getTime() + TZ_OFFSET_MINUTES * 60000);

/** YYYY-MM-DD in IST for an ISO string / Date. */
export const istDate = (d: string | Date) => shift(new Date(d)).toISOString().slice(0, 10);
export const istYear = (d: string | Date = new Date()) => shift(new Date(d)).getUTCFullYear();
/** Start (UTC instant) of the IST day containing `d`. */
export const startOfIstDay = (d: Date) => {
  const s = shift(d);
  s.setUTCHours(0, 0, 0, 0);
  return new Date(s.getTime() - TZ_OFFSET_MINUTES * 60000);
};
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
