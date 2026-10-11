import { describe, expect, it } from 'vitest';
import { beaconsToGeoJSON, buildingsToGeoJSON, cameraPadding, labelsToGeoJSON } from './geo';

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

describe('cameraPadding', () => {
  it('keeps the fly-to target clear of the sidebar on a wide screen', () => {
    expect(cameraPadding(1440)).toEqual({ top: 0, bottom: 0, left: 0, right: 352 });
  });

  it('adds no padding when the sidebar spans the screen', () => {
    expect(cameraPadding(390)).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

describe('beaconsToGeoJSON', () => {
  const building = { id: 'b1', name: 'B1', aliases: [], lng: -74.45, lat: 40.5, heightM: 12, footprint: [[0, 0], [1, 0], [1, 1], [0, 0]] as [number, number][] };

  it('makes a closed column for every building, starting at its roof', () => {
    const fc = beaconsToGeoJSON([building, { ...building, id: 'b2', heightM: 20 }]);
    expect(fc.features.map((f) => f.properties)).toEqual([{ id: 'b1', baseM: 12 }, { id: 'b2', baseM: 20 }]);
    const ring = fc.features[0].geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBeGreaterThan(8);
  });

  it('keeps every point of the column a few metres from the building centre', () => {
    const fc = beaconsToGeoJSON([building]);
    for (const [lng, lat] of fc.features[0].geometry.coordinates[0]) {
      const eastM = (lng - building.lng) * 111_320 * Math.cos((building.lat * Math.PI) / 180);
      const northM = (lat - building.lat) * 111_320;
      expect(Math.hypot(eastM, northM)).toBeCloseTo(3, 1);
    }
  });
});

describe('labelsToGeoJSON', () => {
  it('makes one named point per building at its centre', () => {
    const fc = labelsToGeoJSON([
      { id: 'b1', name: 'B1', aliases: [], lng: -74.45, lat: 40.5, heightM: 12, footprint: [[0, 0], [1, 0], [1, 1], [0, 0]] },
    ]);
    expect(fc.features).toEqual([
      { type: 'Feature', properties: { id: 'b1', name: 'B1' }, geometry: { type: 'Point', coordinates: [-74.45, 40.5] } },
    ]);
  });
});
