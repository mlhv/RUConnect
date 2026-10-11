import { useRef, useState } from 'react';
import { z } from 'zod';
import { CampusEventSchema, SwarmStepSchema, type CampusEvent, type SwarmStep } from '@ruconnect/shared';
import { useEventsStore } from '../app/eventsStore';
import { mapController } from '../app/mapController';
import './ingest.css';

const StartedSchema = z.object({
  runId: z.string(),
  items: z.array(z.object({ itemId: z.string(), name: z.string() })),
});
const EventMessageSchema = z.object({ itemId: z.string(), event: CampusEventSchema });

type Worker = SwarmStep['worker'];
/** Chip labels: the Verifier step is where the Critic agent works, and the Reconciler is its second read. */
const AGENT_LABEL: Record<Worker, string> = {
  scout: 'Scout', reader: 'Reader', verifier: 'Critic', reconciler: 'Re-read', locator: 'Locator', deduper: 'Deduper',
};

interface ItemRow {
  itemId: string;
  name: string;
  /** Uploads fly the camera to their event; scraped sites add many events at once and do not. */
  flyTo: boolean;
  steps: Partial<Record<Worker, { state: SwarmStep['state']; summary: string }>>;
  /** The newest agent message, shown under the chips so the hand-offs are visible. */
  latest: { worker: Worker; summary: string; failed: boolean } | null;
  events: CampusEvent[];
}

/** Puts a published event on the map, optionally pointing the camera and slider at it. */
function showOnMap(event: CampusEvent, fly: boolean): void {
  useEventsStore.getState().upsertEvent(event);
  if (!fly) return;
  mapController.setTime(event.start);
  mapController.flyTo(event.buildingId);
}

export function IngestPanel() {
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const updateRow = (itemId: string, fn: (row: ItemRow) => ItemRow) =>
    setRows((rs) => rs.map((r) => (r.itemId === itemId ? fn(r) : r)));

  async function start(body: BodyInit, headers: HeadersInit | undefined, flyTo: boolean) {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/ingest/runs', { method: 'POST', body, headers });
      if (!res.ok) throw new Error(`could not start (${res.status})`);
      const started = StartedSchema.parse(await res.json());
      setRows((rs) => [...started.items.map((i) => ({ ...i, flyTo, steps: {}, latest: null, events: [] })), ...rs]);
      listen(started.runId, flyTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function upload(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    for (const f of files) form.append('files', f);
    void start(form, undefined, true);
  }

  function scrapeSites() {
    void start(JSON.stringify({ capture: 'board' }), { 'Content-Type': 'application/json' }, false);
  }

  function listen(runId: string, flyTo: boolean) {
    const source = new EventSource(`/api/ingest/runs/${runId}/stream`);
    source.addEventListener('step', (e) => {
      const step = SwarmStepSchema.parse(JSON.parse(e.data));
      updateRow(step.itemId, (r) => ({
        ...r,
        steps: { ...r.steps, [step.worker]: { state: step.state, summary: step.summary } },
        latest: { worker: step.worker, summary: step.summary, failed: step.state === 'failed' },
      }));
    });
    source.addEventListener('event', (e) => {
      const { itemId, event } = EventMessageSchema.parse(JSON.parse(e.data));
      updateRow(itemId, (r) => ({ ...r, events: [...r.events, event] }));
      if (event.status === 'published') showOnMap(event, flyTo);
    });
    const close = () => {
      source.close();
      setBusy(false);
    };
    source.addEventListener('done', close);
    // The server ends the stream after "done"; without closing here, EventSource would reconnect and replay.
    source.onerror = close;
  }

  async function approve(itemId: string, event: CampusEvent) {
    const res = await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });
    if (!res.ok) return setError(`could not publish (${res.status})`);
    const saved = CampusEventSchema.parse(await res.json());
    updateRow(itemId, (r) => ({ ...r, events: r.events.map((e) => (e.id === saved.id ? saved : e)) }));
    showOnMap(saved, true);
  }

  return (
    <section className="panel ingest">
      <h2>Add events</h2>
      <div className="ingest-actions">
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>Upload flyers</button>
        <button type="button" disabled={busy} onClick={() => cameraInput.current?.click()}>Take photo</button>
        <button type="button" disabled={busy} onClick={scrapeSites}>Scrape Rutgers sites</button>
      </div>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      {error && <p className="ingest-error">{error}</p>}
      <ul className="ingest-rows">
        {rows.map((row) => (
          <li key={row.itemId}>
            <div className="ingest-name">{row.flyTo && row.events[0] ? row.events[0].title : row.name}</div>
            <div className="ingest-chips">
              {(Object.entries(row.steps) as [Worker, { state: string; summary: string }][]).map(([worker, s]) => (
                <span key={worker} className={`chip chip-${s.state}`} title={s.summary}>{AGENT_LABEL[worker]}</span>
              ))}
            </div>
            {row.latest && (
              <p className={row.latest.failed ? 'ingest-error' : 'ingest-summary'}>
                <strong>{AGENT_LABEL[row.latest.worker]}:</strong> {row.latest.summary}
              </p>
            )}
            {row.events.filter((e) => e.status === 'needs_review').map((e) => (
              <p key={e.id} className="ingest-review">
                Review: {e.title} ({Math.round(e.confidence * 100)}%){' '}
                <button type="button" onClick={() => void approve(row.itemId, e)}>Publish</button>
              </p>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
