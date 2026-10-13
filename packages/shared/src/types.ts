export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'CANCELLED'
  | 'REFUNDED';

export type PrintFormat = 'A4' | 'THERMAL_80' | 'THERMAL_58';

export type BackupFrequency = 'NEVER' | 'DAILY' | 'EVERY_6_HOURS' | 'EVERY_12_HOURS' | 'ON_CLOSE';

export type DateFilterPreset = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'CUSTOM';

export interface MoneyBreakdown {
  grossAmount: string;
  itemDiscount: string;
  subtotal: string;
  taxableAmount: string;
  cgst: string;
  sgst: string;
  igst: string;
  totalTax: string;
  rounding: string;
  grandTotal: string;
}

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  roleCode: string;
  permissions: string[];
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
