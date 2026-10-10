import { useEffect } from 'react';
import { IngestPanel } from '../ingest';
import { MapView } from '../map';
import { VoicePanel } from '../voice';
import { useEventsStore } from './eventsStore';

export function App() {
  const load = useEventsStore((s) => s.load);
  const offline = useEventsStore((s) => s.offline);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="app">
      <MapView />
      <header className="title">
        RUConnect
        {offline && <span className="offline">offline: showing saved events</span>}
      </header>
      <aside className="sidebar">
        <VoicePanel />
        <IngestPanel />
      </aside>
    </div>
  );
}
