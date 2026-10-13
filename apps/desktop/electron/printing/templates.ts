/**
 * Shared print document templates.
 * Rendered in a hidden BrowserWindow and printed via webContents.print().
 * Templates must work on A4, 80mm and 58mm paper via CSS print media.
 */

export interface InvoiceTemplateData {
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  hotel: {
    name: string;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
    pan?: string | null;
  };
  guestName?: string | null;
  guestMobile?: string | null;
  roomNumber?: string | null;
  items: Array<{
    description: string;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    lineTotal: string;
  }>;
  subtotal: string;
  discountAmount: string;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalTax: string;
  roundingAmount: string;
  grandTotal: string;
  paidAmount: string;
  dueAmount: string;
  payments?: Array<{ paymentNumber: string; method: string; amount: string }>;
  terms?: string | null;
  receiptFooter?: string | null;
}

export interface KotTemplateData {
  kotNumber: string;
  orderNumber: string;
  tableName?: string | null;
  roomNumber?: string | null;
  orderType: string;
  createdAt: string;
  hotelName: string;
  items: Array<{ name: string; quantity: string; notes?: string | null }>;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

export function renderInvoiceHtml(data: InvoiceTemplateData, format: 'A4' | 'THERMAL_80' | 'THERMAL_58'): string {
  const thermal = format !== 'A4';
  const width = format === 'THERMAL_58' ? '58mm' : '80mm';
  const rows = data.items
    .map(
      (i, idx) => `
      <tr>
        <td class="num">${idx + 1}</td>
        <td>${esc(i.description)}</td>
        <td class="num">${esc(i.quantity)}</td>
        <td class="num">${formatMoney(i.unitPrice)}</td>
        <td class="num">${formatMoney(i.discountAmount)}</td>
        <td class="num">${formatMoney(i.lineTotal)}</td>
      </tr>`,
    )
    .join('');

  const paymentRows = (data.payments ?? [])
    .map(
      (p) => `
      <tr>
        <td colspan="5">${esc(p.method)}${p.paymentNumber ? ` (${esc(p.paymentNumber)})` : ''}</td>
        <td class="num">${formatMoney(p.amount)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(data.invoiceNumber)}</title>
<style>
  @page { size: ${thermal ? `${width} auto` : 'A4'}; margin: ${thermal ? '4mm' : '12mm'}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', 'Arial', sans-serif;
    font-size: ${thermal ? '10px' : '12px'};
    color: #111;
    width: ${thermal ? width : 'auto'};
  }
  .doc { padding: ${thermal ? '0' : '8px'}; }
  .header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
  .header h1 { font-size: ${thermal ? '14px' : '22px'}; letter-spacing: 1px; }
  .header p { font-size: ${thermal ? '9px' : '11px'}; color: #333; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: ${thermal ? '9px' : '11px'}; }
  .meta div { line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th, td { border: 1px solid #444; padding: ${thermal ? '3px 4px' : '6px 8px'}; text-align: left; font-size: ${thermal ? '9px' : '11px'}; }
  th { background: #eee; }
  td.num, th.num { text-align: right; }
  .totals { margin-left: auto; width: ${thermal ? '100%' : '55%'}; }
  .totals td { border: none; padding: 2px 4px; }
  .totals .grand td { border-top: 2px solid #111; font-weight: bold; font-size: ${thermal ? '11px' : '13px'}; }
  .due td { color: #a33b2b; font-weight: bold; }
  .footer { margin-top: 10px; text-align: center; font-size: ${thermal ? '9px' : '10px'}; color: #333; }
  .terms { margin-top: 8px; font-size: ${thermal ? '8px' : '10px'}; color: #555; white-space: pre-wrap; }
  .badge { display: inline-block; border: 1px solid #111; padding: 1px 8px; text-transform: uppercase; font-size: 9px; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
<div class="doc">
  <div class="header">
    <h1>${esc(data.hotel.name.toUpperCase())}</h1>
    <p>${esc([data.hotel.address, data.hotel.city, data.hotel.state].filter(Boolean).join(', '))}</p>
    <p>${esc(data.hotel.phone ?? '')}${data.hotel.phone && data.hotel.email ? ' · ' : ''}${esc(data.hotel.email ?? '')}</p>
    ${data.hotel.gstin ? `<p>GSTIN: ${esc(data.hotel.gstin)}</p>` : ''}
  </div>

  <div class="meta">
    <div>
      <strong>Invoice:</strong> ${esc(data.invoiceNumber)}<br/>
      <strong>Date:</strong> ${esc(new Date(data.invoiceDate).toLocaleString('en-IN'))}<br/>
      ${data.roomNumber ? `<strong>Room:</strong> ${esc(data.roomNumber)}<br/>` : ''}
    </div>
    <div style="text-align:right">
      <span class="badge">${esc(data.status.replace(/_/g, ' '))}</span><br/>
      <strong>Guest:</strong> ${esc(data.guestName ?? 'Walk-in')}<br/>
      ${data.guestMobile ? `<strong>Mobile:</strong> ${esc(data.guestMobile)}` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th class="num" style="width:5%">#</th>
        <th>Description</th>
        <th class="num" style="width:10%">Qty</th>
        <th class="num" style="width:14%">Rate</th>
        <th class="num" style="width:13%">Disc.</th>
        <th class="num" style="width:15%">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      ${paymentRows}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td class="num">${formatMoney(data.subtotal)}</td></tr>
    <tr><td>Discount</td><td class="num">− ${formatMoney(data.discountAmount)}</td></tr>
    <tr><td>Taxable Amount</td><td class="num">${formatMoney(data.taxableAmount)}</td></tr>
    ${Number(data.cgstAmount) > 0 ? `<tr><td>CGST</td><td class="num">${formatMoney(data.cgstAmount)}</td></tr>` : ''}
    ${Number(data.sgstAmount) > 0 ? `<tr><td>SGST</td><td class="num">${formatMoney(data.sgstAmount)}</td></tr>` : ''}
    ${Number(data.igstAmount) > 0 ? `<tr><td>IGST</td><td class="num">${formatMoney(data.igstAmount)}</td></tr>` : ''}
    <tr><td>Total Tax</td><td class="num">${formatMoney(data.totalTax)}</td></tr>
    ${Number(data.roundingAmount) !== 0 ? `<tr><td>Rounding</td><td class="num">${formatMoney(data.roundingAmount)}</td></tr>` : ''}
    <tr class="grand"><td>Grand Total</td><td class="num">₹ ${formatMoney(data.grandTotal)}</td></tr>
    <tr><td>Paid</td><td class="num">${formatMoney(data.paidAmount)}</td></tr>
    <tr class="${Number(data.dueAmount) > 0 ? 'due' : ''}"><td>Due</td><td class="num">${formatMoney(data.dueAmount)}</td></tr>
  </table>

  ${data.terms ? `<div class="terms">${esc(data.terms)}</div>` : ''}
  <div class="footer">${esc(data.receiptFooter ?? 'Thank you for your stay!')}</div>
</div>
</body>
</html>`;
}

export function renderKotHtml(data: KotTemplateData): string {
  const rows = data.items
    .map(
      (i) => `
      <tr>
        <td class="qty">${esc(i.quantity)}</td>
        <td>${esc(i.name)}${i.notes ? `<div class="notes">↳ ${esc(i.notes)}</div>` : ''}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(data.kotNumber)}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; color: #000; width: 80mm; }
  .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 4px; margin-bottom: 6px; }
  .header h1 { font-size: 15px; }
  .header p { font-size: 11px; }
  .kot-title { text-align: center; font-size: 18px; font-weight: bold; margin: 4px 0; letter-spacing: 2px; }
  .meta { border-bottom: 1px dashed #000; padding-bottom: 4px; margin-bottom: 6px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 3px 2px; vertical-align: top; }
  td.qty { width: 14%; font-weight: bold; font-size: 14px; text-align: right; padding-right: 6px; }
  .notes { font-size: 10px; color: #333; }
  .footer { border-top: 1px dashed #000; margin-top: 8px; padding-top: 4px; text-align: center; font-size: 10px; }
</style>
</head>
<body>
  <div class="header">
    <h1>${esc(data.hotelName.toUpperCase())}</h1>
    <p>KITCHEN ORDER TICKET</p>
  </div>
  <div class="kot-title">${esc(data.kotNumber)}</div>
  <div class="meta">
    Order: ${esc(data.orderNumber)}<br/>
    ${data.tableName ? `Table: ${esc(data.tableName)}<br/>` : ''}
    ${data.roomNumber ? `Room: ${esc(data.roomNumber)}<br/>` : ''}
    Type: ${esc(data.orderType.replace(/_/g, ' '))}<br/>
    Time: ${esc(new Date(data.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }))}
  </div>
  <table>
    ${rows}
  </table>
  <div class="footer">*** ${esc(new Date(data.createdAt).toLocaleDateString('en-IN'))} ***</div>
</body>
</html>`;
}
