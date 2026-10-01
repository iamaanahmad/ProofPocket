export type Payment = { id: string; date: string; amount: number; reference: string };
export type ShiftUnit = 'hour' | 'task' | 'day';
export type Shift = {
  id: string;
  date: string;
  client: string;
  units: number;
  unit: ShiftUnit;
  rate: number;
  received: number;
  note: string;
  settled: boolean;
  payments: Payment[];
  createdAt: string;
};

const round = (n: number) => Math.round(n * 100) / 100;
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export const unitLabel = (unit: ShiftUnit, count = 2) => (unit === 'hour' ? (count === 1 ? 'hour' : 'hours') : unit === 'task' ? (count === 1 ? 'task' : 'tasks') : count === 1 ? 'day' : 'days');
export const promised = (s: Shift) => round(s.units * s.rate);
export const paid = (s: Shift) => round(s.received + s.payments.reduce((n, p) => n + p.amount, 0));
const rawUnpaid = (s: Shift) => Math.max(0, round(promised(s) - paid(s)));
export const amountOwed = (s: Shift) => (s.settled ? 0 : rawUnpaid(s));
export const isLocked = (s: Shift) => s.settled || rawUnpaid(s) === 0;
export const totals = (shifts: Shift[]) => shifts.reduce((t, s) => ({ promised: round(t.promised + promised(s)), received: round(t.received + paid(s)), owed: round(t.owed + amountOwed(s)) }), { promised: 0, received: 0, owed: 0 });

const UNIT_LIMITS: Record<ShiftUnit, number> = { hour: 24, task: 1000, day: 31 };
export function makeShift(input: Pick<Shift, 'date' | 'client' | 'units' | 'unit' | 'rate' | 'received' | 'note'>): Shift {
  if (!validDate(input.date)) throw Error('Use a valid date as YYYY-MM-DD.');
  if (!input.client.trim()) throw Error('Add the person or company that owes you.');
  if (!UNIT_LIMITS[input.unit]) throw Error('Choose how this work is paid: by hour, task or day.');
  if (!Number.isFinite(input.units) || input.units <= 0 || input.units > UNIT_LIMITS[input.unit]) throw Error(`${unitLabel(input.unit)} must be between 0 and ${UNIT_LIMITS[input.unit]} for one record.`);
  if (!Number.isFinite(input.rate) || input.rate <= 0) throw Error('Rate must be greater than zero.');
  if (!Number.isFinite(input.received) || input.received < 0) throw Error('Received pay cannot be negative.');
  return { ...input, client: input.client.trim(), note: input.note.trim(), received: round(input.received), settled: false, id: newId(), payments: [], createdAt: new Date().toISOString() };
}

export function addPayment(s: Shift, input: { date: string; amount: number; reference: string }): Shift {
  if (isLocked(s)) throw Error('This record is locked. Unlock it before adding a payment.');
  if (!validDate(input.date)) throw Error('Use a valid payment date.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw Error('Payment must be greater than zero.');
  return { ...s, payments: [...s.payments, { id: newId(), date: input.date, amount: round(input.amount), reference: input.reference.trim() }] };
}

export function setSettled(s: Shift, settled: boolean): Shift {
  return { ...s, settled };
}

export function parseShifts(raw: string | null): Shift[] {
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw Error('Invalid saved records.');
  return data.map((v: any) => {
    // Records saved by the first version stored hours only; they migrate to hour units.
    const units = Number.isFinite(v.units) ? v.units : v.hours;
    if (!v || typeof v.id !== 'string' || !validDate(v.date) || typeof v.client !== 'string' || !Number.isFinite(units) || !Number.isFinite(v.rate) || !Number.isFinite(v.received)) throw Error('Invalid saved shift.');
    const payments = v.payments ?? [];
    if (!Array.isArray(payments) || payments.some((p: any) => !p || typeof p.id !== 'string' || !validDate(p.date) || !Number.isFinite(p.amount) || p.amount <= 0 || typeof p.reference !== 'string')) throw Error('Invalid saved payment.');
    const unit: ShiftUnit = v.unit === 'task' || v.unit === 'day' ? v.unit : 'hour';
    return { id: v.id, date: v.date, client: v.client, units, unit, rate: v.rate, received: v.received, note: typeof v.note === 'string' ? v.note : '', settled: v.settled === true, payments, createdAt: typeof v.createdAt === 'string' ? v.createdAt : new Date().toISOString() } as Shift;
  });
}

export function payoutCheck(shifts: Shift[], client: string, month?: string) {
  const selected = shifts.filter(s => s.client === client && (!month || s.date.startsWith(`${month}-`)));
  const t = totals(selected);
  const units = round(selected.reduce((n, s) => n + s.units, 0));
  const unit: ShiftUnit = selected[0]?.unit ?? 'hour';
  const averageRate = units > 0 ? t.promised / units : 0;
  const paidUnitsEquivalent = averageRate > 0 ? round(t.received / averageRate) : 0;
  return { client, month: month ?? null, count: selected.length, units, unit, promised: t.promised, received: t.received, missing: t.owed, paidUnitsEquivalent };
}

export const workedMs = (startIso: string, endIso: string, pausedMs = 0) => Math.max(0, Date.parse(endIso) - Date.parse(startIso) - Math.max(0, pausedMs));
export const msToHours = (ms: number) => Math.round((ms / 3600000) * 100) / 100;
export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const csv = (v: string | number) => {
  const value = String(v);
  const safe = /^[\s]*[=+@-]/.test(value) && typeof v === 'string' ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};
export const toCsv = (shifts: Shift[]) => ['Date,Client,Work,Unit,Rate (₹),Promised (₹),Received (₹),Unpaid (₹),Settled,Note', ...shifts.map(s => [s.date, s.client, s.units, unitLabel(s.unit, s.units), s.rate, promised(s), paid(s), amountOwed(s), s.settled ? 'yes' : 'no', s.note].map(csv).join(','))].join('\n');

export function monthlySummary(shifts: Shift[]) {
  const byMonth = new Map<string, Shift[]>();
  for (const s of shifts) byMonth.set(s.date.slice(0, 7), [...(byMonth.get(s.date.slice(0, 7)) ?? []), s]);
  return [...byMonth].sort(([a], [b]) => b.localeCompare(a)).map(([month, items]) => ({ month, count: items.length, ...totals(items) }));
}

const html = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function disputePacket(shifts: Shift[], client: string) {
  const selected = shifts.filter(s => s.client === client).sort((a, b) => a.date.localeCompare(b.date));
  const t = totals(selected);
  const rows = selected.map(s => `<tr><td>${html(s.date)}</td><td>${s.units} ${html(unitLabel(s.unit, s.units))}</td><td>₹${s.rate.toFixed(2)}</td><td>₹${promised(s).toFixed(2)}</td><td>₹${paid(s).toFixed(2)}</td><td>₹${amountOwed(s).toFixed(2)}${s.settled ? ' (settled)' : ''}</td></tr>`).join('');
  const payments = selected.flatMap(s => s.payments.map(p => `<li>${html(p.date)} · ₹${p.amount.toFixed(2)} · ${html(p.reference || 'No reference')} · shift ${html(s.date)}</li>`)).join('');
  const notes = selected.filter(s => s.note).map(s => `<li>${html(s.date)}: ${html(s.note)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>ProofPocket record</title><style>@page{margin:18mm}body{font-family:'Segoe UI',Arial,sans-serif;color:#14201c;max-width:720px;margin:44px auto;padding:0 24px;line-height:1.55}.brand{display:flex;align-items:center;gap:10px;border-bottom:3px solid #0a5f52;padding-bottom:14px}.mark{width:30px;height:30px;border-radius:8px;background:#0a5f52;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:17px}.brandname{font-weight:800;font-size:17px;letter-spacing:-.2px}.brandtag{margin-left:auto;font-size:9px;font-weight:700;letter-spacing:1.4px;color:#84938c}h1{font-size:27px;letter-spacing:-.5px;margin:26px 0 4px}h2{font-size:14px;letter-spacing:1.2px;text-transform:uppercase;color:#0a5f52;margin:30px 0 8px}small{color:#5a6b64}.summary{background:#f6f8f6;border:1px solid #dde4e0;border-radius:14px;padding:18px 20px;margin-top:18px}.missing{font-size:26px;font-weight:800;color:#b3261e;margin:2px 0}.amounts{color:#33443e;font-size:14px}table{border-collapse:collapse;width:100%;font-size:13.5px}td,th{text-align:left;padding:9px 8px;border-bottom:1px solid #dde4e0}th{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5a6b64}ul{padding-left:18px;font-size:14px}li{margin:4px 0}.foot{margin-top:34px;border-top:1px solid #dde4e0;padding-top:12px;font-size:11.5px;color:#84938c}</style></head><body><div class="brand"><div class="mark">P</div><div class="brandname">ProofPocket</div><div class="brandtag">PERSONAL PAY RECORD</div></div><h1>Work and payment summary</h1><p>Client or company: <strong>${html(client)}</strong></p><p><small>Generated ${new Date().toISOString().slice(0, 10)}. This record is based on entries kept by the worker. It does not verify a contract or payment.</small></p><div class="summary"><p class="missing">Amount unpaid: ₹${t.owed.toFixed(2)}</p><p class="amounts">Promised: ₹${t.promised.toFixed(2)} · Received: ₹${t.received.toFixed(2)}</p></div><h2>Shifts</h2><table><thead><tr><th>Date</th><th>Work</th><th>Rate</th><th>Promised</th><th>Received</th><th>Unpaid</th></tr></thead><tbody>${rows}</tbody></table><h2>Later payments</h2><ul>${payments || '<li>None recorded</li>'}</ul><h2>Worker notes</h2><ul>${notes || '<li>None recorded</li>'}</ul><p class="foot">Review dates and amounts before sharing. Keep original messages and receipts separately. Recorded with ProofPocket.</p></body></html>`;
}

export function monthlyPacket(shifts: Shift[], month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw Error('Choose a valid month.');
  const selected = shifts.filter(s => s.date.startsWith(`${month}-`));
  if (!selected.length) throw Error('No shifts are saved for this month.');
  const byClient = new Map<string, Shift[]>();
  for (const shift of selected) byClient.set(shift.client, [...(byClient.get(shift.client) ?? []), shift]);
  const summary = totals(selected);
  const rows = [...byClient].sort(([a], [b]) => a.localeCompare(b)).map(([client, items]) => {
    const value = totals(items);
    return `<tr><td>${html(client)}</td><td>${items.length}</td><td>₹${value.promised.toFixed(2)}</td><td>₹${value.received.toFixed(2)}</td><td>₹${value.owed.toFixed(2)}</td></tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>ProofPocket monthly record</title><style>@page{margin:18mm}body{font-family:'Segoe UI',Arial,sans-serif;color:#14201c;max-width:720px;margin:44px auto;padding:0 24px;line-height:1.55}.brand{display:flex;align-items:center;gap:10px;border-bottom:3px solid #0a5f52;padding-bottom:14px}.mark{width:30px;height:30px;border-radius:8px;background:#0a5f52;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:17px}.brandname{font-weight:800;font-size:17px;letter-spacing:-.2px}.brandtag{margin-left:auto;font-size:9px;font-weight:700;letter-spacing:1.4px;color:#84938c}h1{font-size:27px;letter-spacing:-.5px;margin:26px 0 4px}small{color:#5a6b64}.summary{background:#f6f8f6;border:1px solid #dde4e0;border-radius:14px;padding:18px 20px;margin:18px 0 6px}.total{font-size:17px;font-weight:800;color:#0a5f52;margin:2px 0}.missing{font-size:19px;font-weight:800;color:#b3261e;margin:2px 0}table{border-collapse:collapse;width:100%;font-size:13.5px;margin-top:14px}td,th{text-align:left;padding:9px 8px;border-bottom:1px solid #dde4e0}th{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#5a6b64}.foot{margin-top:34px;border-top:1px solid #dde4e0;padding-top:12px;font-size:11.5px;color:#84938c}</style></head><body><div class="brand"><div class="mark">P</div><div class="brandname">ProofPocket</div><div class="brandtag">PERSONAL PAY RECORD</div></div><h1>${html(month)} payment summary</h1><p><small>Generated ${new Date().toISOString().slice(0, 10)} from ${selected.length} saved shifts.</small></p><div class="summary"><p class="total">Promised: ₹${summary.promised.toFixed(2)} · Received: ₹${summary.received.toFixed(2)}</p><p class="missing">Missing payments: ₹${summary.owed.toFixed(2)}</p></div><table><thead><tr><th>Client</th><th>Shifts</th><th>Promised</th><th>Received</th><th>Unpaid</th></tr></thead><tbody>${rows}</tbody></table><p class="foot">This is a worker-kept record. Review it before sharing. Keep original messages and receipts separately. Recorded with ProofPocket.</p></body></html>`;
}

const DEMO_CLIENTS = [
  { client: 'Cafe Aroma', unit: 'hour' as ShiftUnit, rate: 180 },
  { client: 'QuickDash Deliveries', unit: 'task' as ShiftUnit, rate: 45 },
  { client: 'Studio Nine', unit: 'hour' as ShiftUnit, rate: 350 },
];

/** One-tap sample month so anyone can try (and film) the full flow in minutes. */
export function demoShifts(now: Date): Shift[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const pm = `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}`;
  const cm = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`;
  const today = `${cm}-${pad(now.getUTCDate())}`;
  const raw: Array<Partial<Shift> & { date: string; client: string; units: number }> = [
    { date: `${pm}-03`, client: 'Cafe Aroma', units: 11.5, received: 1440, note: 'Weekend rush. Paid for 8 of 11.5 hours.', payments: [] },
    { date: `${pm}-06`, client: 'QuickDash Deliveries', units: 240, received: 9450, note: 'Paid for 210 of 240 deliveries.' },
    { date: `${pm}-09`, client: 'Cafe Aroma', units: 8, received: 1440, note: 'Paid in full.' },
    { date: `${pm}-12`, client: 'Studio Nine', units: 6, received: 0, note: 'Invoice sent, nothing received yet.' },
    { date: `${pm}-15`, client: 'QuickDash Deliveries', units: 180, received: 8100, note: 'Paid in full.' },
    { date: `${pm}-18`, client: 'Cafe Aroma', units: 9.5, received: 1710, note: 'Paid in full.' },
    { date: `${pm}-21`, client: 'Studio Nine', units: 7, received: 2450, note: 'Paid in full.', settled: true },
    { date: `${pm}-24`, client: 'Cafe Aroma', units: 10, received: 900, note: 'Half paid. Rest promised Friday.', payments: [{ id: 'demo-p1', date: `${pm}-25`, amount: 450, reference: 'UPI' }] },
    { date: `${pm}-26`, client: 'QuickDash Deliveries', units: 150, received: 5400, note: 'Paid for 120 of 150 deliveries.' },
    { date: today, client: 'Cafe Aroma', units: 4, received: 0, note: 'Morning shift, payment pending.' },
  ];
  return raw.map((r, i) => {
    const meta = DEMO_CLIENTS.find(c => c.client === r.client)!;
    return {
      id: `demo-${i + 1}`,
      date: r.date,
      client: r.client,
      units: r.units,
      unit: meta.unit,
      rate: meta.rate,
      received: r.received ?? 0,
      note: r.note ?? '',
      settled: r.settled === true,
      payments: (r.payments ?? []) as Payment[],
      createdAt: `${r.date}T09:00:00.000Z`,
    };
  });
}
