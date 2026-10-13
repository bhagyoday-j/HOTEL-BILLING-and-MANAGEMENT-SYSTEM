import { describe, expect, it } from 'vitest';
import { renderInvoiceHtml, type InvoiceTemplateData } from './templates';

function sample(overrides: Partial<InvoiceTemplateData> = {}): InvoiceTemplateData {
  return {
    invoiceNumber: 'INV-2026-000123',
    invoiceDate: '2026-10-13T10:00:00.000Z',
    status: 'PAID',
    hotel: {
      name: 'Hotel Grand Palace',
      address: '123 MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      phone: '+91 20 1234 5678',
      email: 'info@hotelgrandpalace.example',
      gstin: '27AAAAA0000A1Z5',
    },
    guestName: 'Walk-in Guest',
    guestMobile: '9876543210',
    items: [
      {
        description: 'Paneer Tikka',
        quantity: '2',
        unitPrice: '250.00',
        discountAmount: '0',
        lineTotal: '500.00',
      },
    ],
    subtotal: '500.00',
    discountAmount: '0',
    taxableAmount: '500.00',
    cgstAmount: '45.00',
    sgstAmount: '45.00',
    igstAmount: '0',
    totalTax: '90.00',
    roundingAmount: '0',
    grandTotal: '590.00',
    paidAmount: '590.00',
    dueAmount: '0',
    terms: 'Thank you',
    receiptFooter: 'Please visit again',
    ...overrides,
  };
}

describe('renderInvoiceHtml', () => {
  it('renders a complete A4 invoice with header, line items and totals', () => {
    const html = renderInvoiceHtml(sample(), 'A4');
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('HOTEL GRAND PALACE');
    expect(html).toContain('INV-2026-000123');
    expect(html).toContain('Paneer Tikka');
    expect(html).toContain('590.00');
    // A4 uses the named page size, not a thermal width.
    expect(html).toContain('@page { size: A4;');
    expect(html).not.toContain('58mm');
  });

  it('uses the correct page width for 80mm and 58mm thermal formats', () => {
    const b80 = renderInvoiceHtml(sample(), 'THERMAL_80');
    expect(b80).toContain('@page { size: 80mm auto;');
    const b58 = renderInvoiceHtml(sample(), 'THERMAL_58');
    expect(b58).toContain('@page { size: 58mm auto;');
  });

  it('escapes HTML from user-supplied fields to prevent injection in the print document', () => {
    const html = renderInvoiceHtml(
      sample({ guestName: '<script>alert(1)</script>', invoiceNumber: 'INV<&>"' }),
      'A4',
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('INV&lt;&amp;&gt;&quot;');
  });

  it('omits zero tax and rounding rows but keeps the grand total', () => {
    const html = renderInvoiceHtml(
      sample({
        cgstAmount: '0',
        sgstAmount: '0',
        igstAmount: '0',
        totalTax: '0',
        roundingAmount: '0',
        grandTotal: '500.00',
      }),
      'A4',
    );
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
    expect(html).not.toContain('Rounding');
    expect(html).toContain('Grand Total');
    expect(html).toContain('500.00');
  });

  it('shows the IGST row for inter-state bills', () => {
    const html = renderInvoiceHtml(
      sample({ igstAmount: '90.00', cgstAmount: '0', sgstAmount: '0' }),
      'A4',
    );
    expect(html).toContain('IGST');
    expect(html).not.toContain('CGST');
  });

  it('defaults to a walk-in guest and a fallback footer', () => {
    const html = renderInvoiceHtml(
      sample({ guestName: null, receiptFooter: null }),
      'THERMAL_80',
    );
    expect(html).toContain('Walk-in');
    expect(html).toContain('Thank you for your stay!');
  });
});
