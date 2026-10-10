import { describe, expect, it } from 'vitest';
import { buildingsToGeoJSON } from './geo';

describe('buildingsToGeoJSON', () => {
  it('makes one polygon feature per building, keyed by id', () => {
    const fc = buildingsToGeoJSON([
      { id: 'b1', name: 'B1', aliases: [], lng: 0, lat: 0, heightM: 12, footprint: [[0, 0], [1, 0], [1, 1], [0, 0]] },
    ]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toEqual({ id: 'b1', name: 'B1', heightM: 12 });
    expect(fc.features[0].geometry).toEqual({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] });
  });

  it('returns an empty collection for no buildings', () => {
    expect(buildingsToGeoJSON([]).features).toEqual([]);
  });
});
