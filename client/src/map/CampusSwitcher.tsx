import { CAMPUSES, type Campus, type CampusId } from './campus';

interface Props {
  /** The campus the camera is over. */
  current: CampusId;
  /** Events under way on each campus at the slider's time. */
  counts: Map<CampusId, number>;
  onSelect(campus: Campus): void;
}

export function CampusSwitcher({ current, counts, onSelect }: Props) {
  return (
    <nav className="campus-switcher" aria-label="Campus">
      {CAMPUSES.map((campus) => {
        const live = counts.get(campus.id) ?? 0;
        return (
          <button
            key={campus.id}
            type="button"
            aria-pressed={campus.id === current}
            aria-label={`${campus.name}, ${live} ${live === 1 ? 'event' : 'events'} now`}
            onClick={() => onSelect(campus)}
          >
            {campus.name}
            <span className={live ? 'campus-live' : undefined}>{live}</span>
          </button>
        );
      })}
    </nav>
  );
}
