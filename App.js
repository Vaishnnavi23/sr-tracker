import React, { useEffect, useState } from 'react';
import {
  SafeAreaView, ScrollView, View, Text, Pressable, TextInput, Share, StyleSheet, BackHandler,
} from 'react-native';
import * as T from './ScreenReaderTracker';

// Pressable that also reports each press to the tracker (used to spot repeated taps).
function TP({ id, onPress, ...rest }) {
  return <Pressable {...rest} onPress={(e) => { T.tap(id); if (onPress) onPress(e); }} />;
}

// Accessible button
function Btn({ id, label, onPress }) {
  return (
    <TP id={id} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.btn}>
      <Text style={s.btnText}>{label}</Text>
    </TP>
  );
}

function ExportButtons() {
  return (
    <View style={{ gap: 12 }}>
      <Btn id="export_report" label="Export screen report (CSV)"
        onPress={() => Share.share({ title: 'screen_report.csv', message: T.toReportCsv() })} />
      <Btn id="export_events" label="Export raw events (CSV)"
        onPress={() => Share.share({ title: 'raw_events.csv', message: T.toEventsCsv() })} />
    </View>
  );
}

/* ---------- Screen 1: Home (accessible) ---------- */
function Home({ srState, onPick }) {
  const events = [
    { name: 'Jazz Night', date: '12 December', price: 500 },
    { name: 'Rock Festival', date: '20 December', price: 800 },
  ];
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={s.h1}>Concert tickets</Text>
      <Text style={s.p}>Choose an event to book.</Text>
      {events.map((e) => (
        <TP key={e.name} id={`event_${e.name}`} accessibilityRole="button"
          accessibilityLabel={`${e.name}, ${e.date}, ${e.price} rupees per ticket. Book tickets`}
          onPress={() => onPick(e)} style={s.card}>
          <Text style={s.h2}>{e.name}</Text>
          <Text style={s.p}>{e.date} · ₹{e.price} per ticket</Text>
        </TP>
      ))}
      <View style={s.status} accessible accessibilityLiveRegion="polite">
        <Text style={s.p}>Screen reader detected: {srState.screenReaderOn ? 'ON' : 'OFF'}</Text>
      </View>
      <ExportButtons />
    </View>
  );
}

/* ---------- Screen 2: Booking (deliberately NOT accessible) ---------- */
// Problems on purpose: unlabeled icon-only buttons, tiny touch targets, no role/state on the
// checkbox, no label on the input, low-contrast text, errors shown silently at the top.
function Booking({ event, tickets, setTickets, name, setName, insurance, setInsurance, error, onBack, onConfirm }) {
  return (
    <View style={{ gap: 18 }}>
      {error ? <Text style={s.badError}>{error}</Text> : null}

      <Pressable onPress={() => { T.tap('back_icon'); onBack(); }} style={s.tiny}>
        <Text style={s.tinyText}>‹</Text>
      </Pressable>

      <Text style={s.fakeTitle}>{event.name}</Text>
      <Text style={s.faint}>{event.date}</Text>

      <View style={s.row}>
        <Text style={s.faint}>Tickets</Text>
        <Pressable onPress={() => { T.tap('step_down'); setTickets(Math.max(1, tickets - 1)); }} style={s.tiny}>
          <Text style={s.tinyText}>▼</Text>
        </Pressable>
        <Text style={s.faint}>{tickets}</Text>
        <Pressable onPress={() => { T.tap('step_up'); setTickets(tickets + 1); }} style={s.tiny}>
          <Text style={s.tinyText}>▲</Text>
        </Pressable>
      </View>

      <TextInput value={name} onChangeText={setName} style={s.badInput} placeholder="" />

      <View style={s.row}>
        <Pressable onPress={() => { T.tap('insurance_box'); setInsurance(!insurance); }}
          style={[s.box, insurance && s.boxOn]} />
        <Text style={s.faint}>Add insurance</Text>
      </View>

      <Pressable onPress={() => { T.tap('confirm_icon'); onConfirm(); }} style={s.goIcon}>
        <Text style={s.goText}>➡</Text>
      </Pressable>
    </View>
  );
}

/* ---------- Screen 3: Confirmation (accessible) ---------- */
function Confirm({ event, tickets, name, insurance, onDone }) {
  const rows = T.getReportRows();
  return (
    <View style={{ gap: 14 }}>
      <Text accessibilityRole="header" style={s.h1}>Booking confirmed</Text>
      <View style={s.card} accessible accessibilityLiveRegion="polite">
        <Text style={s.p}>
          {tickets} ticket{tickets > 1 ? 's' : ''} for {event.name} on {event.date}, booked for {name}.
          {insurance ? ' Insurance added.' : ''}
        </Text>
      </View>

      <Text accessibilityRole="header" style={s.h2}>Screen report so far</Text>
      {rows.map((r) => (
        <Text key={r.screen_name} style={s.p}>
          {r.screen_name}: screen reader {r.sr_time_s} s, score {r.struggle_score} ({r.flag})
        </Text>
      ))}

      <ExportButtons />
      <Btn id="book_another" label="Book another event" onPress={onDone} />
    </View>
  );
}

/* ---------- App shell ---------- */
export default function App() {
  const [screen, setScreen] = useState('Home');
  const [srState, setSrState] = useState(T.getState());
  const [event, setEvent] = useState(null);
  const [tickets, setTickets] = useState(1);
  const [name, setName] = useState('');
  const [insurance, setInsurance] = useState(false);
  const [error, setError] = useState('');

  const go = (next) => { setScreen(next); T.trackScreen(next); };

  useEffect(() => {
    T.start().then(() => T.trackScreen('Home'));
    const unsub = T.subscribe(() => setSrState(T.getState()));
    return () => { unsub(); T.stop(); };
  }, []);

  const goBack = () => {
    T.backNav();
    setError('');
    go('Home');
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'Home') return false;
      goBack();
      return true;
    });
    return () => sub.remove();
  }, [screen]);

  const confirm = () => {
    if (!name.trim()) {
      setError('Please enter your name');
      T.formError('name');
      return;
    }
    setError('');
    go('Confirm');
  };

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.pad}>
        {screen === 'Home' && (
          <Home srState={srState} onPick={(e) => { setEvent(e); setTickets(1); setName(''); setInsurance(false); go('Booking'); }} />
        )}
        {screen === 'Booking' && (
          <Booking event={event} tickets={tickets} setTickets={setTickets} name={name} setName={setName}
            insurance={insurance} setInsurance={setInsurance} error={error} onBack={goBack} onConfirm={confirm} />
        )}
        {screen === 'Confirm' && (
          <Confirm event={event} tickets={tickets} name={name} insurance={insurance} onDone={() => go('Home')} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  pad: { padding: 24, paddingTop: 48 },
  h1: { fontSize: 26, fontWeight: '700', color: '#111' },
  h2: { fontSize: 19, fontWeight: '700', color: '#111' },
  p: { fontSize: 17, color: '#222', lineHeight: 25 },
  card: { backgroundColor: '#eef3f8', padding: 16, borderRadius: 10, gap: 4 },
  status: { backgroundColor: '#f1f1f1', padding: 12, borderRadius: 10 },
  btn: { backgroundColor: '#0b5cad', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, minHeight: 48, justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  // inaccessible styles
  fakeTitle: { fontSize: 24, fontWeight: '700', color: '#111' },
  faint: { fontSize: 15, color: '#b5b5b5' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  tiny: { width: 24, height: 24, backgroundColor: '#e6e6e6', alignItems: 'center', justifyContent: 'center' },
  tinyText: { fontSize: 11, color: '#999' },
  box: { width: 20, height: 20, borderWidth: 1, borderColor: '#bbb' },
  boxOn: { backgroundColor: '#bbb' },
  badInput: { borderBottomWidth: 1, borderColor: '#ddd', height: 36, fontSize: 16 },
  goIcon: { width: 30, height: 30, backgroundColor: '#8fb4de', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  goText: { color: '#fff', fontSize: 14 },
  badError: { color: '#e36a6a', fontSize: 12 },
});
