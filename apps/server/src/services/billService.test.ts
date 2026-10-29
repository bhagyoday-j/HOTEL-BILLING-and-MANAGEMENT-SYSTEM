import { describe, expect, it } from 'vitest';
import { calculateEditedBill } from './billService';

const existingItems = [
  {
    id: 'item-1',
    description: 'Meal',
    quantity: '2',
    unitPrice: '100.00',
    taxRate: '5',
  },
  {
    id: 'item-2',
    description: 'Tea',
    quantity: '1',
    unitPrice: '20.00',
    taxRate: '0',
  },
];

describe('calculateEditedBill', () => {
  it('recalculates edited quantities, discounts, GST and paid total from snapshots', () => {
    const result = calculateEditedBill(
      existingItems,
      [{ id: 'item-1', quantity: '3' }],
      false,
      { discountAmount: '10' },
    );

    expect(result.items).toEqual([
      expect.objectContaining({ id: 'item-1', quantity: '3', lineTotal: '300.00' }),
    ]);
    expect(result.breakdown).toMatchObject({
      subtotal: '290.00',
      cgst: '7.25',
      sgst: '7.25',
      totalTax: '14.50',
      grandTotal: '304.50',
    });
  });

  it('calculates interstate tax with the original item tax snapshot', () => {
    const result = calculateEditedBill(
      existingItems,
      [{ id: 'item-1', quantity: '1' }],
      true,
      {},
    );

    expect(result.breakdown).toMatchObject({
      cgst: '0.00',
      sgst: '0.00',
      igst: '5.00',
      grandTotal: '105.00',
    });
  });

  it('rejects empty, duplicate, unknown, and invalid quantity edits', () => {
    expect(() => calculateEditedBill(existingItems, [], false, {})).toThrow(
      'A finalized bill must contain at least one item',
    );
    expect(() =>
      calculateEditedBill(
        existingItems,
        [
          { id: 'item-1', quantity: '1' },
          { id: 'item-1', quantity: '2' },
        ],
        false,
        {},
      ),
    ).toThrow('A bill item can only be listed once');
    expect(() =>
      calculateEditedBill(existingItems, [{ id: 'other', quantity: '1' }], false, {}),
    ).toThrow('An item does not belong to this bill');
    expect(() =>
      calculateEditedBill(existingItems, [{ id: 'item-1', quantity: '0' }], false, {}),
    ).toThrow('Quantity must be a whole number from 1 to 999');
  });
});
