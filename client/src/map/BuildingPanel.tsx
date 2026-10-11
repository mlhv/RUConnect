import type { Building, CampusEvent } from '@ruconnect/shared';
import { CATEGORY_COLORS } from './activity';
import type { BuildingEvents } from './panel';

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function EventRow({ event }: { event: CampusEvent }) {
  return (
    <li>
      <i style={{ background: CATEGORY_COLORS[event.category] }} title={event.category} />
      <div>
        <strong>{event.title}</strong>
        <span>
          {clock(event.start)} to {clock(event.end)}
          {event.room && ` · ${event.room}`}
        </span>
        {event.freeFood && <em>Free food</em>}
      </div>
    </li>
  );
}

export function BuildingPanel(props: { building: Building; events: BuildingEvents; onClose(): void }) {
  const { building, events, onClose } = props;
  const empty = events.now.length === 0 && events.later.length === 0;

  return (
    <section className="panel map-building">
      <header>
        <h2>{building.name}</h2>
        <button type="button" aria-label="Close" onClick={onClose}>×</button>
      </header>
      {empty && <p>Nothing here for the rest of the day.</p>}
      {events.now.length > 0 && (
        <>
          <h3>Happening now</h3>
          <ul>{events.now.map((e) => <EventRow key={e.id} event={e} />)}</ul>
        </>
      )}
      {events.later.length > 0 && (
        <>
          <h3>Later today</h3>
          <ul>{events.later.map((e) => <EventRow key={e.id} event={e} />)}</ul>
        </>
      )}
    </section>
  );
}
