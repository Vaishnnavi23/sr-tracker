import React, { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, View, Text, Pressable, Share, StyleSheet } from 'react-native';
import * as Tracker from './ScreenReaderTracker';

const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
};

function Btn({ label, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.btn}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [state, setState] = useState(Tracker.getState());
  const [log, setLog] = useState([]);

  useEffect(() => {
    const refresh = () => {
      setState(Tracker.getState());
      setLog(Tracker.getLog());
    };
    Tracker.start().then(refresh);
    const unsub = Tracker.subscribe(refresh);
    const tick = setInterval(() => setState(Tracker.getState()), 1000);
    return () => {
      unsub();
      clearInterval(tick);
      Tracker.stop();
    };
  }, []);

  const exportCsv = () => Share.share({ title: 'screen_reader_data.csv', message: Tracker.toCsv() });

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.pad}>
        <Text accessibilityRole="header" style={styles.h1}>Screen reader tracker</Text>

        <View style={[styles.card, state.screenReaderOn ? styles.on : styles.off]}>
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            Screen reader is {state.screenReaderOn ? 'ON' : 'OFF'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.p}>On for (current): {fmt(state.currentOnMs)}</Text>
          <Text style={styles.p}>Total on this session: {fmt(state.totalOnMs)}</Text>
          <Text style={styles.p}>Session length: {fmt(state.sessionMs)}</Text>
          <Text style={styles.p}>Times switched: {state.toggles}</Text>
        </View>

        <Btn label="Export CSV" onPress={exportCsv} />
        <Btn label="Reset" onPress={Tracker.reset} />

        <Text accessibilityRole="header" style={styles.h2}>Event log</Text>
        {log.slice(-10).reverse().map((r, i) => (
          <Text key={i} style={styles.log}>
            {r.timestamp.slice(11, 19)}  {r.event}  SR={String(r.screen_reader_on)}  ({r.source})
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  pad: { padding: 24, paddingTop: 48, gap: 14 },
  h1: { fontSize: 26, fontWeight: '700', color: '#111' },
  h2: { fontSize: 20, fontWeight: '700', color: '#111', marginTop: 8 },
  p: { fontSize: 17, color: '#222', lineHeight: 26 },
  status: { fontSize: 22, fontWeight: '700', color: '#111' },
  card: { backgroundColor: '#eef3f8', padding: 16, borderRadius: 10 },
  on: { backgroundColor: '#d9f2e0' },
  off: { backgroundColor: '#f3e2e2' },
  btn: { backgroundColor: '#0b5cad', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, minHeight: 48, justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  log: { fontSize: 14, color: '#333', fontFamily: 'monospace' },
});
