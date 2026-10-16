'use client';

/** Renders the on-screen invoice element (same markup as print) into a PDF and downloads it. */
export async function downloadInvoicePdf(el: HTMLElement, fmt: 'a4' | 'th', name: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const img = canvas.toDataURL('image/png');
  if (fmt === 'th') {
    const w = 80, m = 4;
    const cw = w - m * 2;
    const ch = (canvas.height * cw) / canvas.width;
    const pdf = new jsPDF({ unit: 'mm', format: [w, ch + m * 2] });
    pdf.addImage(img, 'PNG', m, m, cw, ch);
    pdf.save(name + '.pdf');
    return;
  }
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const m = 10, cw = 210 - m * 2, pageH = 297 - m * 2;
  const ch = (canvas.height * cw) / canvas.width;
  let y = 0;
  do {
    if (y > 0) pdf.addPage();
    pdf.addImage(img, 'PNG', m, m - y, cw, ch);
    y += pageH;
  } while (y < ch);
  pdf.save(name + '.pdf');
}

export function printInvoice(fmt: 'a4' | 'th') {
  const st = document.createElement('style');
  st.textContent = fmt === 'th' ? '@page{size:80mm auto;margin:0}' : '@page{size:A4;margin:12mm}';
  document.head.append(st);
  const done = () => { st.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}
