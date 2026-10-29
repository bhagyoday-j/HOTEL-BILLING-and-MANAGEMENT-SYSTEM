import type { BillDetail, HotelInfo } from '@/services/api';

export function invoicePrintData(bill: BillDetail, hotel: HotelInfo) {
  return {
    invoiceNumber: bill.billNumber,
    invoiceDate: bill.date,
    status: bill.status,
    hotel: {
      name: hotel.name,
      address: hotel.address,
      city: hotel.city,
      state: hotel.state,
      phone: hotel.phone,
      email: hotel.email,
      gstin: hotel.gstin,
    },
    guestName: bill.customerName,
    guestMobile: bill.customerMobile,
    roomNumber: null,
    items: bill.items.map((item) => ({
      description: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountAmount: item.discountAmount,
      lineTotal: item.lineTotal,
    })),
    subtotal: bill.subtotal,
    discountAmount: bill.discountAmount,
    taxableAmount: bill.taxableAmount,
    cgstAmount: bill.cgstAmount,
    sgstAmount: bill.sgstAmount,
    igstAmount: bill.igstAmount,
    totalTax: bill.totalTax,
    roundingAmount: bill.roundingAmount,
    grandTotal: bill.grandTotal,
    paidAmount: bill.paidAmount,
    dueAmount: bill.dueAmount,
    terms: bill.terms,
  };
}
