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
interface ItemRow {
  itemId: string;
  name: string;
  steps: Partial<Record<Worker, { state: SwarmStep['state']; summary: string }>>;
  event?: CampusEvent;
}

/** Puts a published event on the map and points the camera and slider at it. */
function showOnMap(event: CampusEvent): void {
  useEventsStore.getState().upsertEvent(event);
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

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    const form = new FormData();
    for (const f of files) form.append('files', f);
    try {
      const res = await fetch('/api/ingest/runs', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`upload failed (${res.status})`);
      const started = StartedSchema.parse(await res.json());
      setRows((rs) => [...started.items.map((i) => ({ ...i, steps: {} })), ...rs]);
      listen(started.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function listen(runId: string) {
    const source = new EventSource(`/api/ingest/runs/${runId}/stream`);
    source.addEventListener('step', (e) => {
      const step = SwarmStepSchema.parse(JSON.parse(e.data));
      updateRow(step.itemId, (r) => ({ ...r, steps: { ...r.steps, [step.worker]: { state: step.state, summary: step.summary } } }));
    });
    source.addEventListener('event', (e) => {
      const { itemId, event } = EventMessageSchema.parse(JSON.parse(e.data));
      updateRow(itemId, (r) => ({ ...r, event }));
      if (event.status === 'published') showOnMap(event);
    });
    const close = () => {
      source.close();
      setBusy(false);
    };
    source.addEventListener('done', close);
    // The server ends the stream after "done"; without closing here, EventSource would reconnect and replay.
    source.onerror = close;
  }

  async function approve(row: ItemRow) {
    if (!row.event) return;
    const res = await fetch(`/api/events/${row.event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });
    if (!res.ok) return setError(`could not publish (${res.status})`);
    const event = CampusEventSchema.parse(await res.json());
    updateRow(row.itemId, (r) => ({ ...r, event }));
    showOnMap(event);
  }

  return (
    <section className="panel ingest">
      <h2>Add events</h2>
      <div className="ingest-actions">
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>Upload flyers</button>
        <button type="button" disabled={busy} onClick={() => cameraInput.current?.click()}>Take photo</button>
      </div>
      <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
      {error && <p className="ingest-error">{error}</p>}
      <ul className="ingest-rows">
        {rows.map((row) => (
          <li key={row.itemId}>
            <div className="ingest-name">{row.event?.title ?? row.name}</div>
            <div className="ingest-chips">
              {(Object.entries(row.steps) as [Worker, { state: string; summary: string }][]).map(([worker, s]) => (
                <span key={worker} className={`chip chip-${s.state}`} title={s.summary}>{worker}</span>
              ))}
            </div>
            {failureOf(row) && <p className="ingest-error">{failureOf(row)}</p>}
            {row.event?.status === 'needs_review' && (
              <p className="ingest-review">
                Needs review ({Math.round(row.event.confidence * 100)}% confident).{' '}
                <button type="button" onClick={() => void approve(row)}>Publish anyway</button>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function failureOf(row: ItemRow): string | null {
  return Object.values(row.steps).find((s) => s?.state === 'failed')?.summary ?? null;
}
