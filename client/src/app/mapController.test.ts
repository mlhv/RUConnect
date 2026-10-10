import { describe, expect, it, vi } from 'vitest';
import { mapController, registerMapController } from './mapController';

describe('mapController', () => {
  it('does nothing before a map registers', () => {
    registerMapController(null);
    expect(() => mapController.flyTo('scott-hall')).not.toThrow();
    expect(() => mapController.highlight(['a'])).not.toThrow();
  });

  it('forwards calls to the registered controller and stops after unregistering', () => {
    const real = { flyTo: vi.fn(), highlight: vi.fn(), clearHighlight: vi.fn(), setTime: vi.fn() };
    registerMapController(real);
    mapController.flyTo('scott-hall');
    mapController.highlight(['a', 'b']);
    mapController.clearHighlight();
    mapController.setTime('2026-10-10T23:30:00.000Z');
    expect(real.flyTo).toHaveBeenCalledWith('scott-hall');
    expect(real.highlight).toHaveBeenCalledWith(['a', 'b']);
    expect(real.clearHighlight).toHaveBeenCalledOnce();
    expect(real.setTime).toHaveBeenCalledWith('2026-10-10T23:30:00.000Z');
    registerMapController(null);
    mapController.flyTo('x');
    expect(real.flyTo).toHaveBeenCalledOnce();
  });
});
