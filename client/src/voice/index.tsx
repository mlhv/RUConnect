import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';
import {
  ConversationProvider, useConversationControls, useConversationInput, useConversationMode, useConversationStatus,
} from '@elevenlabs/react';
import { api } from '../app/api';
import { useEventsStore } from '../app/eventsStore';
import { mapController } from '../app/mapController';
import { runFallback } from './fallback';
import { searchEvents } from './searchApi';
import { fetchSession, sessionVariables } from './sessionApi';
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
  return (
    <ConversationProvider>
      <Panel />
    </ConversationProvider>
  );
}

function Panel() {
  const { startSession, endSession, sendUserMessage } = useConversationControls();
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const { isMuted, setMuted } = useConversationInput();

  const [lines, dispatch] = useReducer(transcriptReducer, []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  /** Why voice is unavailable, or null. While set, the text box uses the fallback. */
  const [textMode, setTextMode] = useState<string | null>(null);
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

  const connected = status === 'connected';
  const connecting = starting || status === 'connecting';

  async function start() {
    setTextMode(null);
    setStarting(true);
    try {
      // Ask for the microphone first so a refusal is reported before a session is spent.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      setTextMode('Microphone is blocked. Type instead.');
      setStarting(false);
      return;
    }
    let session;
    try {
      session = await fetchSession();
    } catch {
      setTextMode('Voice is unavailable. Type instead.');
      setStarting(false);
      return;
    }
    window.speechSynthesis?.cancel();
    startSession({
      signedUrl: session.signedUrl,
      dynamicVariables: sessionVariables(session.now, useEventsStore.getState().buildings),
      clientTools: {
        find_events: async (args: unknown) => {
          dispatch({ type: 'add', role: 'tool', text: 'Searching events…' });
          return tools.findEvents(args);
        },
        focus_event: async (args: unknown) => {
          dispatch({ type: 'add', role: 'tool', text: 'Moving the map…' });
          return tools.focusEvent(args);
        },
      },
      onMessage: ({ message, role }) =>
        dispatch({ type: 'add', role: role === 'user' ? 'user' : 'agent', text: message }),
      onError: (message) => {
        console.warn('Voice session error:', message);
        setTextMode('Voice connection failed. Type instead.');
        // Not every error closes the call. End it so the controls and the call agree.
        endSession();
      },
      onDisconnect: (details) => {
        if (details.reason === 'error') setTextMode('Voice disconnected. Type instead.');
      },
    });
    setStarting(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const sentence = text.trim();
    if (!sentence || busy) return;
    setText('');
    dispatch({ type: 'add', role: 'user', text: sentence });
    if (connected) {
      try {
        sendUserMessage(sentence);
        return;
      } catch {
        // The call dropped between render and submit: answer from the fallback instead.
      }
    }
    setBusy(true);
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

  const statusText = connected
    ? isMuted ? 'Muted' : isSpeaking ? 'Speaking…' : 'Listening…'
    : connecting ? 'Connecting…' : textMode;

  return (
    <section className="panel">
      <h2>Ask</h2>
      {statusText && <p className={`voice-status${!connected && textMode ? ' warn' : ''}`}>{statusText}</p>}
      {lines.length > 0 && (
        <ul className="voice-transcript" ref={transcriptRef}>
          {lines.map((l) => <li key={l.id} className={l.role}>{l.text}</li>)}
        </ul>
      )}
      <div className="voice-row">
        {connected ? (
          <>
            <button type="button" className={isMuted ? 'active' : 'secondary'} onClick={() => setMuted(!isMuted)}>
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" className="secondary" onClick={() => endSession()}>End</button>
          </>
        ) : (
          <button type="button" onClick={start} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Talk'}
          </button>
        )}
      </div>
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
