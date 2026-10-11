import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';
import { api } from '../app/api';
import { useEventsStore } from '../app/eventsStore';
import { mapController } from '../app/mapController';
import { runFallback } from './fallback';
import { searchEvents } from './searchApi';
import { createTools } from './tools';
import { transcriptReducer } from './transcript';
import './voice.css';

function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

/** Mounted by app/App.tsx in the right-hand column. */
export function VoicePanel() {
  const [lines, dispatch] = useReducer(transcriptReducer, []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const demoNow = useRef<string | null>(null);
  const transcriptRef = useRef<HTMLUListElement>(null);
  const now = () => demoNow.current ?? new Date().toISOString();

  useEffect(() => {
    api.config().then((c) => { demoNow.current = c.now; }).catch(() => {});
  }, []);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const tools = useMemo(
    () =>
      createTools({
        search: (req) => searchEvents(req),
        map: mapController,
        getBuildings: () => useEventsStore.getState().buildings,
        getEvents: () => useEventsStore.getState().events,
        now,
      }),
    [],
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    const sentence = text.trim();
    if (!sentence || busy) return;
    setText('');
    setBusy(true);
    dispatch({ type: 'add', role: 'user', text: sentence });
    dispatch({ type: 'add', role: 'tool', text: 'Searching events…' });
    try {
      const said = await runFallback(sentence, {
        tools, getBuildings: () => useEventsStore.getState().buildings, now, speak,
      });
      dispatch({ type: 'add', role: 'agent', text: said });
    } catch {
      dispatch({ type: 'add', role: 'agent', text: 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Ask</h2>
      {lines.length > 0 && (
        <ul className="voice-transcript" ref={transcriptRef}>
          {lines.map((l) => <li key={l.id} className={l.role}>{l.text}</li>)}
        </ul>
      )}
      <form className="voice-row" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Robotics and free food near the library"
          aria-label="Ask about events"
        />
        <button type="submit" disabled={busy || !text.trim()}>Ask</button>
      </form>
    </section>
  );
}
