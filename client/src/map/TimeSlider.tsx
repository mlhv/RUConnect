import { useEventsStore } from '../app/eventsStore';
import { SLIDER_STEPS, sliderIndex, timeAtIndex } from './time';

export function TimeSlider() {
  const selectedTime = useEventsStore((s) => s.selectedTime);
  const setSelectedTime = useEventsStore((s) => s.setSelectedTime);
  const label = new Date(selectedTime).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  return (
    <label className="time-slider">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={SLIDER_STEPS - 1}
        value={sliderIndex(selectedTime)}
        onChange={(e) => setSelectedTime(timeAtIndex(selectedTime, Number(e.target.value)))}
      />
    </label>
  );
}
