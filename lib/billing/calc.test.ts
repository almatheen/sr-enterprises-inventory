
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from './calc';

const base = {
  gstOverride: null,
  discountType: 'pct' as const,
  discountValue: 0,
  interState: false,
};

test('empty cart is all zero', () => {
  const r = calculate([], base);

  assert.equal(r.gt, 0);
  assert.equal(r.sub, 0);
  assert.equal(r.tax, 0);
});

test('GST-inclusive price splits CGST and SGST correctly', () => {
  const r = calculate(
    [{ id: 'a', name: 'A', price: 100, gst: 18, qty: 2 }],
    base
  );

  assert.equal(r.sub, 200);
  assert.equal(r.tax, 30.51);
  assert.equal(r.cgst, 15.25);
  assert.equal(r.sgst, 15.26);
  assert.equal(r.igst, 0);
  assert.equal(r.gt, 200);
});

test('GST-inclusive price uses IGST for inter-state sales', () => {
  const r = calculate(
    [{ id: 'a', name: 'A', price: 100, gst: 12, qty: 1 }],
    { ...base, interState: true }
  );

  assert.equal(r.sub, 100);
  assert.equal(r.tax, 10.71);
  assert.equal(r.igst, 10.71);
  assert.equal(r.cgst, 0);
  assert.equal(r.sgst, 0);
  assert.equal(r.gt, 100);
});

test('percentage discount reduces the GST-inclusive total', () => {
  const r = calculate(
    [{ id: 'a', name: 'A', price: 1000, gst: 18, qty: 1 }],
    { ...base, discountValue: 10 }
  );

  assert.equal(r.disc, 100);
  assert.equal(r.tax, 137.29);
  assert.equal(r.gt, 900);
});

test('amount discount is capped at subtotal', () => {
  const r = calculate(
    [{ id: 'a', name: 'A', price: 50, gst: 5, qty: 1 }],
    {
      ...base,
      discountType: 'amt',
      discountValue: 999,
    }
  );

  assert.equal(r.disc, 50);
  assert.equal(r.gt, 0);
  assert.equal(r.tax, 0);
});

test('GST override applies to every line', () => {
  const r = calculate(
    [
      { id: 'a', name: 'A', price: 100, gst: 18, qty: 1 },
      { id: 'b', name: 'B', price: 100, gst: 12, qty: 1 },
    ],
    { ...base, gstOverride: 5 }
  );

  assert.equal(r.sub, 200);
  assert.equal(r.tax, 9.52);
  assert.equal(r.gt, 200);
});

test('round off keeps grand total integral', () => {
  const r = calculate(
    [{ id: 'a', name: 'A', price: 99, gst: 18, qty: 1 }],
    base
  );

  assert.equal(Number.isInteger(r.gt), true);
  assert.equal(Math.abs(r.round) < 1, true);
});
