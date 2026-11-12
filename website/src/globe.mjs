import './vendor/d3-array.js';
import './vendor/d3-geo.js';
import { clusterPins, globeView, queryPinPositions, unproject } from './globe-state.mjs';

const DEFAULT_VIEW = globeView(23, 20, 1);
const SPHERE = { type: 'Sphere' };
const LIMB = Math.PI * .475;

export function mountGlobe(countries, topics, selectTopic, selectQuery) {
  const map = document.querySelector('#map');
  const canvas = document.querySelector('#world');
  const markers = document.querySelector('#markers');
  const menu = document.querySelector('#cluster');
  const plus = document.querySelector('#zoom-in');
  const minus = document.querySelector('#zoom-out');
  const reset = document.querySelector('#globe-reset');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Map canvas is unavailable');

  const { geoDistance, geoGraticule, geoOrthographic, geoPath } = globalThis.d3;
  const projection = geoOrthographic().precision(.55);
  const path = geoPath(projection, context);
  const grid = geoGraticule().step([20, 20])();
  const land = {
    type: 'GeometryCollection',
    geometries: countries.map(country => ({
      type: 'MultiPolygon',
      coordinates: country.map(polygon => polygon.map(ring => ring.map(unproject))),
    })),
  };
  const placedTopics = topics.filter(topic => topic.point)
    .map(topic => ({ ...topic, location: unproject(topic.point) }));
  let view = DEFAULT_VIEW;
  let selection;
  let drag;
  let frame;
  let expanded;

  function closeMenu(restoreFocus = false) {
    menu.hidden = true;
    expanded?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) expanded?.focus();
    expanded = null;
  }

  function openMenu(button, members) {
    const wasExpanded = expanded === button;
    closeMenu(wasExpanded);
    if (wasExpanded) return;
    expanded = button;
    button.setAttribute('aria-expanded', 'true');
    const choices = members.map(topic => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = topic.label;
      item.setAttribute('aria-pressed', String(topic.id === selection?.topic));
      item.addEventListener('click', () => {
        closeMenu(true);
        selectTopic(topic.id);
      });
      return item;
    });
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close topic list';
    close.addEventListener('click', () => closeMenu(true));
    menu.replaceChildren(...choices, close);
    menu.hidden = false;
    choices[0].focus();
  }

  function place(topic, width, height) {
    if (geoDistance([view.lon, view.lat], topic.location) > LIMB) return null;
    const [x, y] = projection(topic.location);
    if (x < 17 || x > width - 17 || y < 17 || y > height - 17) return null;
    return { ...topic, x, y };
  }

  function drawMarkers(width, height) {
    const focusedId = document.activeElement?.dataset.pin;
    closeMenu();
    const points = placedTopics.map(topic => place(topic, width, height)).filter(Boolean);
    const anchor = points.find(topic => topic.id === selection?.topic);
    const groups = clusterPins(points, selection?.topic, 36);
    const queries = selection?.queries ?? [];
    const queryPositions = queryPinPositions(anchor, queries.length, width, height, groups);
    const buttons = groups.map(({ x, y, members }) => {
      const button = document.createElement('button');
      const ids = members.map(topic => topic.id).sort().join(' ');
      const active = members.find(topic => topic.id === selection?.topic);
      button.type = 'button';
      button.className = 'map-marker';
      button.dataset.pin = ids;
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
      const fanOnRight = queryPositions.some(pin => pin.x > x + 10);
      button.classList.toggle('label-left', active && queryPositions.length ? fanOnRight : x > width * .62);
      button.classList.toggle('selected', Boolean(active));
      const dot = document.createElement('span');
      dot.className = 'marker-dot';
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot);
      if (members.length === 1) {
        button.setAttribute('aria-label', members[0].label);
        button.setAttribute('aria-pressed', String(Boolean(active)));
        button.title = members[0].label;
        button.addEventListener('click', () => selectTopic(members[0].id));
      } else {
        button.setAttribute('aria-label', `${members.length} nearby topics: ${members.map(topic => topic.label).join(' · ')}`);
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'cluster');
        const count = document.createElement('span');
        count.textContent = String(members.length);
        button.append(count);
        button.addEventListener('click', () => openMenu(button, members));
      }
      if (active) {
        const label = document.createElement('span');
        label.className = 'pin-label';
        label.setAttribute('aria-hidden', 'true');
        label.textContent = active.pinLabel ?? active.label;
        button.append(label);
      }
      return button;
    });
    if (queryPositions.length) {
      context.beginPath();
      queryPositions.forEach(({ x, y }, index) => {
        context.moveTo(anchor.x, anchor.y);
        context.lineTo(x, y);
        const query = queries[index];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'query-pin';
        button.dataset.pin = `query:${query.id}`;
        button.style.left = `${x}px`;
        button.style.top = `${y}px`;
        button.title = query.text;
        button.setAttribute('aria-label', `Query: ${query.text}`);
        button.setAttribute('aria-pressed', String(query.id === selection.queryId));
        button.addEventListener('click', () => selectQuery(query.id));
        buttons.push(button);
      });
      context.lineWidth = 3;
      context.strokeStyle = '#132341';
      context.stroke();
      context.setLineDash([4, 3]);
      context.lineWidth = 1.6;
      context.strokeStyle = '#b9f4ff';
      context.stroke();
      context.setLineDash([]);
    }
    markers.replaceChildren(...buttons);
    if (focusedId) (buttons.find(button => button.dataset.pin === focusedId) ?? map).focus({ preventScroll: true });
  }

  function draw() {
    frame = undefined;
    const width = map.clientWidth;
    const height = map.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const radius = Math.min(width, height) * .46 * view.zoom;
    const cx = width / 2;
    const cy = height / 2;
    projection.scale(radius).translate([cx, cy]).rotate([-view.lon, -view.lat]);

    const ocean = context.createRadialGradient(cx - radius * .28, cy - radius * .44, radius * .03, cx, cy, radius);
    ocean.addColorStop(0, '#456ac5');
    ocean.addColorStop(.66, '#253e95');
    ocean.addColorStop(1, '#182858');
    context.beginPath();
    path(SPHERE);
    context.fillStyle = ocean;
    context.shadowColor = '#6796f0';
    context.shadowBlur = 14;
    context.fill();
    context.shadowBlur = 0;

    const ground = context.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    ground.addColorStop(0, '#a2c1b6');
    ground.addColorStop(1, '#739c96');
    context.beginPath();
    path(land);
    context.fillStyle = ground;
    context.fill();
    context.strokeStyle = '#d7e6d3a8';
    context.lineWidth = .55;
    context.stroke();

    context.beginPath();
    path(grid);
    context.strokeStyle = '#b8d4ff3d';
    context.lineWidth = .65;
    context.stroke();
    context.beginPath();
    path(SPHERE);
    context.strokeStyle = '#97baff';
    context.lineWidth = 1.25;
    context.stroke();
    drawMarkers(width, height);
  }

  function scheduleDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function setView(lon, lat, zoom) {
    view = globeView(lon, lat, zoom);
    plus.disabled = view.zoom >= 3;
    minus.disabled = view.zoom <= 1;
    scheduleDraw();
  }

  plus.addEventListener('click', () => setView(view.lon, view.lat, view.zoom * 1.4));
  minus.addEventListener('click', () => setView(view.lon, view.lat, view.zoom / 1.4));
  reset.addEventListener('click', () => setView(DEFAULT_VIEW.lon, DEFAULT_VIEW.lat, DEFAULT_VIEW.zoom));

  map.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button, a, .cluster-menu')) return;
    closeMenu();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, view };
    map.setPointerCapture(event.pointerId);
    map.classList.add('dragging');
  });
  map.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    const degrees = 180 / (Math.min(map.clientWidth, map.clientHeight) * drag.view.zoom);
    setView(drag.view.lon - (event.clientX - drag.x) * degrees,
      drag.view.lat + (event.clientY - drag.y) * degrees, drag.view.zoom);
  });
  map.addEventListener('lostpointercapture', () => {
    drag = null;
    map.classList.remove('dragging');
  });
  map.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded) closeMenu(true);
    if (event.target !== map) return;
    const offset = { ArrowLeft: [-15, 0], ArrowRight: [15, 0], ArrowUp: [0, 15], ArrowDown: [0, -15] }[event.key];
    if (!offset) return;
    event.preventDefault();
    setView(view.lon + offset[0], view.lat + offset[1], view.zoom);
  });
  new ResizeObserver(scheduleDraw).observe(map);
  reset.disabled = false;
  setView(DEFAULT_VIEW.lon, DEFAULT_VIEW.lat, DEFAULT_VIEW.zoom);
  return {
    setSelection(next, refocus = false) {
      if (!next) return;
      const center = refocus || selection?.topic !== next.topic;
      selection = next;
      if (center) {
        const topic = placedTopics.find(item => item.id === selection.topic);
        if (topic) setView(...topic.location, view.zoom);
        else setView(DEFAULT_VIEW.lon, DEFAULT_VIEW.lat, DEFAULT_VIEW.zoom);
      } else {
        scheduleDraw();
      }
    },
  };
}
