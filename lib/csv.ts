export function toCsv(head: string[], rows: (string | number)[][]) {
  // Prefix formula-looking cells to prevent spreadsheet formula injection.
  const cell = (x: string | number) => {
    let s = String(x ?? '');
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\n');
}
export const csvResponse = (body: string, name: string) =>
  new Response(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` } });
