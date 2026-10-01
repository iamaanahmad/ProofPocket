import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { MaterialIcons } from '@expo/vector-icons';
import { addPayment, amountOwed, demoShifts, disputePacket, formatDuration, isLocked, makeShift, monthlyPacket, monthlySummary, msToHours, paid, parseShifts, payoutCheck, promised, setSettled, Shift, ShiftUnit, toCsv, totals, unitLabel } from './ledger';
import { buyPlus, configurePurchases, getPlusPackages, getPlusStatus, PlusPackage, purchasesConfigured, restorePlus } from './purchases';
import { color, elevation, radius, spacing, type } from './theme';

const KEY = 'proofpocket.shifts.v1';
const ACTIVE_KEY = 'proofpocket.active.v1';
const cash = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (key: string) => { const [y, m] = key.split('-').map(Number); return `${MONTH_NAMES[(m || 1) - 1]} ${y}`; };
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const currentMonth = () => localToday().slice(0, 7);
const fmtUnits = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '').replace(/\.$/, ''));
const initials = (name: string) => name.split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
const UNITS: Array<{ key: ShiftUnit; label: string; work: string }> = [
  { key: 'hour', label: 'Per hour', work: 'HOURS WORKED' },
  { key: 'task', label: 'Per task', work: 'TASKS COMPLETED' },
  { key: 'day', label: 'Per day', work: 'DAYS WORKED' },
];

type Tab = 'home' | 'timer' | 'add' | 'check' | 'packet' | 'plus';
type ActiveShift = { client: string; rate: string; unit: ShiftUnit; startedAt: string; accumulatedMs: number; runningSince: string | null; breaks: number; tasks: number; note: string };

const ripple = { color: 'rgba(10, 51, 46, 0.10)', borderless: false } as const;

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
  const [selectedPlan, setSelectedPlan] = useState('');
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
  const snackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  useEffect(() => {
    if (!plans.length) return;
    setSelectedPlan(current => (current && plans.some(p => p.identifier === current) ? current : (plans.find(p => p.label === 'Monthly') ?? plans[0]).identifier));
  }, [plans]);
  useEffect(() => {
    if (!message) return;
    if (snackTimer.current) clearTimeout(snackTimer.current);
    snackTimer.current = setTimeout(() => setMessage(''), 5000);
    return () => { if (snackTimer.current) clearTimeout(snackTimer.current); };
  }, [message]);

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
  async function exportCsv() {
    try {
      if (Platform.OS === 'web') {
        const blob = new Blob([toCsv(shifts)], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'proofpocket.csv'; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMessage('CSV downloaded.');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const uri = `${FileSystem.cacheDirectory}proofpocket-${stamp}.csv`;
      await FileSystem.writeAsStringAsync(uri, toCsv(shifts), { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Share pay record CSV', UTI: 'public.comma-separated-values-text' });
      setMessage('Review the CSV before sharing it.');
    } catch { setMessage('The CSV could not be shared.'); }
  }

  async function exportMarkup(markup: string) {
    if (Platform.OS === 'web') {
      try {
        const url = URL.createObjectURL(new Blob([markup], { type: 'text/html' }));
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMessage('Review the packet before sharing it.');
      } catch { setMessage('The packet could not be opened in this browser.'); }
      return;
    }
    // Try to create a PDF file and share it. If the native printer module
    // cannot write a file (e.g. Expo Go sandbox), fall back to the system
    // print dialog which works in all environments.
    try {
      const result = await Print.printToFileAsync({ html: markup });
      await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf', dialogTitle: 'Share pay record' });
      setMessage('Review the packet before sharing it.');
    } catch (fileErr) {
      try {
        await Print.printAsync({ html: markup });
        setMessage('Review the packet before sharing it.');
      } catch (printErr) {
        const reason = printErr instanceof Error ? printErr.message : String(printErr);
        setMessage(`Could not open the printer: ${reason}`);
      }
    }
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
    try {
      const nowActive = restore ? await restorePlus() : await buyPlus(packageIdentifier);
      setPlus(nowActive);
      setMessage(nowActive ? 'Plus is active. Enjoy the full reports.' : 'No active Plus purchase was found.');
    } catch (e: any) {
      // RevenueCat throws a plain object (not an Error) with userCancelled = true
      // when the user dismisses the sheet or a sandbox purchase is declined.
      if (e?.userCancelled === true || e?.code === 'PURCHASE_CANCELLED') return;
      // Extract message from whatever shape RevenueCat throws (plain object or Error)
      const msg = typeof e?.message === 'string' ? e.message : typeof e === 'string' ? e : '';
      const clean = msg.replace(/^RCPurchasesErrorCode\s*\d*:?\s*/i, '').trim();
      setMessage(clean || 'The purchase could not be completed. Try again.');
    }
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
  function go(next: Tab) { setTab(next); }

  const progressPct = `${Math.round(monthRatio * 100)}%`;

  return <SafeAreaProvider><SafeAreaView style={s.screen} edges={['top', 'left', 'right']}><StatusBar style="dark" />
    <View style={s.appBar}>
      <View style={s.mark}><MaterialIcons name="receipt-long" size={19} color={color.onPrimary} /></View>
      <Text style={s.brand}>ProofPocket</Text>
      <Pressable accessibilityLabel={plus ? 'Plus is active' : 'Open Plus'} onPress={() => go('plus')} android_ripple={ripple} style={({ pressed }) => [s.appBarAction, pressed && s.pressed]}>
        <MaterialIcons name="workspace-premium" size={23} color={plus ? color.primary : color.onSurfaceVariant} />
      </Pressable>
    </View>
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      {tab === 'home' && <>
        <Text style={s.overline}>YOUR WORK, IN WRITING</Text>
        <Text style={s.headline}>Know what you're owed.</Text>
        <Text style={s.lede}>Log each shift and payment. When pay comes in short, you will know exactly how short.</Text>
        <View style={s.hero}>
          <View style={s.heroTop}>
            <Text style={s.heroLabel}>{monthName(thisMonth.month).toUpperCase()}</Text>
            {thisMonth.owed > 0
              ? <View style={s.stateChipError}><MaterialIcons name="error-outline" size={14} color={color.errorOnDark} /><Text style={s.stateChipErrorText}>Missing pay</Text></View>
              : <View style={s.stateChipOk}><MaterialIcons name="verified" size={14} color={color.onPrimaryContainer} /><Text style={s.stateChipOkText}>{thisMonth.count > 0 ? 'All paid' : 'On track'}</Text></View>}
          </View>
          <Text style={[s.heroAmount, thisMonth.owed > 0 && s.heroAmountMissing]}>{cash(thisMonth.owed > 0 ? thisMonth.owed : sum.owed)}</Text>
          <Text style={s.heroCaption}>{thisMonth.owed > 0 ? `not yet paid for ${monthName(thisMonth.month)}` : 'still owed to you, all time'}</Text>
          <View style={s.progressTrack}><View style={[s.progressFill, { width: progressPct as `${number}%` }]} /></View>
          <Text style={s.heroFoot}>Received {cash(thisMonth.received)} of {cash(thisMonth.promised)} expected this month. {cash(sum.owed)} still owed overall.</Text>
          <View style={s.heroMeta}><MaterialIcons name="lock" size={13} color={color.onSurfaceDarkMuted} /><Text style={s.heroMetaText}>Stored only on this device. No account, no server.</Text></View>
        </View>
        {active && <Pressable onPress={() => go('timer')} android_ripple={ripple} style={({ pressed }) => [s.liveCard, pressed && s.pressed]}>
          <View style={s.liveIcon}><MaterialIcons name="timer" size={21} color={color.onPrimaryContainer} /></View>
          <View style={s.liveText}>
            <Text style={s.titleSm}>{active.client}</Text>
            <Text style={s.supporting}>{active.runningSince ? 'Clock running' : 'On a break'} · {active.breaks} {active.breaks === 1 ? 'break' : 'breaks'}{active.tasks > 0 ? ` · ${active.tasks} tasks` : ''}</Text>
          </View>
          <Text style={s.liveClock}>{formatDuration(elapsedMs)}</Text>
        </Pressable>}
        <View style={s.quickRow}>
          <Pressable onPress={() => go('timer')} android_ripple={ripple} style={({ pressed }) => [s.tonalBtn, pressed && s.pressed]}>
            <MaterialIcons name="play-arrow" size={19} color={color.onPrimaryContainer} /><Text style={s.tonalBtnText}>Start shift</Text>
          </Pressable>
          <Pressable onPress={() => go('check')} android_ripple={ripple} style={({ pressed }) => [s.tonalBtn, pressed && s.pressed]}>
            <MaterialIcons name="fact-check" size={19} color={color.onPrimaryContainer} /><Text style={s.tonalBtnText}>Payout check</Text>
          </Pressable>
        </View>
        <View style={s.sectionHead}>
          <Text style={s.title}>Your records</Text>
          {shifts.length > 0 && <Pressable onPress={exportCsv} android_ripple={ripple} style={({ pressed }) => [s.textBtn, pressed && s.pressed]}>
            <MaterialIcons name="share" size={16} color={color.primary} /><Text style={s.textBtnText}>Share CSV</Text>
          </Pressable>}
        </View>
        {shifts.length === 0 ? <View style={s.empty}>
          <View style={s.emptyIcon}><MaterialIcons name="receipt-long" size={30} color={color.primary} /></View>
          <Text style={s.emptyTitle}>Every fair payment starts with a record.</Text>
          <Text style={s.emptyBody}>Start the timer when work begins, or record a past shift. New here? Load the demo month and see a payout check in seconds.</Text>
          <Pressable onPress={loadDemo} android_ripple={ripple} style={({ pressed }) => [s.filledBtn, s.emptyBtn, pressed && s.pressed]}>
            <MaterialIcons name="play-arrow" size={19} color={color.onPrimary} /><Text style={s.filledBtnText}>Load demo data</Text>
          </Pressable>
        </View> : shifts.map(shift => {
          const owed = amountOwed(shift);
          const locked = isLocked(shift);
          return <View key={shift.id} style={s.record}>
            <View style={s.recordHead}>
              <View style={s.avatar}><Text style={s.avatarText}>{initials(shift.client)}</Text></View>
              <View style={s.recordTitles}>
                <Text style={s.titleSm}>{shift.client}</Text>
                <Text style={s.supporting}>{shift.date} · {fmtUnits(shift.units)} {unitLabel(shift.unit, shift.units)} × {cash(shift.rate)}</Text>
              </View>
              {shift.settled
                ? <View style={s.statusChip}><MaterialIcons name="lock" size={13} color={color.onSurfaceVariant} /><Text style={s.statusChipText}>Settled</Text></View>
                : owed > 0
                  ? <View style={s.statusChipError}><MaterialIcons name="error-outline" size={13} color={color.error} /><Text style={s.statusChipErrorText}>{cash(owed)} due</Text></View>
                  : <View style={s.statusChip}><MaterialIcons name="check" size={13} color={color.primary} /><Text style={s.statusChipText}>Paid</Text></View>}
            </View>
            <View style={s.amountRow}>
              <Text style={s.amountCell}>Promised <Text style={s.amountStrong}>{cash(promised(shift))}</Text></Text>
              <Text style={s.amountCell}>Received <Text style={s.amountStrong}>{cash(paid(shift))}</Text></Text>
            </View>
            {Boolean(shift.note) && <Text style={s.note}>{shift.note}</Text>}
            {shift.payments.length > 0 && <View style={s.timeline}>
              {shift.payments.map(p => <View key={p.id} style={s.timelineRow}>
                <MaterialIcons name="payments" size={15} color={color.onSurfaceVariant} />
                <Text style={s.timelineText}>{p.date} · {cash(p.amount)}{p.reference ? ` · ${p.reference}` : ''}</Text>
              </View>)}
            </View>}
            <View style={s.recordActions}>
              {!locked && <>
                <Pressable onPress={() => { setPaymentId(shift.id); setPayment(''); }} android_ripple={ripple} style={({ pressed }) => [s.textBtn, pressed && s.pressed]}><Text style={s.textBtnText}>Add payment</Text></Pressable>
                <Pressable onPress={() => toggleSettled(shift)} android_ripple={ripple} style={({ pressed }) => [s.textBtn, pressed && s.pressed]}><Text style={s.textBtnText}>Mark settled</Text></Pressable>
              </>}
              {shift.settled && <Pressable onPress={() => toggleSettled(shift)} android_ripple={ripple} style={({ pressed }) => [s.textBtn, pressed && s.pressed]}><Text style={s.textBtnText}>Unlock</Text></Pressable>}
              <Pressable onPress={() => removeShift(shift.id)} android_ripple={ripple} style={({ pressed }) => [s.textBtn, pressed && s.pressed]}><Text style={s.textBtnDanger}>Remove</Text></Pressable>
            </View>
            {paymentId === shift.id && !locked && <View style={s.paymentForm}>
              <Field label="PAYMENT DATE" value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" />
              <Field label="AMOUNT RECEIVED (₹)" value={payment} onChangeText={setPayment} placeholder="500" numeric />
              <Field label="REFERENCE OR METHOD" value={paymentReference} onChangeText={setPaymentReference} placeholder="UPI ID or cash" />
              <Pressable onPress={() => savePayment(shift.id)} android_ripple={ripple} style={({ pressed }) => [s.filledBtn, pressed && s.pressed]}>
                <MaterialIcons name="check" size={19} color={color.onPrimary} /><Text style={s.filledBtnText}>Save payment</Text>
              </Pressable>
            </View>}
          </View>;
        })}
      </>}
      {tab === 'timer' && <>
        <Text style={s.overline}>LIVE SHIFT TIMER</Text>
        <Text style={s.headline}>Start when work starts.</Text>
        {!active ? <>
          <Text style={s.lede}>The clock keeps counting if you leave the app. End the shift and it lands in your log, ready for a payout check.</Text>
          <Field label="WHO ARE YOU WORKING FOR" value={startClient} onChangeText={setStartClient} placeholder="Client or company" />
          {clients.length > 0 && <View style={s.chipRow}>{clients.map(c => <Chip key={c} label={c} active={startClient === c} onPress={() => setStartClient(c)} />)}</View>}
          <Text style={s.fieldLabel}>PAID BY</Text>
          <UnitPicker value={startUnit} onChange={setStartUnit} />
          <Field label={`AGREED RATE PER ${startUnit.toUpperCase()} (₹)`} value={startRate} onChangeText={setStartRate} placeholder={startUnit === 'task' ? '45' : '500'} numeric />
          <Pressable onPress={startShift} android_ripple={ripple} style={({ pressed }) => [s.filledBtn, pressed && s.pressed]}>
            <MaterialIcons name="play-arrow" size={20} color={color.onPrimary} /><Text style={s.filledBtnText}>Start shift</Text>
          </Pressable>
          <Text style={s.fine}>Works fully offline. Nothing leaves this device.</Text>
        </> : <>
          <Text style={s.lede}>{active.client} · {cash(Number(active.rate) || 0)} per {active.unit}</Text>
          <View style={s.timerCard}>
            <View style={active.runningSince ? s.stateChipOk : s.stateChipWarn}>
              <View style={[s.stateDot, { backgroundColor: active.runningSince ? color.primary : '#B97B0F' }]} />
              <Text style={active.runningSince ? s.stateChipOkText : s.stateChipWarnText}>{active.runningSince ? 'Clock running' : 'On a break'}</Text>
            </View>
            <Text style={s.timerClock}>{formatDuration(elapsedMs)}</Text>
            <Text style={s.timerMeta}>Started {active.startedAt.slice(0, 10)} · {active.breaks} {active.breaks === 1 ? 'break' : 'breaks'} taken</Text>
          </View>
          <View style={s.counterRow}>
            <Pressable accessibilityLabel="One less task" onPress={() => setActive({ ...active, tasks: Math.max(0, active.tasks - 1) })} android_ripple={ripple} style={({ pressed }) => [s.counterBtn, pressed && s.pressed]}>
              <MaterialIcons name="remove" size={24} color={color.onPrimaryContainer} />
            </Pressable>
            <View style={s.counterMiddle}>
              <Text style={s.counterValue}>{active.tasks}</Text>
              <Text style={s.supporting}>tasks / deliveries</Text>
            </View>
            <Pressable accessibilityLabel="One more task" onPress={() => setActive({ ...active, tasks: active.tasks + 1 })} android_ripple={ripple} style={({ pressed }) => [s.counterBtn, pressed && s.pressed]}>
              <MaterialIcons name="add" size={24} color={color.onPrimaryContainer} />
            </Pressable>
          </View>
          <Field label="OPTIONAL NOTE" value={active.note} onChangeText={value => setActive({ ...active, note: value })} placeholder="Zone, order count, note" />
          <Pressable onPress={pauseResume} android_ripple={ripple} style={({ pressed }) => [s.tonalBtnLg, pressed && s.pressed]}>
            <MaterialIcons name={active.runningSince ? 'pause' : 'play-arrow'} size={20} color={color.onPrimaryContainer} />
            <Text style={s.tonalBtnText}>{active.runningSince ? 'Take a break' : 'Back to work'}</Text>
          </Pressable>
          <Pressable onPress={endShift} android_ripple={ripple} style={({ pressed }) => [s.filledBtn, s.spacedBtn, pressed && s.pressed]}>
            <MaterialIcons name="stop" size={20} color={color.onPrimary} /><Text style={s.filledBtnText}>End shift and save</Text>
          </Pressable>
          <Pressable onPress={discardShift} android_ripple={ripple} style={({ pressed }) => [s.textBtnCenter, pressed && s.pressed]}>
            <Text style={s.textBtnDanger}>Discard timer</Text>
          </Pressable>
        </>}
      </>}
      {tab === 'add' && <>
        <Text style={s.overline}>NEW RECORD</Text>
        <Text style={s.headline}>Record a past shift.</Text>
        <Text style={s.lede}>Write down the terms while they are fresh. Your records stay on this device and export anytime.</Text>
        <Field label="DATE" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        <Field label="WHO OWES YOU" value={client} onChangeText={setClient} placeholder="Client or company" />
        {clients.length > 0 && <View style={s.chipRow}>{clients.map(c => <Chip key={c} label={c} active={client === c} onPress={() => setClient(c)} />)}</View>}
        <Text style={s.fieldLabel}>PAID BY</Text>
        <UnitPicker value={unit} onChange={setUnit} />
        <Field label={UNITS.find(u => u.key === unit)?.work ?? 'WORK DONE'} value={units} onChangeText={setUnits} placeholder={unit === 'task' ? '240' : '8'} numeric />
        <Field label={`RATE PER ${unit.toUpperCase()} (₹)`} value={rate} onChangeText={setRate} placeholder={unit === 'task' ? '45' : '500'} numeric />
        <Field label="ALREADY RECEIVED (₹)" value={received} onChangeText={setReceived} placeholder="0" numeric />
        <Field label="OPTIONAL NOTE" value={note} onChangeText={setNote} placeholder="Job or payment detail" />
        <Pressable onPress={save} android_ripple={ripple} style={({ pressed }) => [s.filledBtn, pressed && s.pressed]}>
          <MaterialIcons name="check" size={20} color={color.onPrimary} /><Text style={s.filledBtnText}>Save shift</Text>
        </Pressable>
        <Text style={s.fine}>This personal log is not legal proof of a contract.</Text>
      </>}
      {tab === 'check' && <>
        <Text style={s.overline}>PAYOUT CHECK</Text>
        <Text style={s.headline}>Did they pay it all?</Text>
        <Text style={s.lede}>Pick a client and a month. Your log does the maths they hope you skip.</Text>
        {clients.length === 0 ? <View style={s.empty}>
          <View style={s.emptyIcon}><MaterialIcons name="fact-check" size={30} color={color.primary} /></View>
          <Text style={s.emptyTitle}>No shifts yet.</Text>
          <Text style={s.emptyBody}>Record work first, then run a check when the money lands. Or load the demo month and try it now.</Text>
          <Pressable onPress={loadDemo} android_ripple={ripple} style={({ pressed }) => [s.filledBtn, s.emptyBtn, pressed && s.pressed]}>
            <MaterialIcons name="play-arrow" size={19} color={color.onPrimary} /><Text style={s.filledBtnText}>Load demo data</Text>
          </Pressable>
        </View> : <>
          <Text style={s.fieldLabel}>CLIENT</Text>
          <View style={s.chipRow}>{clients.map(c => <Chip key={c} label={c} active={activeCheckClient === c} onPress={() => setCheckClient(c)} />)}</View>
          <Text style={s.fieldLabel}>MONTH</Text>
          <View style={s.chipRow}>{monthKeys.map(k => <Chip key={k} label={monthName(k)} active={activeCheckMonth === k} onPress={() => setCheckMonth(k)} />)}</View>
          {check && (check.count === 0 ? <View style={s.empty}>
            <View style={s.emptyIcon}><MaterialIcons name="event-available" size={30} color={color.primary} /></View>
            <Text style={s.emptyTitle}>Nothing logged for {check.client} in {monthName(activeCheckMonth)}.</Text>
            <Text style={s.emptyBody}>Try another month, or record the shift first.</Text>
          </View> : check.missing > 0 ? <View style={s.missingCard}>
            <View style={s.missingTop}>
              <MaterialIcons name="error-outline" size={20} color={color.errorOnDark} />
              <Text style={s.missingLabel}>MISSING PAY</Text>
            </View>
            <Text style={s.missingAmount}>{cash(check.missing)}</Text>
            <Text style={s.missingBody}>You logged {fmtUnits(check.units)} {unitLabel(check.unit, check.units)} for {check.client} in {monthName(activeCheckMonth)}. They promised {cash(check.promised)} and paid {cash(check.received)}, which covers only {fmtUnits(check.paidUnitsEquivalent)} of your {unitLabel(check.unit, check.units)}.</Text>
            <Pressable onPress={() => { setPacketClient(check.client); go('packet'); }} android_ripple={ripple} style={({ pressed }) => [s.missingBtn, pressed && s.pressed]}>
              <MaterialIcons name="picture-as-pdf" size={19} color={color.error} /><Text style={s.missingBtnText}>Prepare evidence packet</Text>
            </Pressable>
            <Pressable onPress={settleCheckSelection} android_ripple={ripple} style={({ pressed }) => [s.missingGhost, pressed && s.pressed]}>
              <Text style={s.missingGhostText}>Mark settled anyway</Text>
            </Pressable>
          </View> : <View style={s.okCard}>
            <View style={s.okIcon}><MaterialIcons name="verified" size={26} color={color.primary} /></View>
            <View style={s.okText}>
              <Text style={s.title}>Fully paid.</Text>
              <Text style={s.okBody}>{check.client} paid all {cash(check.promised)} for {fmtUnits(check.units)} {unitLabel(check.unit, check.units)} in {monthName(activeCheckMonth)}. Your log agrees with their money.</Text>
            </View>
          </View>)}
        </>}
      </>}
      {tab === 'packet' && <>
        <Text style={s.overline}>EVIDENCE PACKET</Text>
        <Text style={s.headline}>Make your case clear.</Text>
        <Text style={s.lede}>Choose a client to see the exact gap, then export a dated summary to review and share.</Text>
        {clients.length === 0 ? <View style={s.empty}>
          <View style={s.emptyIcon}><MaterialIcons name="receipt-long" size={30} color={color.primary} /></View>
          <Text style={s.emptyTitle}>No shifts yet.</Text>
          <Text style={s.emptyBody}>Add a shift first. Your packet will collect its terms, payments and notes.</Text>
        </View> : clients.map(name => {
          const group = shifts.filter(item => item.client === name);
          const itemTotals = totals(group);
          const selected = packetClient === name;
          return <Pressable key={name} onPress={() => setPacketClient(name)} android_ripple={ripple} style={({ pressed }) => [s.packetCard, selected && s.packetSelected, pressed && s.pressed]}>
            <View style={s.recordHead}>
              <View style={s.avatar}><Text style={s.avatarText}>{initials(name)}</Text></View>
              <View style={s.recordTitles}>
                <Text style={s.titleSm}>{name}</Text>
                <Text style={s.supporting}>{group.length} {group.length === 1 ? 'shift' : 'shifts'} · {cash(itemTotals.promised)} promised · {cash(itemTotals.received)} received</Text>
              </View>
              <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} color={selected ? color.primary : color.onSurfaceFaint} />
            </View>
            {itemTotals.owed > 0
              ? <Text style={s.packetMissing}>{cash(itemTotals.owed)} missing</Text>
              : <Text style={s.packetPaid}>Paid in full</Text>}
          </Pressable>;
        })}
        {Boolean(packetClient && clients.includes(packetClient)) && <Pressable onPress={() => exportPacket(packetClient)} android_ripple={ripple} style={({ pressed }) => [s.filledBtn, s.spacedBtn, pressed && s.pressed]}>
          <MaterialIcons name="picture-as-pdf" size={20} color={color.onPrimary} /><Text style={s.filledBtnText}>Prepare {packetClient} packet (PDF)</Text>
        </Pressable>}
        <Text style={s.fine}>PDF packets are part of Plus. Your CSV export from Overview always stays free. This is your personal record; keep source messages or receipts separately.</Text>
        {months.length > 0 && <>
          <Text style={[s.title, s.monthTitle]}>Monthly view</Text>
          {months.map(item => <View key={item.month} style={s.monthRow}>
            <View style={s.recordTitles}>
              <Text style={s.titleSm}>{monthName(item.month)}</Text>
              <Text style={s.supporting}>{item.count} {item.count === 1 ? 'shift' : 'shifts'} · {cash(item.promised)} promised · {cash(item.received)} received</Text>
              {item.owed > 0 && <Text style={s.monthMissing}>{cash(item.owed)} missing</Text>}
            </View>
            <Pressable onPress={() => exportMonthly(item.month)} android_ripple={ripple} style={({ pressed }) => [s.textBtn, pressed && s.pressed]}>
              <MaterialIcons name="picture-as-pdf" size={16} color={color.primary} />
              <Text style={s.textBtnText}>{plus ? 'Export report' : 'With Plus'}</Text>
            </Pressable>
          </View>)}
        </>}
      </>}
      {tab === 'plus' && <>
        <Text style={s.overline}>PROOFPOCKET PLUS</Text>
        <Text style={s.headline}>Your log stays free.</Text>
        <Text style={s.lede}>Logging, the timer, payout checks and CSV export never need a subscription. Plus turns your log into polished proof.</Text>
        <View style={s.plusCard}>
          <View style={s.plusTop}>
            <View style={s.plusBadge}><MaterialIcons name="workspace-premium" size={22} color={color.surfaceDark} /></View>
            {plus
              ? <View style={s.stateChipOk}><MaterialIcons name="verified" size={14} color={color.onPrimaryContainer} /><Text style={s.stateChipOkText}>Active</Text></View>
              : <View style={s.plusChip}><Text style={s.plusChipText}>Optional upgrade</Text></View>}
          </View>
          <Text style={s.plusTitle}>{plus ? 'Plus is on' : 'Proof, ready to send'}</Text>
          <Text style={s.plusPrice}>{plus ? 'Thank you for supporting ProofPocket.' : 'One-tap PDF evidence packets and monthly pay reports, priced for gig workers.'}</Text>
          <View style={s.benefits}>
            {['One-tap PDF evidence packet for any client', 'Monthly PDF pay report across every client', 'Full payment timelines inside every report', 'New Plus tools for workers as they land'].map(b => <View key={b} style={s.benefitRow}>
              <MaterialIcons name="check" size={18} color={color.primaryContainer} /><Text style={s.benefit}>{b}</Text>
            </View>)}
          </View>
        </View>
        {plus ? <View style={s.okCard}>
          <View style={s.okIcon}><MaterialIcons name="verified" size={26} color={color.primary} /></View>
          <View style={s.okText}>
            <Text style={s.title}>Plus is active on this device.</Text>
            <Text style={s.okBody}>PDF packets and monthly reports are unlocked in the Packet tab.</Text>
          </View>
        </View> : <>
          {plans.length > 0 ? <>
            <Text style={s.fieldLabel}>CHOOSE YOUR PLAN</Text>
            {plans.map(p => {
              const chosen = selectedPlan === p.identifier;
              return <Pressable key={p.identifier} onPress={() => setSelectedPlan(p.identifier)} android_ripple={ripple} style={({ pressed }) => [s.planCard, chosen && s.planChosen, pressed && s.pressed]}>
                <MaterialIcons name={chosen ? 'radio-button-checked' : 'radio-button-unchecked'} size={23} color={chosen ? color.primary : color.onSurfaceFaint} />
                <View style={s.recordTitles}>
                  <Text style={s.titleSm}>{p.label}</Text>
                  <Text style={s.supporting}>{p.label === 'Lifetime' ? 'One payment, yours forever' : p.label === 'Yearly' ? 'Best value for regular work' : 'Flexible, cancel anytime'}</Text>
                </View>
                <Text style={s.planPrice}>{p.priceString}</Text>
              </Pressable>;
            })}
            <Pressable onPress={() => purchase(false, selectedPlan || undefined)} android_ripple={ripple} style={({ pressed }) => [s.filledBtn, s.spacedBtn, pressed && s.pressed]}>
              <MaterialIcons name="workspace-premium" size={20} color={color.onPrimary} />
              <Text style={s.filledBtnText}>Get {plans.find(p => p.identifier === selectedPlan)?.label ?? 'Plus'}{plans.find(p => p.identifier === selectedPlan) ? ` · ${plans.find(p => p.identifier === selectedPlan)?.priceString}` : ''}</Text>
            </Pressable>
          </> : <Pressable disabled={!purchasesConfigured} onPress={() => purchase()} android_ripple={ripple} style={({ pressed }) => [s.filledBtn, !purchasesConfigured && s.disabledBtn, pressed && s.pressed]}>
            <MaterialIcons name="workspace-premium" size={20} color={color.onPrimary} /><Text style={s.filledBtnText}>{purchasesConfigured ? 'Get Plus' : 'Store not connected'}</Text>
          </Pressable>}
          <Pressable onPress={() => purchase(true)} android_ripple={ripple} style={({ pressed }) => [s.textBtnCenter, pressed && s.pressed]}>
            <MaterialIcons name="restart-alt" size={17} color={color.primary} /><Text style={s.textBtnText}>Restore purchase</Text>
          </Pressable>
        </>}
        <Text style={s.fine}>{purchasesConfigured ? 'Billing is handled by your app store via RevenueCat. Cancel anytime in store settings.' : 'This build has no RevenueCat public key configured, so the store is in preview mode. The ledger, timer and payout check work fully offline either way.'}</Text>
        <Text style={[s.title, s.monthTitle]}>Try the full flow</Text>
        <Text style={s.supportingBlock}>Load a realistic demo month (three clients, a few short payments), run a payout check, then remove it. Your own records are never touched.</Text>
        <View style={s.quickRow}>
          <Pressable onPress={loadDemo} android_ripple={ripple} style={({ pressed }) => [s.tonalBtn, pressed && s.pressed]}>
            <MaterialIcons name="play-arrow" size={19} color={color.onPrimaryContainer} /><Text style={s.tonalBtnText}>Load demo data</Text>
          </Pressable>
          {hasDemo && <Pressable onPress={clearDemo} android_ripple={ripple} style={({ pressed }) => [s.tonalBtn, pressed && s.pressed]}>
            <MaterialIcons name="delete-outline" size={19} color={color.onPrimaryContainer} /><Text style={s.tonalBtnText}>Remove demo data</Text>
          </Pressable>}
        </View>
      </>}
    </ScrollView>
    {tab === 'home' && <Pressable accessibilityLabel="Record a past shift" onPress={() => go('add')} android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: false }} style={({ pressed }) => [s.fab, pressed && s.fabPressed]}>
      <MaterialIcons name="add" size={26} color={color.onPrimary} />
    </Pressable>}
    {Boolean(message) && <View style={s.snackbar}>
      <Text style={s.snackbarText}>{message}</Text>
      <Pressable accessibilityLabel="Dismiss" onPress={() => setMessage('')} hitSlop={8} style={s.snackClose}>
        <MaterialIcons name="close" size={18} color={color.onSurfaceDarkMuted} />
      </Pressable>
    </View>}
    <View style={s.nav}>
      {([['home', 'Overview', 'home'], ['timer', 'Timer', 'timer'], ['check', 'Check', 'fact-check'], ['packet', 'Packet', 'receipt-long'], ['plus', 'Plus', 'workspace-premium']] as Array<[Tab, string, string]>).map(([key, label, icon]) => {
        const selected = tab === key || (key === 'home' && tab === 'add');
        return <Pressable key={key} onPress={() => go(key)} style={({ pressed }) => [s.navItem, pressed && s.navItemPressed]}>
          <View style={[s.navPill, selected && s.navPillActive]}>
            <MaterialIcons name={icon as never} size={22} color={selected ? color.onPrimaryContainer : color.onSurfaceVariant} />
            {key === 'timer' && active && <View style={s.navBadge} />}
          </View>
          <Text style={[s.navLabel, selected && s.navLabelActive]}>{label}</Text>
        </Pressable>;
      })}
    </View>
  </SafeAreaView></SafeAreaProvider>;
}

function Field(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; numeric?: boolean }) {
  const [focused, setFocused] = useState(false);
  return <View style={s.field}>
    <Text style={s.fieldLabel}>{props.label}</Text>
    <TextInput
      style={[s.input, focused && s.inputFocused]}
      value={props.value}
      onChangeText={props.onChangeText}
      placeholder={props.placeholder}
      placeholderTextColor={color.onSurfaceFaint}
      keyboardType={props.numeric ? 'decimal-pad' : 'default'}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  </View>;
}

function Chip(props: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={props.onPress} android_ripple={ripple} style={({ pressed }) => [s.chip, props.active && s.chipActive, pressed && s.pressed]}>
    {props.active && <MaterialIcons name="check" size={15} color={color.onPrimaryContainer} />}
    <Text style={[s.chipText, props.active && s.chipTextActive]}>{props.label}</Text>
  </Pressable>;
}

function UnitPicker(props: { value: ShiftUnit; onChange: (u: ShiftUnit) => void }) {
  return <View style={s.segmented}>
    {UNITS.map((u, i) => {
      const selected = props.value === u.key;
      return <Pressable key={u.key} onPress={() => props.onChange(u.key)} android_ripple={ripple} style={({ pressed }) => [s.seg, i > 0 && s.segDivider, selected && s.segActive, pressed && s.pressed]}>
        {selected && <MaterialIcons name="check" size={15} color={color.onPrimaryContainer} />}
        <Text style={[s.segText, selected && s.segTextActive]}>{u.label}</Text>
      </Pressable>;
    })}
  </View>;
}


const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background },
  appBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[3], backgroundColor: color.background },
  mark: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing[3] },
  brand: { ...type.title, color: color.onSurface, letterSpacing: -0.2 },
  appBarAction: { marginLeft: 'auto', width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.72 },
  body: { paddingHorizontal: spacing[5], paddingTop: spacing[2], paddingBottom: 110 },

  overline: { ...type.overline, color: color.primary, marginBottom: spacing[2] },
  headline: { ...type.headline, color: color.onSurface, marginBottom: spacing[2] },
  lede: { ...type.body, color: color.onSurfaceVariant, marginBottom: spacing[5] },
  title: { ...type.title, color: color.onSurface },
  titleSm: { ...type.titleSm, color: color.onSurface },
  supporting: { ...type.bodySm, color: color.onSurfaceVariant, marginTop: 2 },
  supportingBlock: { ...type.bodySm, color: color.onSurfaceVariant, lineHeight: 21 },
  fine: { ...type.bodySm, color: color.onSurfaceFaint, lineHeight: 20, marginTop: spacing[4] },

  hero: { backgroundColor: color.surfaceDark, borderRadius: radius.lg, padding: spacing[5], ...elevation[2] },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { ...type.overline, color: color.onSurfaceDarkMuted },
  heroAmount: { ...type.display, ...type.tabular, color: color.onSurfaceDark, marginTop: spacing[3] },
  heroAmountMissing: { color: color.errorOnDark },
  heroCaption: { ...type.bodySm, color: color.onSurfaceDarkMuted, marginTop: spacing[1] },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.16)', marginTop: spacing[5], overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: color.primaryContainer },
  heroFoot: { ...type.bodySm, color: color.onSurfaceDarkMuted, lineHeight: 20, marginTop: spacing[3] },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[4] },
  heroMetaText: { fontSize: 12, color: color.onSurfaceDarkMuted, fontWeight: '600' },

  stateChipOk: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] + 2, backgroundColor: color.primaryContainer, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing[3] },
  stateChipOkText: { fontSize: 12, fontWeight: '700', color: color.onPrimaryContainer },
  stateChipError: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] + 2, backgroundColor: 'rgba(255,180,166,0.16)', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing[3] },
  stateChipErrorText: { fontSize: 12, fontWeight: '700', color: color.errorOnDark },
  stateChipWarn: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: '#F7E8C9', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing[3] },
  stateChipWarnText: { fontSize: 12, fontWeight: '700', color: '#7A5205' },
  stateDot: { width: 8, height: 8, borderRadius: 4 },

  statusChip: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], backgroundColor: color.surfaceVariant, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing[2] + 2 },
  statusChipText: { fontSize: 11.5, fontWeight: '700', color: color.onSurfaceVariant },
  statusChipError: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], backgroundColor: color.errorContainer, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing[2] + 2 },
  statusChipErrorText: { fontSize: 11.5, fontWeight: '700', color: color.error },

  liveCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.surface, borderRadius: radius.md, padding: spacing[4], marginTop: spacing[4], ...elevation[1] },
  liveIcon: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: color.primaryContainer, alignItems: 'center', justifyContent: 'center', marginRight: spacing[3] },
  liveText: { flex: 1 },
  liveClock: { ...type.title, ...type.tabular, color: color.primary },

  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginTop: spacing[5] },
  filledBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], backgroundColor: color.primary, borderRadius: radius.pill, minHeight: 52, paddingHorizontal: spacing[5] },
  filledBtnText: { ...type.button, color: color.onPrimary },
  tonalBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: color.primaryContainer, borderRadius: radius.pill, minHeight: 44, paddingHorizontal: spacing[4] },
  tonalBtnLg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], backgroundColor: color.primaryContainer, borderRadius: radius.pill, minHeight: 52, paddingHorizontal: spacing[5] },
  tonalBtnText: { fontSize: 14.5, fontWeight: '700', color: color.onPrimaryContainer },
  textBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] + 2, borderRadius: radius.pill, paddingVertical: spacing[2], paddingHorizontal: spacing[2] },
  textBtnText: { fontSize: 13.5, fontWeight: '700', color: color.primary },
  textBtnDanger: { fontSize: 13.5, fontWeight: '700', color: color.error },
  textBtnCenter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingVertical: spacing[3], marginTop: spacing[2] },
  disabledBtn: { backgroundColor: color.onSurfaceFaint },
  spacedBtn: { marginTop: spacing[3] },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[6], marginBottom: spacing[3] },

  empty: { backgroundColor: color.surface, borderRadius: radius.lg, padding: spacing[5], alignItems: 'flex-start', ...elevation[1] },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: color.primaryContainer, alignItems: 'center', justifyContent: 'center', marginBottom: spacing[4] },
  emptyTitle: { ...type.titleSm, color: color.onSurface },
  emptyBody: { ...type.bodySm, color: color.onSurfaceVariant, lineHeight: 21, marginTop: spacing[2] },
  emptyBtn: { marginTop: spacing[5], minHeight: 46, paddingHorizontal: spacing[5] },

  record: { backgroundColor: color.surface, borderRadius: radius.md, padding: spacing[4], marginBottom: spacing[3], ...elevation[1] },
  recordHead: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: color.primaryContainer, alignItems: 'center', justifyContent: 'center', marginRight: spacing[3] },
  avatarText: { fontSize: 14, fontWeight: '800', color: color.onPrimaryContainer },
  recordTitles: { flex: 1, minWidth: 0 },
  amountRow: { flexDirection: 'row', gap: spacing[5], marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: color.outline },
  amountCell: { ...type.bodySm, color: color.onSurfaceVariant },
  amountStrong: { color: color.onSurface, fontWeight: '800' },
  note: { ...type.bodySm, color: color.onSurfaceVariant, marginTop: spacing[2] },
  timeline: { marginTop: spacing[3], gap: spacing[2] },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  timelineText: { ...type.bodySm, color: color.onSurfaceVariant },
  recordActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1], marginTop: spacing[3] },
  paymentForm: { marginTop: spacing[3], paddingTop: spacing[3], borderTopWidth: 1, borderTopColor: color.outline },

  field: { marginBottom: spacing[4] },
  fieldLabel: { ...type.overline, color: color.onSurfaceVariant, marginBottom: spacing[2] },
  input: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.outlineStrong, borderRadius: radius.sm, paddingHorizontal: spacing[4], paddingVertical: 13, color: color.onSurface, fontSize: 16 },
  inputFocused: { borderColor: color.primary, borderWidth: 2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2], marginBottom: spacing[5] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] + 2, borderWidth: 1, borderColor: color.outlineStrong, backgroundColor: color.surface, borderRadius: radius.xs + 2, paddingVertical: spacing[2], paddingHorizontal: spacing[3] },
  chipActive: { backgroundColor: color.primaryContainer, borderColor: color.primaryContainer },
  chipText: { fontSize: 13.5, fontWeight: '600', color: color.onSurfaceVariant },
  chipTextActive: { color: color.onPrimaryContainer, fontWeight: '700' },

  segmented: { flexDirection: 'row', borderWidth: 1, borderColor: color.outlineStrong, borderRadius: radius.pill, overflow: 'hidden', marginBottom: spacing[5], backgroundColor: color.surface },
  seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1] + 2, paddingVertical: spacing[3] },
  segDivider: { borderLeftWidth: 1, borderLeftColor: color.outlineStrong },
  segActive: { backgroundColor: color.primaryContainer },
  segText: { fontSize: 13.5, fontWeight: '600', color: color.onSurfaceVariant },
  segTextActive: { color: color.onPrimaryContainer, fontWeight: '700' },

  timerCard: { backgroundColor: color.surface, borderRadius: radius.lg, padding: spacing[5], alignItems: 'center', ...elevation[1] },
  timerClock: { ...type.timer, ...type.tabular, color: color.onSurface, marginTop: spacing[4] },
  timerMeta: { ...type.bodySm, color: color.onSurfaceVariant, marginTop: spacing[2] },
  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[5], marginVertical: spacing[5] },
  counterBtn: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: color.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  counterMiddle: { alignItems: 'center', minWidth: 96 },
  counterValue: { fontSize: 30, fontWeight: '800', color: color.onSurface, ...type.tabular },

  missingCard: { backgroundColor: color.error, borderRadius: radius.lg, padding: spacing[5], ...elevation[2] },
  missingTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  missingLabel: { ...type.overline, color: color.errorOnDark },
  missingAmount: { ...type.display, ...type.tabular, color: color.onError, marginTop: spacing[3] },
  missingBody: { fontSize: 14.5, lineHeight: 22, color: '#FFE9E6', marginTop: spacing[2] },
  missingBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], backgroundColor: color.onError, borderRadius: radius.pill, minHeight: 50, marginTop: spacing[5] },
  missingBtnText: { ...type.button, color: color.error },
  missingGhost: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', borderRadius: radius.pill, minHeight: 48, marginTop: spacing[2] },
  missingGhostText: { fontSize: 14.5, fontWeight: '700', color: color.onError },

  okCard: { flexDirection: 'row', backgroundColor: color.surface, borderRadius: radius.lg, padding: spacing[5], ...elevation[1] },
  okIcon: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: color.primaryContainer, alignItems: 'center', justifyContent: 'center', marginRight: spacing[4] },
  okText: { flex: 1 },
  okBody: { ...type.bodySm, color: color.onSurfaceVariant, lineHeight: 21, marginTop: spacing[1] },

  packetCard: { backgroundColor: color.surface, borderRadius: radius.md, padding: spacing[4], marginBottom: spacing[3], ...elevation[1] },
  packetSelected: { borderWidth: 2, borderColor: color.primary },
  packetMissing: { fontSize: 19, fontWeight: '800', color: color.error, marginTop: spacing[3] },
  packetPaid: { fontSize: 19, fontWeight: '800', color: color.primary, marginTop: spacing[3] },

  monthTitle: { marginTop: spacing[6], marginBottom: spacing[2] },
  monthRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: color.outline },
  monthMissing: { fontSize: 13, fontWeight: '700', color: color.error, marginTop: 2 },

  plusCard: { backgroundColor: color.surfaceDark, borderRadius: radius.lg, padding: spacing[5], marginBottom: spacing[5], ...elevation[2] },
  plusTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  plusBadge: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: color.primaryContainer, alignItems: 'center', justifyContent: 'center' },
  plusChip: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: spacing[3] },
  plusChipText: { fontSize: 12, fontWeight: '700', color: color.onSurfaceDarkMuted },
  plusTitle: { fontSize: 27, lineHeight: 32, fontWeight: '800', color: color.onSurfaceDark, marginTop: spacing[4] },
  plusPrice: { ...type.bodySm, color: color.onSurfaceDarkMuted, lineHeight: 21, marginTop: spacing[2] },
  benefits: { marginTop: spacing[5], gap: spacing[3] },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  benefit: { flex: 1, fontSize: 14.5, lineHeight: 21, fontWeight: '600', color: color.onSurfaceDark },

  planCard: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], backgroundColor: color.surface, borderWidth: 1, borderColor: color.outline, borderRadius: radius.md, padding: spacing[4], marginBottom: spacing[2] },
  planChosen: { borderColor: color.primary, borderWidth: 2 },
  planPrice: { ...type.titleSm, color: color.onSurface, ...type.tabular },

  fab: { position: 'absolute', right: spacing[4], bottom: 96, width: 56, height: 56, borderRadius: radius.md, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', ...elevation[3] },
  fabPressed: { backgroundColor: color.primaryPressed },

  snackbar: { position: 'absolute', left: spacing[4], right: spacing[4], bottom: 92, flexDirection: 'row', alignItems: 'center', backgroundColor: color.surfaceDark, borderRadius: radius.sm, paddingVertical: spacing[3], paddingLeft: spacing[4], paddingRight: spacing[2], ...elevation[3] },
  snackbarText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: color.onSurfaceDark, fontWeight: '600' },
  snackClose: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  nav: { flexDirection: 'row', backgroundColor: color.surface, borderTopWidth: 1, borderTopColor: color.outline, paddingTop: spacing[2], paddingBottom: spacing[2] },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: spacing[1] },
  navItemPressed: { opacity: 0.65 },
  navPill: { width: 56, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  navPillActive: { backgroundColor: color.primaryContainer },
  navBadge: { position: 'absolute', top: 6, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: color.error, borderWidth: 1.5, borderColor: color.surface },
  navLabel: { fontSize: 11.5, fontWeight: '600', color: color.onSurfaceVariant, marginTop: 3 },
  navLabelActive: { color: color.onSurface, fontWeight: '800' },
});
