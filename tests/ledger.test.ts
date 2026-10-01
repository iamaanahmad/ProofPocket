import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPayment, amountOwed, disputePacket, makeShift, monthlyPacket, monthlySummary, parseShifts, toCsv, totals } from '../ledger';

const base = { date: '2026-10-01', client: '  ABC Studio  ', hours: 8, rate: 250, received: 500, note: 'Saturday, "rush"' };

test('partial payment leaves only the unpaid amount outstanding', () => {
  const shift = makeShift(base);
  assert.equal(shift.client, 'ABC Studio');
  assert.equal(amountOwed(shift), 1500);
  assert.deepEqual(totals([shift]), { promised: 2000, received: 500, owed: 1500 });
});

test('extra payment cannot create negative debt', () => {
  const shift = makeShift({ ...base, received: 2500 });
  assert.equal(amountOwed(shift), 0);
});

test('invalid hours, rate and payment cannot enter the ledger', () => {
  for (const change of [{ hours: 0 }, { hours: NaN }, { rate: -1 }, { received: -1 }, { client: ' ' }]) {
    assert.throws(() => makeShift({ ...base, ...change }));
  }
});

test('CSV quotes commas and quotation marks', () => {
  const csv = toCsv([makeShift({ ...base, client: 'ABC, Studio' })]);
  assert.match(csv, /"ABC, Studio"/);
  assert.match(csv, /"Saturday, ""rush"""/);
});

test('later payments update the balance and survive reload', () => {
  const shift = addPayment(makeShift(base), { date: '2026-10-03', amount: 700, reference: 'UPI 42' });
  const [saved] = parseShifts(JSON.stringify([shift]));
  assert.equal(amountOwed(saved), 800);
  assert.equal(saved.payments[0].reference, 'UPI 42');
  assert.equal(monthlySummary([saved])[0].received, 1200);
});

test('client packet includes a payment trail without rendering entered HTML', () => {
  const shift = addPayment(makeShift({ ...base, client: '<script>x</script>' }), { date: '2026-10-03', amount: 700, reference: '<img>' });
  const output = disputePacket([shift], '<script>x</script>');
  assert.match(output, /Outstanding: ₹800\.00/);
  assert.match(output, /UPI|&lt;img&gt;/);
  assert.doesNotMatch(output, /<script>|<img>/);
});

test('monthly packet groups clients and blocks spreadsheet formulas in CSV', () => {
  const first = makeShift({ ...base, client: 'ABC Studio' });
  const second = makeShift({ ...base, client: '=SUM(A1:A2)', received: 0 });
  const output = monthlyPacket([first, second], '2026-10');
  assert.match(output, /Outstanding: ₹3500\.00/);
  assert.match(output, /ABC Studio/);
  assert.match(toCsv([second]), /"'=SUM\(A1:A2\)"/);
});
