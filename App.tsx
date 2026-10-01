import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { addPayment, amountOwed, disputePacket, makeShift, monthlyPacket, monthlySummary, paid, parseShifts, promised, Shift, toCsv, totals } from './ledger';
import { buyPlus, configurePurchases, getPlusStatus, purchasesConfigured, restorePlus } from './purchases';

const KEY = 'proofpocket.shifts.v1';
const cash = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function App() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'home' | 'add' | 'packet' | 'plus'>('home');
  const [client, setClient] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState('');
  const [rate, setRate] = useState('');
  const [received, setReceived] = useState('0');
  const [note, setNote] = useState('');
  const [plus, setPlus] = useState(false);
  const [message, setMessage] = useState('');
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [payment, setPayment] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentReference, setPaymentReference] = useState('');
  const [packetClient, setPacketClient] = useState('');
  const [storageSafe, setStorageSafe] = useState(true);
  const sum = useMemo(() => totals(shifts), [shifts]);
  const months = useMemo(() => monthlySummary(shifts), [shifts]);
  const clients = useMemo(() => [...new Set(shifts.map(s => s.client))].sort(), [shifts]);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(value => {
      if (value) {
        try { setShifts(parseShifts(value)); }
        catch { setStorageSafe(false); setMessage('Saved records could not be read. They were not changed.'); }
      }
      setLoaded(true);
    }).catch(() => { setLoaded(true); setMessage('Local storage is unavailable.'); });
    configurePurchases().then(ok => { if (ok) return getPlusStatus().then(setPlus); }).catch(() => {});
  }, []);
  useEffect(() => { if (loaded && storageSafe) AsyncStorage.setItem(KEY, JSON.stringify(shifts)).catch(() => setMessage('This entry could not be saved.')); }, [shifts, loaded, storageSafe]);

  function save() {
    try {
      if (!storageSafe) throw new Error('Saved data needs repair before you add a shift.');
      const shift = makeShift({ date, client, hours: Number(hours), rate: Number(rate), received: Number(received), note });
      setShifts(current => [shift, ...current]);
      setClient(''); setHours(''); setRate(''); setReceived('0'); setNote('');
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
  function exportPacket(client: string) { return exportMarkup(disputePacket(shifts, client)); }
  function exportMonthly(month: string) {
    if (!plus) { setMessage('Monthly report export needs an active Plus subscription.'); setTab('plus'); return; }
    return exportMarkup(monthlyPacket(shifts, month));
  }
  function removeShift(id: string) {
    const remove = () => { setShifts(current => current.filter(s => s.id !== id)); setMessage('Shift removed.'); };
    if (Platform.OS === 'web') { if (window.confirm('Remove this shift and its payments?')) remove(); }
    else Alert.alert('Remove shift?', 'This removes its payment record too.', [{ text: 'Keep shift', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: remove }]);
  }
  async function purchase(restore = false) {
    try { const active = restore ? await restorePlus() : await buyPlus(); setPlus(active); setMessage(active ? 'Plus is active.' : 'No active Plus purchase was found.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'The store is unavailable.'); }
  }

  return <SafeAreaView style={s.screen}><StatusBar style="dark" />
    <View style={s.header}><View style={s.mark}><Text style={s.markText}>P</Text></View><Text style={s.brand}>ProofPocket</Text><Text style={s.headerTag}>PRIVATE PAY LOG</Text></View>
    <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      {tab === 'home' && <>
        <Text style={s.kicker}>YOUR WORK, IN WRITING</Text><Text style={s.title}>Know what you're owed.</Text>
        <Text style={s.lede}>Log each shift and payment. Keep a clear record when pay is late or missing.</Text>
        <View style={s.hero}><Text style={s.heroLabel}>STILL OWED TO YOU</Text><Text style={s.heroAmount}>{cash(sum.owed)}</Text><Text style={s.heroFoot}>{shifts.length} {shifts.length === 1 ? 'shift' : 'shifts'} recorded · Stored on this device</Text></View>
        <View style={s.stats}><View><Text style={s.statLabel}>PROMISED</Text><Text style={s.statValue}>{cash(sum.promised)}</Text></View><View><Text style={s.statLabel}>RECEIVED</Text><Text style={s.statValue}>{cash(sum.received)}</Text></View></View>
        <TouchableOpacity style={s.button} onPress={() => setTab('add')}><Text style={s.buttonText}>+ Record a shift</Text></TouchableOpacity>{shifts.length > 0 && <View style={s.insight}><Text style={s.insightTitle}>Your pay picture</Text><Text style={s.insightBody}>{sum.owed > 0 ? `${clients.length} ${clients.length === 1 ? 'client' : 'clients'} in your log. Open the packet tab to prepare a clear pay summary.` : "All recorded shifts are paid. Add new work when it starts."}</Text></View>}
        <View style={s.section}><Text style={s.sectionTitle}>Your records</Text>{shifts.length > 0 && <TouchableOpacity onPress={() => Share.share({ message: toCsv(shifts), title: 'ProofPocket pay record' }).catch(() => setMessage('Sharing is unavailable.'))}><Text style={s.link}>Share CSV</Text></TouchableOpacity>}</View>
        {shifts.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>Every fair payment starts with a record.</Text><Text style={s.emptyBody}>Add your first shift to compare promised and received pay.</Text></View> : shifts.map(shift => <View key={shift.id} style={s.record}><View style={s.row}><Text style={s.recordTitle}>{shift.client}</Text><Text style={s.muted}>{shift.date}</Text></View><Text style={s.muted}>{shift.hours} hours × {cash(shift.rate)} · Promised {cash(promised(shift))}</Text><Text style={s.muted}>Received {cash(paid(shift))}</Text><Text style={s.owed}>{amountOwed(shift) > 0 ? `${cash(amountOwed(shift))} outstanding` : 'Paid in full'}</Text>{Boolean(shift.note) && <Text style={s.muted}>{shift.note}</Text>}{shift.payments.map(p => <Text key={p.id} style={s.paymentTimeline}>↳ {p.date} · {cash(p.amount)} {p.reference ? '· ' + p.reference : ''}</Text>)}<View style={s.recordActions}><TouchableOpacity onPress={() => { setPaymentId(shift.id); setPayment(''); }}><Text style={s.link}>Add payment</Text></TouchableOpacity><TouchableOpacity onPress={() => removeShift(shift.id)}><Text style={s.remove}>Remove</Text></TouchableOpacity></View>{paymentId === shift.id && <View style={s.paymentRow}><Field label="PAYMENT DATE" value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" /><Field label="AMOUNT RECEIVED (₹)" value={payment} onChangeText={setPayment} placeholder="500" numeric /><Field label="REFERENCE OR METHOD" value={paymentReference} onChangeText={setPaymentReference} placeholder="UPI ID or cash" /><TouchableOpacity style={s.smallButton} onPress={() => savePayment(shift.id)}><Text style={s.buttonText}>Save payment</Text></TouchableOpacity></View>}</View>)}
      </>}
      {tab === 'add' && <><Text style={s.kicker}>NEW RECORD</Text><Text style={s.title}>Record a shift.</Text><Text style={s.lede}>Write down the terms while they are fresh. Export your records anytime.</Text>
        <Field label="DATE" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
        <Field label="WHO OWES YOU" value={client} onChangeText={setClient} placeholder="Client or company" />
        <Field label="HOURS WORKED" value={hours} onChangeText={setHours} placeholder="8" numeric />
        <Field label="HOURLY RATE (₹)" value={rate} onChangeText={setRate} placeholder="500" numeric />
        <Field label="ALREADY RECEIVED (₹)" value={received} onChangeText={setReceived} placeholder="0" numeric />
        <Field label="OPTIONAL NOTE" value={note} onChangeText={setNote} placeholder="Job or payment detail" />
        <TouchableOpacity style={s.button} onPress={save}><Text style={s.buttonText}>Save shift</Text></TouchableOpacity><Text style={s.fine}>This personal log is not legal proof of a contract.</Text>
      </>}
      {tab === 'packet' && <><Text style={s.kicker}>EVIDENCE PACKET</Text><Text style={s.title}>Make your case clear.</Text><Text style={s.lede}>Choose a client to see the exact gap. Export a dated summary to review and share.</Text>
        {clients.length === 0 ? <View style={s.empty}><Text style={s.emptyTitle}>No shifts yet.</Text><Text style={s.emptyBody}>Add a shift first. Your packet will collect its terms, payments, and notes.</Text></View> : clients.map(client => {
          const group = shifts.filter(item => item.client === client);
          const itemTotals = totals(group);
          return <TouchableOpacity key={client} style={[s.packetCard, packetClient === client && s.packetSelected]} onPress={() => setPacketClient(client)}><Text style={s.recordTitle}>{client}</Text><Text style={s.muted}>{group.length} {group.length === 1 ? 'shift' : 'shifts'} · {cash(itemTotals.promised)} promised · {cash(itemTotals.received)} received</Text><Text style={s.packetAmount}>{cash(itemTotals.owed)} outstanding</Text></TouchableOpacity>;
        })}
        {Boolean(packetClient && clients.includes(packetClient)) && <TouchableOpacity style={s.button} onPress={() => exportPacket(packetClient)}><Text style={s.buttonText}>Prepare {packetClient} packet</Text></TouchableOpacity>}
        <Text style={s.fine}>This is your personal record. Review it and keep source messages or receipts separately.</Text>
        {months.length > 0 && <View style={s.monthSection}><Text style={s.sectionTitle}>Monthly view</Text>{months.map(item => <View key={item.month} style={s.monthRow}><Text style={s.recordTitle}>{item.month}</Text><Text style={s.muted}>{item.count} {item.count === 1 ? 'shift' : 'shifts'} · {cash(item.owed)} owed</Text><TouchableOpacity onPress={() => exportMonthly(item.month)}><Text style={s.link}>{plus ? 'Export monthly report' : 'Monthly PDF with Plus'}</Text></TouchableOpacity></View>)}</View>}
      </>}
      {tab === 'plus' && <><Text style={s.kicker}>OPTIONAL UPGRADE</Text><Text style={s.title}>Your records stay free.</Text><Text style={s.lede}>Core pay logging, client packets, and CSV export do not need a subscription.</Text><View style={s.hero}><Text style={s.heroLabel}>PROOFPOCKET PLUS</Text><Text style={s.plusTitle}>{plus ? 'Active' : 'Monthly reports'}</Text><Text style={s.heroFoot}>Plus unlocks exportable monthly PDF reports across all clients. The monthly view stays free.</Text></View><TouchableOpacity style={[s.button, !purchasesConfigured && s.disabled]} disabled={!purchasesConfigured} onPress={() => purchase()}><Text style={s.buttonText}>{purchasesConfigured ? 'See store offer' : 'Store not connected'}</Text></TouchableOpacity><TouchableOpacity style={s.restore} onPress={() => purchase(true)}><Text style={s.link}>Restore purchase</Text></TouchableOpacity><Text style={s.fine}>Purchases need an installed app and a RevenueCat store setup. No test payment is simulated.</Text></>}
      {Boolean(message) && <Text accessibilityRole="alert" style={s.notice}>{message}</Text>}
    </ScrollView>
    <View style={s.nav}>{(['home', 'add', 'packet', 'plus'] as const).map(item => <TouchableOpacity key={item} style={s.navItem} onPress={() => { setMessage(''); setTab(item); }}><Text style={[s.navText, tab === item && s.navActive]}>{item === 'home' ? 'Overview' : item === 'add' ? 'Add shift' : item === 'packet' ? 'Packet' : 'Plus'}</Text></TouchableOpacity>)}</View>
  </SafeAreaView>;
}

function Field(props: { label: string; value: string; onChangeText: (v: string) => void; placeholder: string; numeric?: boolean }) {
  return <View style={s.field}><Text style={s.fieldLabel}>{props.label}</Text><TextInput style={s.input} value={props.value} onChangeText={props.onChangeText} placeholder={props.placeholder} placeholderTextColor="#829398" keyboardType={props.numeric ? 'decimal-pad' : 'default'} /></View>;
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
  monthSection: { marginTop: 32 },
  monthRow: { paddingVertical: 14, borderBottomWidth: 1, borderColor: '#DCE7E2' },
  screen: { flex: 1, backgroundColor: '#F7FAF7' }, header: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#E1EAE5' }, mark: { width: 31, height: 31, borderRadius: 8, backgroundColor: '#086C65', alignItems: 'center', justifyContent: 'center', marginRight: 9 }, markText: { color: 'white', fontWeight: '800', fontSize: 19 }, brand: { color: '#172C38', fontSize: 18, fontWeight: '800' }, headerTag: { marginLeft: 'auto', color: '#829398', fontSize: 9, fontWeight: '800', letterSpacing: 1 }, body: { padding: 24, paddingBottom: 50 }, kicker: { color: '#086C65', fontWeight: '800', fontSize: 11, letterSpacing: 1.5, marginBottom: 13 }, title: { color: '#172C38', fontSize: 38, lineHeight: 41, fontWeight: '800', letterSpacing: -1.7 }, lede: { color: '#526973', fontSize: 15, lineHeight: 23, marginTop: 12, marginBottom: 27 }, hero: { backgroundColor: '#103D3C', borderRadius: 20, padding: 24, minHeight: 155 }, heroLabel: { color: '#B8E5D1', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, heroAmount: { color: 'white', fontSize: 42, fontWeight: '800', marginTop: 10 }, heroFoot: { color: '#C8DBD6', fontSize: 12, marginTop: 11, lineHeight: 19 }, stats: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 23, paddingHorizontal: 4 }, statLabel: { color: '#829398', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, statValue: { color: '#172C38', fontSize: 19, fontWeight: '800', marginTop: 6 }, button: { backgroundColor: '#086C65', borderRadius: 13, alignItems: 'center', paddingVertical: 17, marginTop: 5 }, buttonText: { color: 'white', fontWeight: '800', fontSize: 16 }, disabled: { backgroundColor: '#9CB5AD' }, section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 33, marginBottom: 15 }, sectionTitle: { color: '#172C38', fontSize: 21, fontWeight: '800' }, link: { color: '#086C65', fontWeight: '800', fontSize: 13 }, empty: { backgroundColor: '#EBF3EF', borderRadius: 16, padding: 22 }, emptyTitle: { color: '#172C38', fontSize: 17, lineHeight: 23, fontWeight: '800' }, emptyBody: { color: '#526973', fontSize: 13, lineHeight: 21, marginTop: 8 }, record: { backgroundColor: 'white', borderWidth: 1, borderColor: '#E1EAE5', borderRadius: 15, padding: 17, marginBottom: 10 }, row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }, recordTitle: { color: '#172C38', fontWeight: '800', fontSize: 16 }, muted: { color: '#526973', fontSize: 12, marginTop: 4 }, owed: { color: '#086C65', fontWeight: '800', fontSize: 13, marginTop: 10 }, field: { marginBottom: 17 }, fieldLabel: { color: '#526973', fontWeight: '800', fontSize: 11, letterSpacing: 1, marginBottom: 8 }, input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#DCE7E2', borderRadius: 12, padding: 15, color: '#172C38', fontSize: 16 }, fine: { color: '#829398', fontSize: 12, lineHeight: 19, marginTop: 19 }, plusTitle: { color: 'white', fontSize: 31, fontWeight: '800', marginTop: 14 }, restore: { alignItems: 'center', padding: 17 }, notice: { backgroundColor: '#E7F4EE', color: '#086C65', padding: 14, borderRadius: 10, marginTop: 22, lineHeight: 20 }, nav: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#E1EAE5', backgroundColor: 'white', paddingBottom: 9, paddingTop: 13 }, navItem: { flex: 1, alignItems: 'center', paddingVertical: 7 }, navText: { color: '#829398', fontWeight: '700', fontSize: 12 }, navActive: { color: '#086C65' },
});
