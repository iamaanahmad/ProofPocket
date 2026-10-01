export type Payment = { id: string; date: string; amount: number; reference: string };
export type Shift = { id: string; date: string; client: string; hours: number; rate: number; received: number; note: string; payments: Payment[]; createdAt: string };
const round = (n: number) => Math.round(n * 100) / 100;
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
export const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
export const promised = (s: Shift) => round(s.hours * s.rate);
export const paid = (s: Shift) => round(s.received + s.payments.reduce((n, p) => n + p.amount, 0));
export const amountOwed = (s: Shift) => Math.max(0, round(promised(s) - paid(s)));
export const totals = (shifts: Shift[]) => shifts.reduce((t, s) => ({ promised: round(t.promised + promised(s)), received: round(t.received + paid(s)), owed: round(t.owed + amountOwed(s)) }), { promised: 0, received: 0, owed: 0 });
export function makeShift(input: Pick<Shift, 'date' | 'client' | 'hours' | 'rate' | 'received' | 'note'>): Shift {
  if (!validDate(input.date)) throw Error('Use a valid date as YYYY-MM-DD.');
  if (!input.client.trim()) throw Error('Add the person or company that owes you.');
  if (!Number.isFinite(input.hours) || input.hours <= 0 || input.hours > 24) throw Error('Hours must be between 0 and 24.');
  if (!Number.isFinite(input.rate) || input.rate <= 0) throw Error('Rate must be greater than zero.');
  if (!Number.isFinite(input.received) || input.received < 0) throw Error('Received pay cannot be negative.');
  return { ...input, client: input.client.trim(), note: input.note.trim(), received: round(input.received), id: newId(), payments: [], createdAt: new Date().toISOString() };
}
export function addPayment(s: Shift, input: { date: string; amount: number; reference: string }): Shift {
  if (!validDate(input.date)) throw Error('Use a valid payment date.');
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw Error('Payment must be greater than zero.');
  return { ...s, payments: [...s.payments, { id: newId(), date: input.date, amount: round(input.amount), reference: input.reference.trim() }] };
}
export function parseShifts(raw: string | null): Shift[] {
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw Error('Invalid saved records.');
  return data.map((v: any) => {
    if (!v || typeof v.id !== 'string' || !validDate(v.date) || typeof v.client !== 'string' || !Number.isFinite(v.hours) || !Number.isFinite(v.rate) || !Number.isFinite(v.received)) throw Error('Invalid saved shift.');
    const payments = v.payments ?? [];
    if (!Array.isArray(payments) || payments.some((p: any) => !p || typeof p.id !== 'string' || !validDate(p.date) || !Number.isFinite(p.amount) || p.amount <= 0 || typeof p.reference !== 'string')) throw Error('Invalid saved payment.');
    return { ...v, note: typeof v.note === 'string' ? v.note : '', payments, createdAt: typeof v.createdAt === 'string' ? v.createdAt : new Date().toISOString() } as Shift;
  });
}
const csv = (v: string | number) => {
  const value = String(v);
  const safe = /^[\s]*[=+@-]/.test(value) && typeof v === 'string' ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};
export const toCsv = (shifts: Shift[]) => ['Date,Client,Hours,Rate,Promised,Received,Outstanding,Note', ...shifts.map(s => [s.date, s.client, s.hours, s.rate, promised(s), paid(s), amountOwed(s), s.note].map(csv).join(','))].join('\n');
export function monthlySummary(shifts: Shift[]) {
  const byMonth = new Map<string, Shift[]>();
  for (const s of shifts) byMonth.set(s.date.slice(0, 7), [...(byMonth.get(s.date.slice(0, 7)) ?? []), s]);
  return [...byMonth].sort(([a], [b]) => b.localeCompare(a)).map(([month, items]) => ({ month, count: items.length, ...totals(items) }));
}
const html = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function disputePacket(shifts: Shift[], client: string) {
  const selected = shifts.filter(s => s.client === client).sort((a, b) => a.date.localeCompare(b.date));
  const t = totals(selected);
  const rows = selected.map(s => `<tr><td>${html(s.date)}</td><td>${s.hours}</td><td>₹${s.rate.toFixed(2)}</td><td>₹${promised(s).toFixed(2)}</td><td>₹${paid(s).toFixed(2)}</td><td>₹${amountOwed(s).toFixed(2)}</td></tr>`).join('');
  const payments = selected.flatMap(s => s.payments.map(p => `<li>${html(p.date)} · ₹${p.amount.toFixed(2)} · ${html(p.reference || 'No reference')} · shift ${html(s.date)}</li>`)).join('');
  const notes = selected.filter(s => s.note).map(s => `<li>${html(s.date)}: ${html(s.note)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><title>ProofPocket record</title><style>body{font-family:Arial,sans-serif;color:#172c38;max-width:760px;margin:48px auto;padding:0 24px}h1{font-size:32px}h2{margin-top:32px}small{color:#526973}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:9px;border-bottom:1px solid #dce7e2}.total{font-size:22px;font-weight:bold;color:#086c65}</style></head><body><small>PROOFPOCKET · PERSONAL PAY RECORD</small><h1>Work and payment summary</h1><p>Client or company: <strong>${html(client)}</strong></p><p>Generated ${new Date().toISOString().slice(0, 10)}. This record is based on entries kept by the worker. It does not verify a contract or payment.</p><p class="total">Outstanding: ₹${t.owed.toFixed(2)}</p><p>Promised: ₹${t.promised.toFixed(2)} · Received: ₹${t.received.toFixed(2)}</p><h2>Shifts</h2><table><thead><tr><th>Date</th><th>Hours</th><th>Rate</th><th>Promised</th><th>Received</th><th>Owed</th></tr></thead><tbody>${rows}</tbody></table><h2>Later payments</h2><ul>${payments || '<li>None recorded</li>'}</ul><h2>Worker notes</h2><ul>${notes || '<li>None recorded</li>'}</ul><p><small>Review dates and amounts before sharing. Keep original messages and receipts separately.</small></p></body></html>`;
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
  return `<!doctype html><html><head><meta charset="utf-8"/><title>ProofPocket monthly record</title><style>body{font-family:Arial,sans-serif;color:#172c38;max-width:760px;margin:48px auto;padding:0 24px}h1{font-size:32px}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:10px;border-bottom:1px solid #dce7e2}.total{font-size:22px;font-weight:bold;color:#086c65}small{color:#526973}</style></head><body><small>PROOFPOCKET · PERSONAL PAY RECORD</small><h1>${html(month)} payment summary</h1><p>Generated ${new Date().toISOString().slice(0, 10)} from ${selected.length} saved shifts.</p><p class="total">Outstanding: ₹${summary.owed.toFixed(2)}</p><p>Promised: ₹${summary.promised.toFixed(2)} · Received: ₹${summary.received.toFixed(2)}</p><table><thead><tr><th>Client</th><th>Shifts</th><th>Promised</th><th>Received</th><th>Owed</th></tr></thead><tbody>${rows}</tbody></table><p><small>This is a worker-kept record. Review it before sharing. Keep original messages and receipts separately.</small></p></body></html>`;
}
