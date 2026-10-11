import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';
import {
  ConversationProvider, useConversationControls, useConversationInput, useConversationMode, useConversationStatus,
} from '@elevenlabs/react';
import { api } from '../app/api';
import { useEventsStore } from '../app/eventsStore';
import { mapController } from '../app/mapController';
import { runFallback } from './fallback';
import { searchEvents } from './searchApi';
import { resultCards } from './resultCards';
import { fetchSession, sessionVariables } from './sessionApi';
import { createTools } from './tools';
import { transcriptReducer } from './transcript';
import './voice.css';

/** Shown before the first question; picking one asks it. */
const IDEAS = ['Robotics and free food near the library', 'I like tinkering with machines', "What's on tonight?"];

const ORB_LABEL = {
  idle: 'Tap to talk',
  connecting: 'Connecting…',
  listening: 'Listening…',
  speaking: 'Speaking…',
  muted: 'Muted',
};

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

  /** Draws the best results of the last search as cards, marking those the database found by meaning alone. */
  function showResults() {
    const cards = resultCards(tools.lastMatches(), useEventsStore.getState().buildings, now());
    dispatch({ type: 'add', role: 'results', text: cards.map((c) => c.id).join(','), cards });
  }

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
          const result = await tools.findEvents(args);
          showResults();
          return result;
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

  function submit(e: FormEvent) {
    e.preventDefault();
    void ask(text);
  }

  async function ask(question: string) {
    const sentence = question.trim();
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
      showResults();
      dispatch({ type: 'add', role: 'agent', text: said });
    } catch {
      dispatch({ type: 'add', role: 'agent', text: 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  const state = connected ? (isMuted ? 'muted' : isSpeaking ? 'speaking' : 'listening') : connecting ? 'connecting' : 'idle';
  const hint = connected
    ? isMuted ? 'Tap the mic to unmute' : 'Tap the mic to mute'
    : 'or type a question below';

  return (
    <section className="panel voice" data-state={state}>
      <header className="voice-head">
        <h2>Ask</h2>
        {connected && <span className="voice-live"><i aria-hidden="true" />Live</span>}
      </header>
      {!connected && !connecting && textMode && <p className="voice-status warn">{textMode}</p>}
      {lines.length > 0 ? (
        <ul className="voice-transcript" ref={transcriptRef}>
          {lines.map((l) =>
            l.role === 'results' ? (
              <li key={l.id} className="results">
                {l.cards?.map((c, i) => (
                  <button
                    key={c.id} type="button" className="voice-card" title="Show on the map"
                    onClick={() => void tools.focusEvent({ eventId: c.id })}
                  >
                    <span className="voice-card-rank">{i + 1}</span>
                    <span className="voice-card-body">
                      <strong>{c.title}</strong>
                      <span>{c.when} · {c.place}</span>
                      {(c.semantic || c.freeFood) && (
                        <span className="voice-badges">
                          {c.semantic && <em className="meaning">Matched by meaning</em>}
                          {c.freeFood && <em className="food">Free food</em>}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </li>
            ) : (
              <li key={l.id} className={l.role}>{l.text}</li>
            ),
          )}
        </ul>
      ) : (
        <div className="voice-ideas">
          <span>Try asking</span>
          {IDEAS.map((idea) => (
            <button key={idea} type="button" onClick={() => void ask(idea)} disabled={busy}>{idea}</button>
          ))}
        </div>
      )}
      <div className="voice-stage">
        <button
          type="button" className="voice-orb" disabled={connecting}
          onClick={connected ? () => setMuted(!isMuted) : start}
          aria-label={connected ? (isMuted ? 'Unmute' : 'Mute') : 'Talk'}
        >
          <span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <svg className="voice-mic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 0 0-7 0v5A3.5 3.5 0 0 0 12 15Z" />
            <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21M9 21h6" />
          </svg>
        </button>
        <div className="voice-stage-text">
          <strong>{ORB_LABEL[state]}</strong>
          <span>{hint}</span>
        </div>
        {connected && <button type="button" className="voice-end" onClick={() => endSession()}>End</button>}
      </div>
      <form className="voice-row" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about events"
          aria-label="Ask about events"
        />
        <button type="submit" disabled={busy || !text.trim()}>Ask</button>
      </form>
    </section>
  );
}
