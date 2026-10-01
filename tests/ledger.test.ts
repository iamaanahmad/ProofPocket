import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addPayment, amountOwed, demoShifts, disputePacket, formatDuration, isLocked, makeShift, monthlyPacket, monthlySummary, msToHours, parseShifts, payoutCheck, setSettled, toCsv, totals, workedMs } from '../ledger';

const base = { date: '2026-10-01', client: '  ABC Studio  ', units: 8, unit: 'hour' as const, rate: 250, received: 500, note: 'Saturday, "rush"' };

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

test('invalid units, rate and payment cannot enter the ledger', () => {
  for (const change of [{ units: 0 }, { units: NaN }, { units: 25 }, { rate: -1 }, { received: -1 }, { client: ' ' }]) {
    assert.throws(() => makeShift({ ...base, ...change }));
  }
});

test('per-task work prices units instead of hours', () => {
  const shift = makeShift({ ...base, units: 240, unit: 'task', rate: 45, received: 9450 });
  assert.equal(amountOwed(shift), 1350);
  const check = payoutCheck([shift], 'ABC Studio');
  assert.equal(check.units, 240);
  assert.equal(check.paidUnitsEquivalent, 210);
  assert.equal(check.missing, 1350);
});

test('payout check converts money back into hours worked', () => {
  const logged = makeShift({ ...base, units: 11.5, rate: 200, received: 2000 });
  const check = payoutCheck([logged], 'ABC Studio');
  assert.equal(check.units, 11.5);
  assert.equal(check.paidUnitsEquivalent, 10);
  assert.equal(check.missing, 300);
});

test('a settled shift is locked, owes nothing, and refuses payments', () => {
  const shift = makeShift({ ...base, received: 500 });
  const settled = setSettled(shift, true);
  assert.equal(isLocked(settled), true);
  assert.equal(amountOwed(settled), 0);
  assert.throws(() => addPayment(settled, { date: '2026-10-03', amount: 100, reference: 'UPI' }), /locked/);
  const unlocked = setSettled(settled, false);
  assert.equal(isLocked(unlocked), false);
  assert.equal(amountOwed(unlocked), 1500);
});

test('a fully paid shift locks itself', () => {
  const shift = makeShift({ ...base, received: 2000 });
  assert.equal(isLocked(shift), true);
});

test('CSV quotes commas and quotation marks', () => {
  const csv = toCsv([makeShift({ ...base, client: 'ABC, Studio' })]);
  assert.match(csv, /"ABC, Studio"/);
  assert.match(csv, /"Saturday, ""rush"""/);
  assert.match(csv, /Work,Unit/);
});

test('later payments update the balance and survive reload', () => {
  const shift = addPayment(makeShift(base), { date: '2026-10-03', amount: 700, reference: 'UPI 42' });
  const [saved] = parseShifts(JSON.stringify([shift]));
  assert.equal(amountOwed(saved), 800);
  assert.equal(saved.payments[0].reference, 'UPI 42');
  assert.equal(monthlySummary([saved])[0].received, 1200);
});

test('first-version records with hours only migrate to hour units', () => {
  const legacy = JSON.stringify([{ id: 'old-1', date: '2026-09-14', client: 'Cafe Aroma', hours: 6, rate: 180, received: 1080, note: '', payments: [], createdAt: '2026-09-14T10:00:00.000Z' }]);
  const [saved] = parseShifts(legacy);
  assert.equal(saved.units, 6);
  assert.equal(saved.unit, 'hour');
  assert.equal(saved.settled, false);
  assert.equal(amountOwed(saved), 0);
});

test('client packet includes a payment trail without rendering entered HTML', () => {
  const shift = addPayment(makeShift({ ...base, client: '<script>x</script>' }), { date: '2026-10-03', amount: 700, reference: '<img>' });
  const output = disputePacket([shift], '<script>x</script>');
  assert.match(output, /Amount unpaid: ₹800\.00/);
  assert.match(output, /UPI|&lt;img&gt;/);
  assert.doesNotMatch(output, /<script>|<img>/);
});

test('monthly packet groups clients and blocks spreadsheet formulas in CSV', () => {
  const first = makeShift({ ...base, client: 'ABC Studio' });
  const second = makeShift({ ...base, client: '=SUM(A1:A2)', received: 0 });
  const output = monthlyPacket([first, second], '2026-10');
  assert.match(output, /Missing payments: ₹3500\.00/);
  assert.match(output, /ABC Studio/);
  assert.match(toCsv([second]), /"'=SUM\(A1:A2\)"/);
});

test('timer math subtracts breaks and formats a clock', () => {
  const start = '2026-10-01T09:00:00.000Z';
  const end = '2026-10-01T12:00:00.000Z';
  assert.equal(msToHours(workedMs(start, end, 30 * 60 * 1000)), 2.5);
  assert.equal(workedMs(end, start), 0);
  assert.equal(formatDuration(2.5 * 3600 * 1000), '2:30:00');
  assert.equal(formatDuration(9 * 60 * 1000), '09:00');
});

test('demo month seeds a realistic missing-pay story', () => {
  const shifts = demoShifts(new Date('2026-10-01T10:00:00.000Z'));
  const september = shifts.filter(s => s.date.startsWith('2026-09'));
  assert.ok(september.length >= 8);
  const summary = monthlySummary(shifts).find(m => m.month === '2026-09');
  assert.ok(summary && summary.owed > 2000);
  const cafe = payoutCheck(shifts, 'Cafe Aroma', '2026-09');
  assert.ok(cafe.missing > 0);
});
