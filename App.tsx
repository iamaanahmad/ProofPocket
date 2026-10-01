import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { addPayment, amountOwed, demoShifts, disputePacket, formatDuration, isLocked, makeShift, monthlyPacket, monthlySummary, msToHours, paid, parseShifts, payoutCheck, promised, setSettled, Shift, ShiftUnit, toCsv, totals, unitLabel } from './ledger';
import { buyPlus, configurePurchases, getPlusPackages, getPlusStatus, PlusPackage, purchasesConfigured, restorePlus } from './purchases';

const KEY = 'proofpocket.shifts.v1';
const ACTIVE_KEY = 'proofpocket.active.v1';
const cash = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (key: string) => { const [y, m] = key.split('-').map(Number); return `${MONTH_NAMES[(m || 1) - 1]} ${y}`; };
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const currentMonth = () => localToday().slice(0, 7);
const fmtUnits = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '').replace(/\.$/, ''));
const UNITS: Array<{ key: ShiftUnit; label: string; work: string }> = [
  { key: 'hour', label: 'Per hour', work: 'HOURS WORKED' },
  { key: 'task', label: 'Per task', work: 'TASKS COMPLETED' },
  { key: 'day', label: 'Per day', work: 'DAYS WORKED' },
];

type Tab = 'home' | 'timer' | 'add' | 'check' | 'packet' | 'plus';
type ActiveShift = { client: string; rate: string; unit: ShiftUnit; startedAt: string; accumulatedMs: number; runningSince: string | null; breaks: number; tasks: number; note: string };

export default function App() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [client, setClient] = useState('');
  const [date, setDate] = useState(localToday());
  const [units, setUnits] = useState('');
  const [unit, setUnit] = useState<ShiftUnit>('hour');
  const [rate, setRate] = useState('');
  const [received, setReceived] = useState('0');
  const [note, setNote] = useState('');
  const [plus, setPlus] = useState(false);
  const [plans, setPlans] = useState<PlusPackage[]>([]);
  const [message, setMessage] = useState('');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [payment, setPayment] = useState('');
  const [paymentDate, setPaymentDate] = useState(localToday());
  const [paymentReference, setPaymentReference] = useState('');
  const [packetClient, setPacketClient] = useState('');
  const [checkClient, setCheckClient] = useState('');
  const [checkMonth, setCheckMonth] = useState('');
  const [storageSafe, setStorageSafe] = useState(true);
  const [active, setActive] = useState<ActiveShift | null>(null);
  const [activeLoaded, setActiveLoaded] = useState(false);
  const [startClient, setStartClient] = useState('');
  const [startRate, setStartRate] = useState('');
  const [startUnit, setStartUnit] = useState<ShiftUnit>('hour');
  const [clock, setClock] = useState(Date.now());

  const sum = useMemo(() => totals(shifts), [shifts]);
  const months = useMemo(() => monthlySummary(shifts), [shifts]);
  const clients = useMemo(() => [...new Set(shifts.map(s => s.client))].sort(), [shifts]);
  const thisMonth = useMemo(() => months.find(m => m.month === currentMonth()) ?? { month: currentMonth(), count: 0, promised: 0, received: 0, owed: 0 }, [months]);
  const monthRatio = thisMonth.promised > 0 ? Math.min(1, thisMonth.received / thisMonth.promised) : 1;
  const activeCheckClient = checkClient && clients.includes(checkClient) ? checkClient : clients[0] ?? '';
  const monthKeys = useMemo(() => [...new Set([currentMonth(), ...months.map(m => m.month)])], [months]);
  const activeCheckMonth = checkMonth && monthKeys.includes(checkMonth) ? checkMonth : monthKeys.find(k => shifts.some(s => s.date.startsWith(`${k}-`))) ?? currentMonth();
  const check = useMemo(() => (activeCheckClient ? payoutCheck(shifts, activeCheckClient, activeCheckMonth) : null), [shifts, activeCheckClient, activeCheckMonth]);
  const hasDemo = useMemo(() => shifts.some(s => s.id.startsWith('demo-')), [shifts]);
  const elapsedMs = active ? active.accumulatedMs + (active.runningSince ? Math.max(0, clock - Date.parse(active.runningSince)) : 0) : 0;

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(value => {
      if (value) {
        try { setShifts(parseShifts(value)); }
        catch { setStorageSafe(false); setMessage('Saved records could not be read. They were not changed.'); }
      }
      setLoaded(true);
    }).catch(() => { setLoaded(true); setMessage('Local storage is unavailable.'); });
    AsyncStorage.getItem(ACTIVE_KEY).then(value => {
      if (value) { try { const parsed = JSON.parse(value); if (parsed && typeof parsed.client === 'string' && typeof parsed.startedAt === 'string') setActive(parsed); } catch { /* a broken timer draft is safe to drop */ } }
      setActiveLoaded(true);
    }).catch(() => setActiveLoaded(true));
    configurePurchases().then(ok => { if (ok) { getPlusStatus().then(setPlus).catch(() => {}); getPlusPackages().then(setPlans).catch(() => {}); } }).catch(() => {});
  }, []);
  useEffect(() => { if (loaded && storageSafe) AsyncStorage.setItem(KEY, JSON.stringify(shifts)).catch(() => setMessage('This entry could not be saved.')); }, [shifts, loaded, storageSafe]);
  useEffect(() => {
    if (!activeLoaded) return;
    if (active) AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(active)).catch(() => {});
    else AsyncStorage.removeItem(ACTIVE_KEY).catch(() => {});
  }, [active, activeLoaded]);
  const timerOn = Boolean(active);
  useEffect(() => {
    if (!timerOn) return;
    const id = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerOn]);

  function save() {
    try {
      if (!storageSafe) throw new Error('Saved data needs repair before you add a shift.');
      const shift = makeShift({ date, client, units: Number(units), unit, rate: Number(rate), received: Number(received), note });
      setShifts(current => [shift, ...current]);
      setClient(''); setUnits(''); setRate(''); setReceived('0'); setNote('');
      setMessage('Shift saved on this device.'); setTab('home');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Check this entry.'); }
  }
  function savePayment(id: string) {
    try {
      const shift = shifts.find(s => s.id === id);
      if (!shift) throw Error('This shift was not found.');
      const updated = addPayment(shift, { amount: Number(payment), date: paymentDate, reference: paymentReference });
      setShifts(current => current.map(s => s.id === id ? updated : s));
      setPayment(''); setPaymentReference(''); setPaymentId(null); setMessage('Payment added to the timeline.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Check this payment.'); }
  }
  function toggleSettled(shift: Shift) {
    setShifts(current => current.map(s => s.id === shift.id ? setSettled(s, !s.settled) : s));
    setMessage(shift.settled ? 'Shift unlocked. You can edit it again.' : 'Shift settled and locked.');
  }
  function settleCheckSelection() {
    if (!check) return;
    let count = 0;
    setShifts(current => current.map(s => {
      if (s.client === check.client && s.date.startsWith(`${activeCheckMonth}-`) && !s.settled) { count += 1; return setSettled(s, true); }
      return s;
    }));
    setMessage(count > 0 ? `${count} ${count === 1 ? 'record' : 'records'} settled and locked for ${check.client}.` : 'Nothing left to settle here.');
  }
  async function exportMarkup(markup: string) {
    try {
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([markup], { type: 'text/html' }));
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const result = await Print.printToFileAsync({ html: markup });
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Share pay record' });
      }
      setMessage('Review the packet before sharing it.');
    } catch { setMessage('The packet could not be created. Try CSV export.'); }
  }
  function exportPacket(name: string) {
    if (!plus) { setMessage('PDF evidence packets are part of Plus. Your CSV export stays free.'); setTab('plus'); return; }
    return exportMarkup(disputePacket(shifts, name));
  }
  function exportMonthly(month: string) {
    if (!plus) { setMessage('Monthly PDF reports are part of Plus.'); setTab('plus'); return; }
    return exportMarkup(monthlyPacket(shifts, month));
  }
  function removeShift(id: string) {
    const remove = () => { setShifts(current => current.filter(s => s.id !== id)); setMessage('Shift removed.'); };
    if (Platform.OS === 'web') { if (window.confirm('Remove this shift and its payments?')) remove(); }
    else Alert.alert('Remove shift?', 'This removes its payment record too.', [{ text: 'Keep shift', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: remove }]);
  }
  async function purchase(restore = false, packageIdentifier?: string) {
    try { const active = restore ? await restorePlus() : await buyPlus(packageIdentifier); setPlus(active); setMessage(active ? 'Plus is active. Enjoy the full reports.' : 'No active Plus purchase was found.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'The store is unavailable.'); }
  }
  function loadDemo() {
    if (hasDemo) { setMessage('Demo data is already in your log.'); return; }
    setShifts(current => [...demoShifts(new Date()), ...current]);
    setMessage('Demo month loaded: three clients, a few short payments. Try Payout check.');
    setTab('home');
  }
  function clearDemo() {
    setShifts(current => current.filter(s => !s.id.startsWith('demo-')));
    setMessage('Demo data removed. Your own records were kept.');
  }
  function startShift() {
    if (!startClient.trim()) { setMessage('Add who you are working for first.'); return; }
    if (!Number.isFinite(Number(startRate)) || Number(startRate) <= 0) { setMessage('Add the agreed rate first.'); return; }
    const nowIso = new Date().toISOString();
    setActive({ client: startClient.trim(), rate: startRate, unit: startUnit, startedAt: nowIso, accumulatedMs: 0, runningSince: nowIso, breaks: 0, tasks: 0, note: '' });
    setMessage('Shift started. I will keep the clock, you keep working.');
  }
  function pauseResume() {
    if (!active) return;
    if (active.runningSince) setActive({ ...active, accumulatedMs: active.accumulatedMs + Math.max(0, Date.now() - Date.parse(active.runningSince)), runningSince: null, breaks: active.breaks + 1 });
    else setActive({ ...active, runningSince: new Date().toISOString() });
  }
  function endShift() {
    if (!active) return;
    try {
      const totalMs = elapsedMs;
      const finalUnits = active.unit === 'hour' ? msToHours(totalMs) : active.unit === 'task' ? active.tasks : 1;
      if (finalUnits <= 0) throw new Error(active.unit === 'task' ? 'Add at least one task before ending.' : 'This shift is too short to record.');
      const shift = makeShift({ date: localToday(), client: active.client, units: finalUnits, unit: active.unit, rate: Number(active.rate), received: 0, note: active.note.trim() || 'Timed shift' });
      setShifts(current => [shift, ...current]);
      setActive(null);
      setMessage(`Shift saved: ${fmtUnits(shift.units)} ${unitLabel(shift.unit, shift.units)} for ${shift.client}. Now check what you are owed.`);
      setTab('check'); setCheckClient(shift.client); setCheckMonth(currentMonth());
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not end this shift.'); }
  }
  function discardShift() {
    const discard = () => { setActive(null); setMessage('Timer discarded. Nothing was saved.'); };
    if (Platform.OS === 'web') { if (window.confirm('Discard this timed shift?')) discard(); }
    else Alert.alert('Discard shift?', 'The timer and its counts will be lost.', [{ text: 'Keep timing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: discard }]);
  }

  return <SafeAreaView style={s.screen}><StatusBar style="dark" />
    <View style={s.header}><View style={s.mark}><Text style={s.markText}>P</Text></View><Text style={s.brand}>ProofPocket</Text><Text style={s.headerTag}>PRIVATE PAY LOG</Text></View>
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      {tab === 'home' && <>
        <Text style={s.kicker}>YOUR WORK, IN WRITING</Text><Text style={s.title}>Know what you're owed.</Text>
        <Text style={s.lede}>Log each shift and payment. When pay comes in short, you will know exactly how short.</Text>
        <View style={s.hero}><Text style={s.heroLabel}>{thisMonth.owed > 0 ? `MISSING PAY · ${monthName(thisMonth.month).toUpperCase()}` : `STILL OWED TO YOU`}</Text><Text style={[s.heroAmount, thisMonth.owed > 0 && s.heroMissing]}>{cash(thisMonth.owed > 0 ? thisMonth.owed : sum.owed)}</Text><View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.round(monthRatio * 100)}%` }]} /></View><Text style={s.heroFoot}>Received {cash(thisMonth.received)} of {cash(thisMonth.promised)} expected in {monthName(thisMonth.month)} · {cash(sum.owed)} still owed overall · Stored only on this device</Text></View>
        {active && <TouchableOpacity style={s.liveCard} onPress={() => setTab('timer')}><View><Text style={s.liveTitle}>On shift now · {active.client}</Text><Text style={s.muted}>{active.runningSince ? 'Clock running' : 'On a break'} · {active.breaks} {active.breaks === 1 ? 'break' : 'breaks'}{active.tasks > 0 ? ` · ${active.tasks} tasks` : ''}</Text></View><Text style={s.liveClock}>{formatDuration(elapsedMs)}</Text></TouchableOpacity>}
        <View style={s.quickRow}>
          <TouchableOpacity style={s.quickButton} onPress={() => setTab('timer')}><Text style={s.quickText}>▶  Start shift</Text></TouchableOpacity>
          <TouchableOpacity style={s.quickButton} onPress={() => setTab('add')}><Text style={s.quickText}>+  Past shift</Text></TouchableOpacity>
          <TouchableOpacity style={s.quickButton} onPress={() => setTab('check')}><Text style={s.quickText}>✓  Payout check</Text></TouchableOpacity>
        </View>
        <View style={s.section}><Text style={s.sectionTitle}>Your records</Text>{shifts.length > 0 && <TouchableOpacity onPress={() => Share.share({ message: toCsv(shifts), title: 'ProofPocket pay record' }).catch(() => setMessage('Sharing is unavailable.'))}><Text style={s.link}>Share CSV</Text></TouchableOpacity>}</View>
        {shifts.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>Every fair payment starts with a record.</Text><Text style={s.emptyBody}>Start the timer when work begins, or record a past shift. New here? Load the demo month and see a payout check in seconds.</Text><View style={s.quickRow}><TouchableOpacity style={s.quickButton} onPress={() => setTab('timer')}><Text style={s.quickText}>▶  Start shift</Text></TouchableOpacity><TouchableOpacity style={s.quickButton} onPress={loadDemo}><Text style={s.quickText}>Load demo data</Text></TouchableOpacity></View></View> : shifts.map(shift => {
          const owed = amountOwed(shift);
          const locked = isLocked(shift);
          return <View key={shift.id} style={s.record}><View style={s.row}><Text style={s.recordTitle}>{shift.client}</Text><Text style={s.muted}>{shift.date}</Text></View><Text style={s.muted}>{fmtUnits(shift.units)} {unitLabel(shift.unit, shift.units)} × {cash(shift.rate)} · Promised {cash(promised(shift))}</Text><Text style={s.muted}>Received {cash(paid(shift))}</Text>{shift.settled ? <Text style={s.settledText}>🔒 Settled · locked</Text> : owed > 0 ? <Text style={s.missingText}>{cash(owed)} outstanding</Text> : <Text style={s.paidText}>Paid in full{locked ? ' · locked' : ''}</Text>}{Boolean(shift.note) && <Text style={s.muted}>{shift.note}</Text>}{shift.payments.map(p => <Text key={p.id} style={s.paymentTimeline}>↳ {p.date} · {cash(p.amount)} {p.reference ? '· ' + p.reference : ''}</Text>)}<View style={s.recordActions}>{!locked && <><TouchableOpacity onPress={() => { setPaymentId(shift.id); setPayment(''); }}><Text style={s.link}>Add payment</Text></TouchableOpacity><TouchableOpacity onPress={() => toggleSettled(shift)}><Text style={s.link}>Mark settled</Text></TouchableOpacity></>}{shift.settled && <TouchableOpacity onPress={() => toggleSettled(shift)}><Text style={s.link}>Unlock</Text></TouchableOpacity>}<TouchableOpacity onPress={() => removeShift(shift.id)}><Text style={s.remove}>Remove</Text></TouchableOpacity></View>{paymentId === shift.id && !locked && <View style={s.paymentRow}><Field label="PAYMENT DATE" value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" /><Field label="AMOUNT RECEIVED (₹)" value={payment} onChangeText={setPayment} placeholder="500" numeric /><Field label="REFERENCE OR METHOD" value={paymentReference} onChangeText={setPaymentReference} placeholder="UPI ID or cash" /><TouchableOpacity style={s.smallButton} onPress={() => savePayment(shift.id)}><Text style={s.buttonText}>Save payment</Text></TouchableOpacity></View>}</View>;
        })}
      </>}
      {tab === 'timer' && <>
        <Text style={s.kicker}>LIVE SHIFT TIMER</Text><Text style={s.title}>Start when work starts.</Text>
        {!active ? <>
          <Text style={s.lede}>The clock runs on this screen and keeps counting if you leave the app. End the shift and it lands in your log, ready for a payout check.</Text>
          <Field label="WHO ARE YOU WORKING FOR" value={startClient} onChangeText={setStartClient} placeholder="Client or company" />
          {clients.length > 0 && <View style={s.chipRow}>{clients.map(c => <TouchableOpacity key={c} style={[s.chip, startClient === c && s.chipActive]} onPress={() => setStartClient(c)}><Text style={[s.chipText, startClient === c && s.chipTextActive]}>{c}</Text></TouchableOpacity>)}</View>}
          <Text style={s.fieldLabel}>PAID BY</Text><UnitPicker value={startUnit} onChange={setStartUnit} />
          <Field label={`AGREED RATE PER ${startUnit.toUpperCase()} (₹)`} value={startRate} onChangeText={setStartRate} placeholder={startUnit === 'task' ? '45' : '500'} numeric />
          <TouchableOpacity style={s.button} onPress={startShift}><Text style={s.buttonText}>▶  Start shift</Text></TouchableOpacity>
          <Text style={s.fine}>Works offline. Nothing leaves this device.</Text>
        </> : <>
          <Text style={s.lede}>{active.client} · {cash(Number(active.rate) || 0)} per {active.unit}{active.runningSince ? ' · clock running' : ' · on a break'}</Text>
          <View style={s.timerCard}><Text style={s.timerClock}>{formatDuration(elapsedMs)}</Text><Text style={s.muted}>Started {active.startedAt.slice(0, 10)} · {active.breaks} {active.breaks === 1 ? 'break' : 'breaks'} taken</Text></View>
          <View style={s.counterRow}><TouchableOpacity style={s.counterButton} onPress={() => setActive({ ...active, tasks: Math.max(0, active.tasks - 1) })}><Text style={s.counterSymbol}>−</Text></TouchableOpacity><View style={s.counterMiddle}><Text style={s.counterValue}>{active.tasks}</Text><Text style={s.muted}>tasks / deliveries</Text></View><TouchableOpacity style={s.counterButton} onPress={() => setActive({ ...active, tasks: active.tasks + 1 })}><Text style={s.counterSymbol}>+</Text></TouchableOpacity></View>
          <Field label="OPTIONAL NOTE" value={active.note} onChangeText={value => setActive({ ...active, note: value })} placeholder="Zone, order count, anything worth remembering" />
          <TouchableOpacity style={s.button} onPress={pauseResume}><Text style={s.buttonText}>{active.runningSince ? '⏸  Take a break' : '▶  Back to work'}</Text></TouchableOpacity>
          <TouchableOpacity style={[s.button, s.endButton]} onPress={endShift}><Text style={s.buttonText}>■  End shift and save</Text></TouchableOpacity>
          <TouchableOpacity style={s.restore} onPress={discardShift}><Text style={s.remove}>Discard timer</Text></TouchableOpacity>
        </>}
      </>}
      {tab === 'add' && <><Text style={s.kicker}>NEW RECORD</Text><Text style={s.title}>Record a past shift.</Text><Text style={s.lede}>Write down the terms while they are fresh. Export your records anytime.</Text>
        <Field label="DATE" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        <Field label="WHO OWES YOU" value={client} onChangeText={setClient} placeholder="Client or company" />
        {clients.length > 0 && <View style={s.chipRow}>{clients.map(c => <TouchableOpacity key={c} style={[s.chip, client === c && s.chipActive]} onPress={() => setClient(c)}><Text style={[s.chipText, client === c && s.chipTextActive]}>{c}</Text></TouchableOpacity>)}</View>}
        <Text style={s.fieldLabel}>PAID BY</Text><UnitPicker value={unit} onChange={setUnit} />
        <Field label={UNITS.find(u => u.key === unit)?.work ?? 'WORK DONE'} value={units} onChangeText={setUnits} placeholder={unit === 'task' ? '240' : '8'} numeric />
        <Field label={`RATE PER ${unit.toUpperCase()} (₹)`} value={rate} onChangeText={setRate} placeholder={unit === 'task' ? '45' : '500'} numeric />
        <Field label="ALREADY RECEIVED (₹)" value={received} onChangeText={setReceived} placeholder="0" numeric />
        <Field label="OPTIONAL NOTE" value={note} onChangeText={setNote} placeholder="Job or payment detail" />
        <TouchableOpacity style={s.button} onPress={save}><Text style={s.buttonText}>Save shift</Text></TouchableOpacity><Text style={s.fine}>This personal log is not legal proof of a contract.</Text>
      </>}
      {tab === 'check' && <><Text style={s.kicker}>PAYOUT CHECK</Text><Text style={s.title}>Did they pay it all?</Text><Text style={s.lede}>Pick a client and a month. Your log does the maths they hope you skip.</Text>
        {clients.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>No shifts yet.</Text><Text style={s.emptyBody}>Record work first, then run a check when the money lands. Or load the demo month and try it now.</Text><TouchableOpacity style={[s.quickButton, s.demoButton]} onPress={loadDemo}><Text style={s.quickText}>Load demo data</Text></TouchableOpacity></View> : <>
          <Text style={s.fieldLabel}>CLIENT</Text><View style={s.chipRow}>{clients.map(c => <TouchableOpacity key={c} style={[s.chip, activeCheckClient === c && s.chipActive]} onPress={() => setCheckClient(c)}><Text style={[s.chipText, activeCheckClient === c && s.chipTextActive]}>{c}</Text></TouchableOpacity>)}</View>
          <Text style={s.fieldLabel}>MONTH</Text><View style={s.chipRow}>{monthKeys.map(k => <TouchableOpacity key={k} style={[s.chip, activeCheckMonth === k && s.chipActive]} onPress={() => setCheckMonth(k)}><Text style={[s.chipText, activeCheckMonth === k && s.chipTextActive]}>{monthName(k)}</Text></TouchableOpacity>)}</View>
          {check && (check.count === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>Nothing logged for {check.client} in {monthName(activeCheckMonth)}.</Text><Text style={s.emptyBody}>Try another month, or record the shift first.</Text></View> : check.missing > 0 ? <View style={s.missingCard}><Text style={s.missingLabel}>MISSING PAY</Text><Text style={s.missingAmount}>{cash(check.missing)}</Text><Text style={s.missingBody}>You logged {fmtUnits(check.units)} {unitLabel(check.unit, check.units)} for {check.client} in {monthName(activeCheckMonth)}. Promised {cash(check.promised)}. They paid {cash(check.received)}, which covers only {fmtUnits(check.paidUnitsEquivalent)} of your {unitLabel(check.unit, check.units)}.</Text><View style={s.missingActions}><TouchableOpacity style={s.missingButton} onPress={() => { setPacketClient(check.client); setTab('packet'); }}><Text style={s.missingButtonText}>Prepare evidence packet</Text></TouchableOpacity><TouchableOpacity style={s.missingGhost} onPress={settleCheckSelection}><Text style={s.missingGhostText}>Mark settled anyway</Text></TouchableOpacity></View></View> : <View style={s.okCard}><Text style={s.okTitle}>Fully paid. ✓</Text><Text style={s.okBody}>{check.client} paid all {cash(check.promised)} for {fmtUnits(check.units)} {unitLabel(check.unit, check.units)} in {monthName(activeCheckMonth)}. Your log agrees with their money.</Text></View>)}
        </>}
      </>}
      {tab === 'packet' && <><Text style={s.kicker}>EVIDENCE PACKET</Text><Text style={s.title}>Make your case clear.</Text><Text style={s.lede}>Choose a client to see the exact gap. Export a dated summary to review and share.</Text>
        {clients.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>No shifts yet.</Text><Text style={s.emptyBody}>Add a shift first. Your packet will collect its terms, payments, and notes.</Text></View> : clients.map(name => {
          const group = shifts.filter(item => item.client === name);
          const itemTotals = totals(group);
          return <TouchableOpacity key={name} style={[s.packetCard, packetClient === name && s.packetSelected]} onPress={() => setPacketClient(name)}><Text style={s.recordTitle}>{name}</Text><Text style={s.muted}>{group.length} {group.length === 1 ? 'shift' : 'shifts'} · {cash(itemTotals.promised)} promised · {cash(itemTotals.received)} received</Text>{itemTotals.owed > 0 ? <Text style={s.packetMissing}>{cash(itemTotals.owed)} missing</Text> : <Text style={s.packetPaid}>Paid in full</Text>}</TouchableOpacity>;
        })}
        {Boolean(packetClient && clients.includes(packetClient)) && <TouchableOpacity style={s.button} onPress={() => exportPacket(packetClient)}><Text style={s.buttonText}>Prepare {packetClient} packet (PDF)</Text></TouchableOpacity>}
        <Text style={s.fine}>PDF packets are part of Plus. Your CSV export from Overview always stays free. This is your personal record; keep source messages or receipts separately.</Text>
        {months.length > 0 && <View style={s.monthSection}><Text style={s.sectionTitle}>Monthly view</Text>{months.map(item => <View key={item.month} style={s.monthRow}><Text style={s.recordTitle}>{monthName(item.month)}</Text><Text style={s.muted}>{item.count} {item.count === 1 ? 'shift' : 'shifts'} · {cash(item.promised)} promised · {cash(item.received)} received</Text>{item.owed > 0 && <Text style={s.missingText}>{cash(item.owed)} missing</Text>}<TouchableOpacity onPress={() => exportMonthly(item.month)}><Text style={s.link}>{plus ? 'Export monthly report (PDF)' : 'Monthly PDF with Plus'}</Text></TouchableOpacity></View>)}</View>}
      </>}
      {tab === 'plus' && <><Text style={s.kicker}>PROOFPOCKET PLUS</Text><Text style={s.title}>Your log stays free.</Text><Text style={s.lede}>Logging shifts, the timer, payout checks and CSV export never need a subscription. Plus turns your log into polished proof.</Text>
        <View style={s.hero}><Text style={s.heroLabel}>PLUS {plus ? '· ACTIVE' : ''}</Text><Text style={s.plusTitle}>{plus ? 'Plus is on' : 'Proof, ready to send'}</Text><Text style={s.plusPrice}>{plus ? 'Thank you for supporting ProofPocket.' : plans.length ? `${plans.map(p => `${p.label} ${p.priceString}`).join(' · ')} · billed by your store` : 'Price shown in your store before you confirm'}</Text>
          <View style={s.benefitList}>
            <Text style={s.benefit}>✓  One-tap PDF evidence packet for any client</Text>
            <Text style={s.benefit}>✓  Monthly PDF pay report across every client</Text>
            <Text style={s.benefit}>✓  Full payment timelines inside every report</Text>
            <Text style={s.benefit}>✓  Built for gig workers, priced for gig workers</Text>
          </View></View>
        {plus ? <View style={s.okCard}><Text style={s.okTitle}>Plus is active on this device.</Text><Text style={s.okBody}>PDF packets and monthly reports are unlocked in the Packet tab.</Text></View> : <>{plans.length > 0 ? plans.map(p => <TouchableOpacity key={p.identifier} style={[s.button, s.planButton]} onPress={() => purchase(false, p.identifier)}><Text style={s.buttonText}>Get Plus · {p.label} · {p.priceString}</Text></TouchableOpacity>) : <TouchableOpacity style={[s.button, !purchasesConfigured && s.disabled]} disabled={!purchasesConfigured} onPress={() => purchase()}><Text style={s.buttonText}>{purchasesConfigured ? 'Get Plus' : 'Store not connected'}</Text></TouchableOpacity>}<TouchableOpacity style={s.restore} onPress={() => purchase(true)}><Text style={s.link}>Restore purchase</Text></TouchableOpacity></>}
        <Text style={s.fine}>{purchasesConfigured ? 'Subscription is handled by your app store via RevenueCat. Cancel anytime in store settings.' : 'This build has no RevenueCat public key configured, so the store is in preview mode. The ledger, timer and payout check work fully offline either way.'}</Text>
        <View style={s.monthSection}><Text style={s.sectionTitle}>Try the full flow</Text><Text style={s.muted}>Load a realistic demo month (three clients, a few short payments), run a payout check, then remove it. Your own records are never touched.</Text><View style={s.quickRow}><TouchableOpacity style={s.quickButton} onPress={loadDemo}><Text style={s.quickText}>Load demo data</Text></TouchableOpacity>{hasDemo && <TouchableOpacity style={s.quickButton} onPress={clearDemo}><Text style={s.quickText}>Remove demo data</Text></TouchableOpacity>}</View></View>
      </>}
      {Boolean(message) && <Text accessibilityRole="alert" style={s.notice}>{message}</Text>}
    </ScrollView>
    <View style={s.nav}>{([['home', 'Overview'], ['timer', 'Timer'], ['check', 'Check'], ['packet', 'Packet'], ['plus', 'Plus']] as Array<[Tab, string]>).map(([key, label]) => <TouchableOpacity key={key} style={s.navItem} onPress={() => { setMessage(''); setTab(key); }}><Text style={[s.navText, tab === key && s.navActive]}>{label}</Text></TouchableOpacity>)}</View>
  </SafeAreaView>;
}

function Field(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; numeric?: boolean }) {
  return <View style={s.field}><Text style={s.fieldLabel}>{props.label}</Text><TextInput style={s.input} value={props.value} onChangeText={props.onChangeText} placeholder={props.placeholder} placeholderTextColor="#829398" keyboardType={props.numeric ? 'decimal-pad' : 'default'} /></View>;
}

function UnitPicker(props: { value: ShiftUnit; onChange: (u: ShiftUnit) => void }) {
  return <View style={s.segRow}>{UNITS.map(u => <TouchableOpacity key={u.key} style={[s.seg, props.value === u.key && s.segActive]} onPress={() => props.onChange(u.key)}><Text style={[s.segText, props.value === u.key && s.segTextActive]}>{u.label}</Text></TouchableOpacity>)}</View>;
}

const s = StyleSheet.create({
  insight: { paddingVertical: 18, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: '#DCE7E2', marginTop: 16 },
  insightTitle: { fontSize: 15, fontWeight: '800', color: '#172C38' },
  insightBody: { fontSize: 13, lineHeight: 20, marginTop: 5, color: '#526973' },
  recordActions: { flexDirection: 'row', gap: 24, marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderColor: '#E1EAE5' },
  remove: { color: '#9B4B45', fontSize: 13, fontWeight: '700' },
  paymentRow: { marginTop: 12, gap: 8 },
  paymentInput: { flex: 1 },
  paymentTimeline: { color: '#526973', marginTop: 8, fontSize: 12 },
  smallButton: { backgroundColor: '#086C65', borderRadius: 10, paddingVertical: 13, alignItems: 'center', minWidth: 84 },
  packetCard: { backgroundColor: 'white', borderWidth: 1, borderColor: '#DCE7E2', padding: 18, borderRadius: 15, marginBottom: 10 },
  packetSelected: { borderColor: '#086C65', borderWidth: 2 },
  packetAmount: { color: '#086C65', fontSize: 20, fontWeight: '800', marginTop: 10 },
  packetMissing: { color: '#B3261E', fontSize: 20, fontWeight: '800', marginTop: 10 },
  packetPaid: { color: '#086C65', fontSize: 20, fontWeight: '800', marginTop: 10 },
  monthSection: { marginTop: 32 },
  monthRow: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#DCE7E2' },
  screen: { flex: 1, backgroundColor: '#F7FAF7' }, header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#E1EAE5' }, mark: { width: 31, height: 31, borderRadius: 8, backgroundColor: '#086C65', alignItems: 'center', justifyContent: 'center', marginRight: 9 }, markText: { color: 'white', fontWeight: '800', fontSize: 19 }, brand: { color: '#172C38', fontSize: 18, fontWeight: '800' }, headerTag: { marginLeft: 'auto', color: '#829398', fontSize: 9, fontWeight: '800', letterSpacing: 1 }, body: { padding: 24, paddingBottom: 50 }, kicker: { color: '#086C65', fontWeight: '800', fontSize: 11, letterSpacing: 1.5, marginBottom: 13 }, title: { color: '#172C38', fontSize: 38, lineHeight: 41, fontWeight: '800', letterSpacing: -1.7 }, lede: { color: '#526973', fontSize: 15, lineHeight: 23, marginTop: 12, marginBottom: 27 }, hero: { backgroundColor: '#103D3C', borderRadius: 20, padding: 24, minHeight: 155 }, heroLabel: { color: '#B8E5D1', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, heroAmount: { color: 'white', fontSize: 42, fontWeight: '800', marginTop: 10 }, heroMissing: { color: '#FF8A75' }, heroFoot: { color: '#C8DBD6', fontSize: 12, marginTop: 11, lineHeight: 19 }, progressTrack: { height: 6, borderRadius: 3, backgroundColor: '#1E5652', marginTop: 18 }, progressFill: { height: 6, borderRadius: 3, backgroundColor: '#7BDDB8' }, stats: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 23, paddingHorizontal: 4 }, statLabel: { color: '#829398', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, statValue: { color: '#172C38', fontSize: 19, fontWeight: '800', marginTop: 6 }, button: { backgroundColor: '#086C65', borderRadius: 13, alignItems: 'center', paddingVertical: 17, marginTop: 5 }, buttonText: { color: 'white', fontWeight: '800', fontSize: 16 }, planButton: { marginTop: 10 }, endButton: { backgroundColor: '#103D3C', marginTop: 12 }, disabled: { backgroundColor: '#9CB5AD' }, section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 33, marginBottom: 15 }, sectionTitle: { color: '#172C38', fontSize: 21, fontWeight: '800' }, link: { color: '#086C65', fontWeight: '800', fontSize: 13 }, empty: { backgroundColor: '#EBF3EF', borderRadius: 16, padding: 22 }, emptyTitle: { color: '#172C38', fontSize: 17, lineHeight: 23, fontWeight: '800' }, emptyBody: { color: '#526973', fontSize: 13, lineHeight: 21, marginTop: 8 }, record: { backgroundColor: 'white', borderWidth: 1, borderColor: '#E1EAE5', borderRadius: 15, padding: 17, marginBottom: 10 }, row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, recordTitle: { color: '#172C38', fontWeight: '800', fontSize: 16 }, muted: { color: '#526973', fontSize: 12, marginTop: 4 }, owed: { color: '#086C65', fontWeight: '800', fontSize: 13, marginTop: 10 }, missingText: { color: '#B3261E', fontWeight: '800', fontSize: 13, marginTop: 10 }, paidText: { color: '#086C65', fontWeight: '800', fontSize: 13, marginTop: 10 }, settledText: { color: '#526973', fontWeight: '800', fontSize: 13, marginTop: 10 }, field: { marginBottom: 17 }, fieldLabel: { color: '#526973', fontWeight: '800', fontSize: 11, letterSpacing: 1, marginBottom: 8 }, input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#DCE7E2', borderRadius: 12, padding: 15, color: '#172C38', fontSize: 16 }, fine: { color: '#829398', fontSize: 12, lineHeight: 19, marginTop: 19 }, plusTitle: { color: 'white', fontSize: 31, fontWeight: '800', marginTop: 14 }, plusPrice: { color: '#B8E5D1', fontSize: 14, marginTop: 8 }, benefitList: { marginTop: 18, gap: 9 }, benefit: { color: 'white', fontSize: 14, fontWeight: '600' }, restore: { alignItems: 'center', padding: 17 }, notice: { backgroundColor: '#E7F4EE', color: '#086C65', padding: 14, borderRadius: 10, marginTop: 22, lineHeight: 20 }, nav: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#E1EAE5', backgroundColor: 'white', paddingBottom: 9, paddingTop: 13 }, navItem: { flex: 1, alignItems: 'center', paddingVertical: 7 }, navText: { color: '#829398', fontWeight: '700', fontSize: 12 }, navActive: { color: '#086C65' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }, quickButton: { backgroundColor: 'white', borderWidth: 1, borderColor: '#BFD8CF', borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14 }, quickText: { color: '#086C65', fontWeight: '800', fontSize: 13 }, demoButton: { marginTop: 14, alignSelf: 'flex-start' },
  liveCard: { backgroundColor: 'white', borderWidth: 1, borderColor: '#DCE7E2', borderRadius: 15, padding: 17, marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, liveTitle: { color: '#172C38', fontWeight: '800', fontSize: 15 }, liveClock: { color: '#086C65', fontWeight: '800', fontSize: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 17 }, chip: { borderWidth: 1, borderColor: '#BFD8CF', backgroundColor: 'white', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13 }, chipActive: { backgroundColor: '#086C65', borderColor: '#086C65' }, chipText: { color: '#086C65', fontWeight: '700', fontSize: 13 }, chipTextActive: { color: 'white' },
  segRow: { flexDirection: 'row', gap: 8, marginBottom: 17 }, seg: { flex: 1, borderWidth: 1, borderColor: '#BFD8CF', backgroundColor: 'white', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }, segActive: { backgroundColor: '#103D3C', borderColor: '#103D3C' }, segText: { color: '#526973', fontWeight: '800', fontSize: 13 }, segTextActive: { color: 'white' },
  timerCard: { backgroundColor: '#103D3C', borderRadius: 20, padding: 24, alignItems: 'center' }, timerClock: { color: 'white', fontSize: 52, fontWeight: '800', letterSpacing: 1 }, counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginVertical: 20 }, counterButton: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#086C65', alignItems: 'center', justifyContent: 'center' }, counterSymbol: { color: 'white', fontSize: 26, fontWeight: '800' }, counterMiddle: { alignItems: 'center', minWidth: 90 }, counterValue: { color: '#172C38', fontSize: 30, fontWeight: '800' },
  missingCard: { backgroundColor: '#B3261E', borderRadius: 20, padding: 24, marginTop: 6 }, missingLabel: { color: '#FFD9D4', fontSize: 11, fontWeight: '800', letterSpacing: 1.4 }, missingAmount: { color: 'white', fontSize: 48, fontWeight: '800', marginTop: 10 }, missingBody: { color: '#FFE9E6', fontSize: 14, lineHeight: 22, marginTop: 10 }, missingActions: { marginTop: 18, gap: 10 }, missingButton: { backgroundColor: 'white', borderRadius: 12, alignItems: 'center', paddingVertical: 14 }, missingButtonText: { color: '#B3261E', fontWeight: '800', fontSize: 15 }, missingGhost: { borderWidth: 1, borderColor: '#FFB4A8', borderRadius: 12, alignItems: 'center', paddingVertical: 13 }, missingGhostText: { color: 'white', fontWeight: '700', fontSize: 14 },
  okCard: { backgroundColor: '#E7F4EE', borderRadius: 16, padding: 22, marginTop: 6 }, okTitle: { color: '#086C65', fontSize: 19, fontWeight: '800' }, okBody: { color: '#526973', fontSize: 14, lineHeight: 21, marginTop: 7 },
});
