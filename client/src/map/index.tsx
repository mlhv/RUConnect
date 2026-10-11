import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { MapController } from '@ruconnect/shared';
import { useEventsStore } from '../app/eventsStore';
import { registerMapController } from '../app/mapController';
import { CATEGORY_COLORS, buildingCategories } from './activity';
import { BuildingPanel } from './BuildingPanel';
import { buildingsToGeoJSON, cameraPadding } from './geo';
import { eventsForBuilding } from './panel';
import { TimeSlider } from './TimeSlider';
import './map.css';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const SOURCE = 'ru-buildings';
const LAYER = 'ru-buildings-3d';
const GLOW_LAYER = 'ru-buildings-glow';
const LABEL_LAYER = 'ru-buildings-labels';
const CONTEXT_LAYER = 'ru-context-3d';
const IS_EXTRUDED: mapboxgl.ExpressionSpecification = ['==', ['get', 'extrude'], 'true'];
const CENTER: [number, number] = [-74.449, 40.5015];
const BASE_COLOR = '#3a4a6b';
const HIGHLIGHT_COLOR = '#ffd166';
/** How far a lit building brightens towards white at the top of its pulse. */
const PULSE_DEPTH = 0.35;
const PULSE_PERIOD_MS = 2400;
const PULSE_FRAME_MS = 66;
const FLIGHT_MS = 3200;
/** Degrees the camera swings round during a flight, and then per orbit leg once it has arrived. */
const FLIGHT_TURN_DEG = 40;
const ORBIT_TURN_DEG = 60;
const ORBIT_MS = 30000;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * A lit building's colour, brightened towards white by its `pulse` feature state. The pulse is a
 * feature state because changing the paint expression itself makes Mapbox reload the building tiles.
 */
const lit = (color: mapboxgl.ExpressionSpecification | string): mapboxgl.ExpressionSpecification =>
  ['interpolate', ['linear'], ['number', ['feature-state', 'pulse'], 0], 0, color, 1, '#ffffff'];
const BUILDING_COLOR: mapboxgl.ExpressionSpecification = [
  'case',
  ['boolean', ['feature-state', 'highlight'], false], lit(HIGHLIGHT_COLOR),
  ['boolean', ['feature-state', 'active'], false], lit(['to-color', ['feature-state', 'color'], CATEGORY_COLORS.other]),
  BASE_COLOR,
];
const PULSE: mapboxgl.ExpressionSpecification = ['number', ['feature-state', 'pulse'], 0];
const IS_HIGHLIGHT: mapboxgl.ExpressionSpecification = ['boolean', ['feature-state', 'highlight'], false];
const IS_LIT: mapboxgl.ExpressionSpecification = ['any', IS_HIGHLIGHT, ['boolean', ['feature-state', 'active'], false]];
/** A lit building's own colour, for the glow on the ground around it. */
const GLOW_COLOR: mapboxgl.ExpressionSpecification = [
  'case', IS_HIGHLIGHT, HIGHLIGHT_COLOR, ['to-color', ['feature-state', 'color'], CATEGORY_COLORS.other],
];

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  /** Buildings the pulse runs on: active ones and highlighted ones. */
  const activeRef = useRef<string[]>([]);
  const highlightedRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const buildings = useEventsStore((s) => s.buildings);
  const events = useEventsStore((s) => s.events);
  const selectedTime = useEventsStore((s) => s.selectedTime);

  useEffect(() => {
    if (!TOKEN || !container.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: CENTER,
      zoom: 15.5,
      pitch: 60,
      bearing: -30,
      antialias: true,
    });
    mapRef.current = map;
    /** Counts flights, so an older flight's arrival does not start an orbit over a newer one. */
    let flights = 0;

    const controller: MapController = {
      flyTo(buildingId) {
        const b = useEventsStore.getState().buildings.find((x) => x.id === buildingId);
        if (!b) return;
        const flight = ++flights;
        map.flyTo({
          center: [b.lng, b.lat], zoom: 17.2, pitch: 62, bearing: map.getBearing() + FLIGHT_TURN_DEG,
          duration: FLIGHT_MS, curve: 1.3, easing: easeInOut, padding: cameraPadding(window.innerWidth),
        });
        map.once('moveend', () => {
          // Circle the building slowly once there. Skipped when the flight was cut short; any input stops it.
          const arrived = map.getCenter().distanceTo(new mapboxgl.LngLat(b.lng, b.lat)) < 5;
          if (flight !== flights || !arrived) return;
          map.easeTo({ bearing: map.getBearing() + ORBIT_TURN_DEG, duration: ORBIT_MS, easing: (t) => t });
        });
      },
      openBuilding(buildingId) {
        setOpenId(buildingId);
      },
      highlight(buildingIds) {
        controller.clearHighlight();
        for (const id of buildingIds) map.setFeatureState({ source: SOURCE, id }, { highlight: true });
        highlightedRef.current = buildingIds;
      },
      clearHighlight() {
        for (const id of highlightedRef.current) map.setFeatureState({ source: SOURCE, id }, { highlight: false });
        highlightedRef.current = [];
      },
      setTime(iso) {
        useEventsStore.getState().setSelectedTime(iso);
      },
    };

    // 'style.load' comes before the basemap tiles, so the controller is not held up by a slow network.
    map.once('style.load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: buildingsToGeoJSON([]), promoteId: 'id' });
      // The basemap's own buildings, dim, so the campus does not stand on an empty plain.
      map.addLayer({
        id: CONTEXT_LAYER,
        type: 'fill-extrusion',
        source: 'composite',
        'source-layer': 'building',
        minzoom: 14,
        filter: IS_EXTRUDED,
        paint: {
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-color': '#1b202c',
          'fill-extrusion-opacity': 0.8,
        },
      });
      // A soft ring of the building's colour on the ground around it, breathing with the pulse.
      map.addLayer({
        id: GLOW_LAYER,
        type: 'line',
        source: SOURCE,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': GLOW_COLOR,
          'line-width': ['interpolate', ['exponential', 2], ['zoom'], 14, 8, 18, 90],
          'line-blur': ['interpolate', ['exponential', 2], ['zoom'], 14, 8, 18, 70],
          'line-opacity': ['case', IS_LIT, ['+', 0.4, PULSE], 0],
        },
      });
      map.addLayer({
        id: LAYER,
        type: 'fill-extrusion',
        source: SOURCE,
        layout: { 'fill-extrusion-edge-radius': 0.6 },
        paint: {
          'fill-extrusion-height': ['get', 'heightM'],
          'fill-extrusion-opacity': 0.95,
          'fill-extrusion-color': BUILDING_COLOR,
          'fill-extrusion-ambient-occlusion-intensity': 0.4,
          'fill-extrusion-ambient-occlusion-radius': 4,
        },
      });
      // Names float over lit buildings only.
      map.addLayer({
        id: LABEL_LAYER,
        type: 'symbol',
        source: SOURCE,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 13,
          'text-max-width': 8,
          'text-allow-overlap': true,
          'symbol-z-elevate': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(13, 18, 32, 0.9)',
          'text-halo-width': 1.5,
          'text-opacity': ['case', IS_LIT, 1, 0],
        },
      });
      map.setPadding(cameraPadding(window.innerWidth));
      map.on('click', (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: [LAYER] })[0];
        setOpenId(hit?.id == null ? null : String(hit.id));
      });
      map.on('mouseenter', LAYER, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', LAYER, () => {
        map.getCanvas().style.cursor = '';
      });
      registerMapController(controller);
      setReady(true);
    });

    return () => {
      registerMapController(null);
      setReady(false);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource(SOURCE) as mapboxgl.GeoJSONSource).setData(buildingsToGeoJSON(buildings));
    // Hide the basemap's copy of each of our buildings, or the two would overlap and flicker.
    const ours = { type: 'MultiPolygon' as const, coordinates: buildings.map((b) => [b.footprint]) };
    map.setFilter(CONTEXT_LAYER, buildings.length ? ['all', IS_EXTRUDED, ['>', ['distance', ours], 3]] : IS_EXTRUDED);
  }, [ready, buildings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const categories = buildingCategories(events, selectedTime);
    activeRef.current = [...categories.keys()];
    for (const b of buildings) {
      const category = categories.get(b.id);
      map.setFeatureState(
        { source: SOURCE, id: b.id },
        { active: category !== undefined, color: category ? CATEGORY_COLORS[category] : null },
      );
    }
  }, [ready, buildings, events, selectedTime]);

  // Lit buildings breathe.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let last = 0;
    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick);
      if (ms - last < PULSE_FRAME_MS) return;
      last = ms;
      const pulse = PULSE_DEPTH * (0.5 - 0.5 * Math.cos((ms / PULSE_PERIOD_MS) * 2 * Math.PI));
      for (const id of new Set([...activeRef.current, ...highlightedRef.current])) {
        map.setFeatureState({ source: SOURCE, id }, { pulse });
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  const openBuilding = buildings.find((b) => b.id === openId);

  if (!TOKEN) {
    return <div className="map-missing">Set VITE_MAPBOX_TOKEN in .env and restart to see the map.</div>;
  }
  return (
    <>
      <div ref={container} className="map" />
      {openBuilding && (
        <BuildingPanel
          building={openBuilding}
          events={eventsForBuilding(events, openBuilding.id, selectedTime)}
          onClose={() => setOpenId(null)}
        />
      )}
      <TimeSlider />
    </>
  );
}
