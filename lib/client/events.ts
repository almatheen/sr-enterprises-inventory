export const STOCK_EVENT = 'sr:stock-changed';
/** Tells the shell to refresh the notification badge (low-stock count). */
export const notifyStockChanged = () => typeof window !== 'undefined' && window.dispatchEvent(new Event(STOCK_EVENT));
