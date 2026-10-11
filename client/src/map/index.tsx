import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapController } from '@ruconnect/shared';
import { useEventsStore } from '../app/eventsStore';
import { registerMapController } from '../app/mapController';
import { CATEGORY_COLORS, beaconHeightM, buildingAttendance, buildingCategories } from './activity';
import { BuildingPanel } from './BuildingPanel';
import { CAMPUSES, campusAt, flightMs, liveCounts, type Campus } from './campus';
import { CampusSwitcher } from './CampusSwitcher';
import { approach } from './fade';
import { beaconsToGeoJSON, buildingsToGeoJSON, cameraPadding, labelsToGeoJSON } from './geo';
import { eventsForBuilding } from './panel';
import { TimeSlider } from './TimeSlider';
import './map.css';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const SOURCE = 'ru-buildings';
const LAYER = 'ru-buildings-3d';
const GLOW_LAYER = 'ru-buildings-glow';
const LABEL_SOURCE = 'ru-labels';
const LABEL_LAYER = 'ru-buildings-labels';
const CONTEXT_LAYER = 'ru-context-3d';
const BEACON_SOURCE = 'ru-beacons';
const BEACON_LAYER = 'ru-beacons-3d';
/** The camera opens a little further out and settles here, so the first view is already moving. */
const HOME = CAMPUSES[0];
const OPENING_MS = 4500;
const IS_EXTRUDED: mapboxgl.ExpressionSpecification = ['==', ['get', 'extrude'], 'true'];
const BASE_COLOR = '#3a4a6b';
const HIGHLIGHT_COLOR = '#ffd166';
/** How far a lit building brightens towards white at the top of its pulse. */
const PULSE_DEPTH = 0.35;
const PULSE_PERIOD_MS = 2400;
/** Time constant of the fade when a building lights up, goes dark, or its beacon changes height. */
const FADE_TAU_MS = 280;
const FRAME_MS = 33;
/** Degrees the camera swings round during a flight, and then per orbit leg once it has arrived. */
const FLIGHT_TURN_DEG = 40;
const ORBIT_TURN_DEG = 60;
const ORBIT_MS = 30000;
const CAMPUS_PITCH = 60;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Everything that changes on a building is a feature state, eased frame by frame: changing a paint
 * expression itself makes Mapbox reload the building tiles. `level` is how lit a building is by its
 * events (0 to 1), `hl` how highlighted, `pulse` the breathing, `color` its category colour.
 */
const state = (name: string): mapboxgl.ExpressionSpecification => ['number', ['feature-state', name], 0];
const LEVEL = state('level');
const HL = state('hl');
const PULSE = state('pulse');
const CATEGORY_COLOR: mapboxgl.ExpressionSpecification = ['to-color', ['feature-state', 'color'], CATEGORY_COLORS.other];
const brightened = (color: mapboxgl.ExpressionSpecification | string): mapboxgl.ExpressionSpecification =>
  ['interpolate', ['linear'], PULSE, 0, color, 1, '#ffffff'];
const BUILDING_COLOR: mapboxgl.ExpressionSpecification = [
  'interpolate', ['linear'], HL,
  0, ['interpolate', ['linear'], LEVEL, 0, BASE_COLOR, 1, brightened(CATEGORY_COLOR)],
  1, brightened(HIGHLIGHT_COLOR),
];
/** How visible a building's glow and label are: fully when it is lit either way. */
const LIT: mapboxgl.ExpressionSpecification = ['max', LEVEL, HL];
const GLOW_COLOR: mapboxgl.ExpressionSpecification = ['interpolate', ['linear'], HL, 0, CATEGORY_COLOR, 1, HIGHLIGHT_COLOR];
/** A beacon's current height above its roof, in metres. Below half a metre it is tucked away at ground level. */
const RISE = state('rise');
const BEACON_UP: mapboxgl.ExpressionSpecification = ['>', RISE, 0.5];

interface Target {
  color: string;
  riseM: number;
}
interface Shown {
  level: number;
  hl: number;
  riseM: number;
  color: string | null;
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  /** What each active building should look like at the slider's time. The frame loop eases towards it. */
  const targetsRef = useRef(new Map<string, Target>());
  const highlightedRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [campusId, setCampusId] = useState(HOME.id);
  /** Counts flights, so an older flight's arrival does not start an orbit over a newer one. */
  const flightsRef = useRef(0);
  const buildings = useEventsStore((s) => s.buildings);
  const events = useEventsStore((s) => s.events);
  const selectedTime = useEventsStore((s) => s.selectedTime);

  useEffect(() => {
    if (!TOKEN || !container.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: HOME.center,
      zoom: HOME.zoom - 0.6,
      pitch: CAMPUS_PITCH,
      bearing: HOME.bearing - 15,
      antialias: true,
    });
    mapRef.current = map;

    const controller: MapController = {
      flyTo(buildingId) {
        const b = useEventsStore.getState().buildings.find((x) => x.id === buildingId);
        if (!b) return;
        const flight = ++flightsRef.current;
        map.flyTo({
          center: [b.lng, b.lat], zoom: 17.2, pitch: 62, bearing: map.getBearing() + FLIGHT_TURN_DEG,
          duration: flightMs(map.getCenter().distanceTo(new mapboxgl.LngLat(b.lng, b.lat))),
          curve: 1.3, easing: easeInOut, padding: cameraPadding(window.innerWidth),
        });
        map.once('moveend', () => {
          // Circle the building slowly once there. Skipped when the flight was cut short; any input stops it.
          const arrived = map.getCenter().distanceTo(new mapboxgl.LngLat(b.lng, b.lat)) < 5;
          if (flight !== flightsRef.current || !arrived) return;
          map.easeTo({ bearing: map.getBearing() + ORBIT_TURN_DEG, duration: ORBIT_MS, easing: (t) => t });
        });
      },
      openBuilding(buildingId) {
        setOpenId(buildingId);
      },
      highlight(buildingIds) {
        highlightedRef.current = buildingIds;
      },
      clearHighlight() {
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
          'line-opacity': ['*', LIT, ['+', 0.4, PULSE]],
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
      // A column on the roof of each active building, taller for a bigger expected crowd.
      map.addSource(BEACON_SOURCE, { type: 'geojson', data: beaconsToGeoJSON([]), promoteId: 'id' });
      map.addLayer({
        id: BEACON_LAYER,
        type: 'fill-extrusion',
        source: BEACON_SOURCE,
        paint: {
          'fill-extrusion-base': ['case', BEACON_UP, ['get', 'baseM'], 0],
          'fill-extrusion-height': ['case', BEACON_UP, ['+', ['get', 'baseM'], RISE], 0],
          'fill-extrusion-color': ['case', BEACON_UP, CATEGORY_COLOR, 'rgba(0, 0, 0, 0)'],
          'fill-extrusion-opacity': 0.55,
        },
      });
      // Names float over lit buildings only.
      map.addSource(LABEL_SOURCE, { type: 'geojson', data: labelsToGeoJSON([]), promoteId: 'id' });
      map.addLayer({
        id: LABEL_LAYER,
        type: 'symbol',
        source: LABEL_SOURCE,
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
          'text-opacity': LIT,
        },
      });
      map.setPadding(cameraPadding(window.innerWidth));
      map.easeTo({ zoom: HOME.zoom, bearing: HOME.bearing, duration: OPENING_MS, easing: easeInOut });
      map.on('moveend', () => {
        const { lng, lat } = map.getCenter();
        setCampusId(campusAt(lng, lat).id);
      });
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
    (map.getSource(BEACON_SOURCE) as mapboxgl.GeoJSONSource).setData(beaconsToGeoJSON(buildings));
    (map.getSource(LABEL_SOURCE) as mapboxgl.GeoJSONSource).setData(labelsToGeoJSON(buildings));
    // Hide the basemap's copy of each of our buildings, or the two would overlap and flicker.
    const ours = { type: 'MultiPolygon' as const, coordinates: buildings.map((b) => [b.footprint]) };
    map.setFilter(CONTEXT_LAYER, buildings.length ? ['all', IS_EXTRUDED, ['>', ['distance', ours], 3]] : IS_EXTRUDED);
  }, [ready, buildings]);

  useEffect(() => {
    const categories = buildingCategories(events, selectedTime);
    const attendance = buildingAttendance(events, selectedTime);
    const targets = new Map<string, Target>();
    for (const [id, category] of categories) {
      targets.set(id, { color: CATEGORY_COLORS[category], riseM: beaconHeightM(attendance.get(id) ?? 0) });
    }
    targetsRef.current = targets;
  }, [events, selectedTime]);

  // Eases every building towards its target so nothing switches on or off abruptly, and makes lit ones breathe.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shown = new Map<string, Shown>();
    let frame = 0;
    let last = 0;
    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(ms - last, 100);
      if (dt < FRAME_MS) return;
      last = ms;
      const tau = still ? 0 : FADE_TAU_MS;
      const pulse = still ? 0 : PULSE_DEPTH * (0.5 - 0.5 * Math.cos((ms / PULSE_PERIOD_MS) * 2 * Math.PI));
      for (const { id } of useEventsStore.getState().buildings) {
        const target = targetsRef.current.get(id);
        const was = shown.get(id) ?? { level: 0, hl: 0, riseM: 0, color: null };
        const now: Shown = {
          level: approach(was.level, target ? 1 : 0, dt, tau),
          hl: approach(was.hl, highlightedRef.current.includes(id) ? 1 : 0, dt, tau),
          riseM: approach(was.riseM, target?.riseM ?? 0, dt, tau),
          // A building keeps its last colour while it fades out.
          color: target?.color ?? was.color,
        };
        const lit = now.level > 0 || now.hl > 0;
        const moved = now.level !== was.level || now.hl !== was.hl || now.riseM !== was.riseM || now.color !== was.color;
        if (!moved && !(lit && !still)) continue;
        shown.set(id, now);
        map.setFeatureState({ source: SOURCE, id }, { level: now.level, hl: now.hl, color: now.color, pulse: lit ? pulse : 0 });
        map.setFeatureState({ source: BEACON_SOURCE, id }, { rise: now.riseM, color: now.color });
        map.setFeatureState({ source: LABEL_SOURCE, id }, { level: now.level, hl: now.hl });
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  const openBuilding = buildings.find((b) => b.id === openId);
  const counts = useMemo(() => liveCounts(events, buildings, selectedTime), [events, buildings, selectedTime]);

  function flyToCampus(campus: Campus) {
    const map = mapRef.current;
    if (!map) return;
    flightsRef.current++;
    setCampusId(campus.id);
    map.flyTo({
      center: campus.center, zoom: campus.zoom, pitch: CAMPUS_PITCH, bearing: campus.bearing,
      duration: flightMs(map.getCenter().distanceTo(new mapboxgl.LngLat(...campus.center))),
      curve: 1.3, easing: easeInOut, padding: cameraPadding(window.innerWidth),
    });
  }

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
      <CampusSwitcher current={campusId} counts={counts} onSelect={flyToCampus} />
      <TimeSlider />
    </>
  );
}
