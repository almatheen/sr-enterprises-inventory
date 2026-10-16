import type { BusinessDTO, InvoiceDTO } from '@/lib/types';
import { R } from '@/lib/format';
import { istDate } from '@/lib/format';

/** Renders the approved A4 ('a4') and thermal ('th') invoice markup. Shared by screen, print and PDF. */
export function InvoiceView({ inv: i, biz: c, fmt }: { inv: InvoiceDTO; biz: BusinessDTO; fmt: 'a4' | 'th' }) {
  const date = istDate(i.date);
  const tax = i.inter ? (
    <div className="r">IGST {R(i.igst)}</div>
  ) : (
    <>
      <div className="r">CGST {R(i.cgst)}</div>
      <div className="r">SGST {R(i.sgst)}</div>
    </>
  );
  if (fmt === 'th')
    return (
      <div className="inv th">
        <center>
          <b>{c.name}</b>
          {c.tagline && <><br />{c.tagline}</>}
          {c.address && <><br />{c.address}</>}
          {c.phone && <><br />{c.phone}</>}
          {c.gstin && <><br />GSTIN: {c.gstin}</>}
        </center>
        <hr />
        {i.id}<br />{date}
        <hr />
        {i.L.map((l, k) => (
          <span key={k}>
            {l.name.slice(0, 16)} x{l.qty} <span style={{ float: 'right' }}>{R(l.amt)}</span><br />
          </span>
        ))}
        <hr />
        Subtotal <span style={{ float: 'right' }}>{R(i.sub)}</span><br />
        Discount <span style={{ float: 'right' }}>-{R(i.disc)}</span><br />
        Tax <span style={{ float: 'right' }}>{R(i.tax)}</span><br />
        <b>TOTAL <span style={{ float: 'right' }}>{R(i.gt)}</span></b>
        <hr />
        Payment: {i.pay}
        <center>Thank you!</center>
      </div>
    );
  return (
    <div className="inv">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          {c.logo && /* eslint-disable-next-line @next/next/no-img-element */ <img className="logo" src={c.logo} alt="" />}
          <h2 style={{ margin: 0 }}>{c.name}</h2>
          {c.address}
          {c.address && <br />}
          {c.phone}
          {c.phone && <br />}
          {c.email}
          {c.email && <br />}
          {c.gstin && <>GSTIN: {c.gstin}</>}
        </div>
        <div className="r">
          <b>{i.id}</b><br />
          {date}<br />
          {i.cust.name || 'Walk-in'} {i.cust.phone || ''}
          {i.cust.email && <><br />{i.cust.email}</>}
          {i.cust.gstin && <><br />GSTIN: {i.cust.gstin}</>}
          {i.cust.addr && <><br />{i.cust.addr}</>}
        </div>
      </div>
      <table style={{ margin: '14px 0' }}>
        <tbody>
          <tr><th>Item</th><th>Qty</th><th>Price</th><th>GST</th><th className="r">Amount</th></tr>
          {i.L.map((l, k) => (
            <tr key={k}><td>{l.name}</td><td>{l.qty}</td><td>{R(l.price)}</td><td>{l.gst}%</td><td className="r">{R(l.amt)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="r">Subtotal {R(i.sub)}</div>
      <div className="r">Discount -{R(i.disc)}</div>
      {tax}
      <div className="r">Round off {i.round.toFixed(2)}</div>
      <h3 className="r">Grand Total {R(i.gt)}</h3>
      <div className="r">Payment method: {i.pay}</div>
      <p>
        Thank you for shopping with {c.name}.<br />
        <small>Goods once sold are subject to store policy.</small>
      </p>
      <div className="r">Authorized Signature ______</div>
    </div>
  );
}
