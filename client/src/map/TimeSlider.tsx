import { useEffect, useState } from 'react';
import { useEventsStore } from '../app/eventsStore';
import { SLIDER_STEPS, nextStep, sliderIndex, timeAtIndex } from './time';

/** How long each 15-minute step stays on screen while playing. */
const PLAY_STEP_MS = 450;
/** Where playback restarts from when Play is pressed at the end of the day: 8 AM. */
const DAY_START_INDEX = 32;

export function TimeSlider() {
  const selectedTime = useEventsStore((s) => s.selectedTime);
  const setSelectedTime = useEventsStore((s) => s.setSelectedTime);
  const [playing, setPlaying] = useState(false);
  const label = new Date(selectedTime).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = nextStep(useEventsStore.getState().selectedTime);
      if (next === null) setPlaying(false);
      else setSelectedTime(next);
    }, PLAY_STEP_MS);
    return () => clearInterval(timer);
  }, [playing, setSelectedTime]);

  function togglePlay() {
    if (!playing && nextStep(selectedTime) === null) setSelectedTime(timeAtIndex(selectedTime, DAY_START_INDEX));
    setPlaying(!playing);
  }

  return (
    <div className="time-slider">
      <button type="button" className="time-play" aria-label={playing ? 'Pause' : 'Play through the day'} onClick={togglePlay}>
        {playing ? '❚❚' : '▶'}
      </button>
      <span>{label}</span>
      <input
        type="range"
        aria-label="Time of day"
        min={0}
        max={SLIDER_STEPS - 1}
        value={sliderIndex(selectedTime)}
        onChange={(e) => {
          setPlaying(false);
          setSelectedTime(timeAtIndex(selectedTime, Number(e.target.value)));
        }}
      />
    </div>
  );
}
