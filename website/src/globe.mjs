import './vendor/d3-array.js';
import './vendor/d3-geo.js';
import {
  clusterPins, conflictLinks, globeLayers, globeView, mapQueryMatches, queryAnswerLanguage, queryCount, queryMarkerPosition, regionCenter, unproject,
} from './globe-state.mjs';

const DEFAULT_VIEW = globeView(23, 20, 1);
const SPHERE = { type: 'Sphere' };
const LIMB = Math.PI * .475;

export function mountGlobe(countries, { topics, languages, queryIndex }, { selectTopic, selectQuery }) {
  const map = document.querySelector('#map');
  const canvas = document.querySelector('#world');
  const markers = document.querySelector('#markers');
  const menu = document.querySelector('#cluster');
  const mapNote = document.querySelector('#map-note');
  const crossRegion = document.querySelector('#cross-region-queries');
  const linkedRegions = document.querySelector('#linked-regions');
  const plus = document.querySelector('#zoom-in');
  const minus = document.querySelector('#zoom-out');
  const reset = document.querySelector('#globe-reset');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Map canvas is unavailable');

  const { geoDistance, geoGraticule, geoOrthographic, geoPath } = globalThis.d3;
  const projection = geoOrthographic().precision(.55);
  const path = geoPath(projection, context).pointRadius(3.25);
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
  const crossRegionalTopics = topics.filter(topic => !topic.point);
  let view = DEFAULT_VIEW;
  let selection = { mode: 'both', scope: 'benchmark' };
  let drag;
  let frame;
  let expanded;
  let regions = [];

  function closeMenu(restoreFocus = false) {
    menu.hidden = true;
    expanded?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) expanded?.focus();
    expanded = null;
  }

  function matchingQueries(topic) {
    return (queryIndex[topic.id] ?? []).filter(query => mapQueryMatches(query, selection.scope, selection.mapLang));
  }

  function openMenu(button, title, content) {
    const wasExpanded = expanded === button;
    closeMenu(wasExpanded);
    if (wasExpanded) return;
    expanded = button;
    button.setAttribute('aria-expanded', 'true');
    const heading = document.createElement('div');
    heading.className = 'cluster-heading';
    const label = document.createElement('h3');
    label.id = 'cluster-title';
    label.textContent = title;
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', () => closeMenu(true));
    heading.append(label, close);
    menu.replaceChildren(heading, ...content);
    menu.scrollTop = 0;
    menu.hidden = false;
    close.focus({ preventScroll: true });
    if (button === crossRegion) menu.scrollIntoView({ block: 'nearest' });
  }

  function openTopicMenu(button, members) {
    const choices = members.map(topic => {
      const item = document.createElement('button');
      item.type = 'button';
      item.textContent = topic.label;
      item.setAttribute('aria-pressed', String(topic.id === selection.topic));
      item.addEventListener('click', () => {
        closeMenu(true);
        selectTopic(topic.id);
      });
      return item;
    });
    openMenu(button, 'Nearby topics', choices);
  }

  function openQueryMenu(button, members, title) {
    const sections = members.flatMap(topic => {
      const queries = matchingQueries(topic);
      if (!queries.length) return [];
      const section = document.createElement('section');
      section.className = 'cluster-queries';
      const heading = document.createElement('h4');
      heading.textContent = topic.label;
      section.append(heading);
      for (const query of queries) {
        const lang = queryAnswerLanguage(query, selection.mapLang || selection.lang, selection.scope);
        const item = document.createElement('button');
        item.type = 'button';
        item.dataset.queryId = query.id;
        item.setAttribute('aria-pressed', String(query.id === selection.queryId));
        const text = document.createElement('span');
        text.textContent = query.text;
        text.lang = query.textLang;
        text.dir = 'auto';
        const note = document.createElement('small');
        note.textContent = `${languages[lang]} · ${query.languages.includes(lang) ? 'Recorded answers' : 'Dataset only'}`;
        item.append(text, note);
        item.addEventListener('click', () => {
          closeMenu(true);
          selectQuery(topic.id, query.id, lang);
        });
        section.append(item);
      }
      return [section];
    });
    openMenu(button, title, sections);
  }

  crossRegion.addEventListener('click', () => openQueryMenu(crossRegion, crossRegionalTopics, 'Cross-regional queries'));

  function updateControls() {
    const layers = globeLayers(selection.mode);
    document.querySelector('#legend-topics').hidden = !layers.conflicts;
    document.querySelector('#legend-queries').hidden = !layers.queries;
    const topic = placedTopics.find(item => item.id === selection.topic);
    regions = layers.conflicts ? topic?.regions ?? [] : [];
    linkedRegions.hidden = regions.length === 0;
    linkedRegions.textContent = regions.length ? `Linked regions · ${regions.map(region => region.label).join(' · ')}` : '';
    const crossCount = queryCount(crossRegionalTopics, queryIndex, selection.scope, selection.mapLang);
    crossRegion.hidden = !layers.queries || crossCount === 0;
    crossRegion.textContent = `${crossCount} cross-regional ${crossCount === 1 ? 'query' : 'queries'}`;
    if (!layers.queries) {
      mapNote.textContent = 'Drag to rotate the globe.';
      return;
    }
    const count = queryCount(topics, queryIndex, selection.scope, selection.mapLang);
    const noun = count === 1 ? 'question' : 'questions';
    if (selection.mapLang) {
      mapNote.textContent = `${count} ${selection.scope === 'benchmark' ? 'evaluated ' : ''}${noun} in ${languages[selection.mapLang]}. Diamonds group queries by topic.`;
    } else {
      const field = selection.scope === 'dataset' ? 'available' : 'languages';
      const versions = Object.values(queryIndex).flat().reduce((sum, query) => sum + query[field].length, 0);
      mapNote.textContent = `${count} ${noun} · ${versions.toLocaleString('en')} ${selection.scope === 'benchmark' ? 'evaluated ' : ''}language versions.`;
    }
  }

  function place(topic, width, height) {
    if (geoDistance([view.lon, view.lat], topic.location) > LIMB) return null;
    const [x, y] = projection(topic.location);
    if (x < 17 || x > width - 17 || y < 17 || y > height - 17) return null;
    return { ...topic, x, y };
  }

  function pinButton(className, id, x, y) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.pin = id;
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    return button;
  }

  function drawMarkers(width, height) {
    const focusedId = document.activeElement?.dataset.pin;
    closeMenu();
    const layers = globeLayers(selection.mode);
    const points = placedTopics.filter(topic => layers.conflicts || matchingQueries(topic).length)
      .map(topic => place(topic, width, height)).filter(Boolean);
    const groups = clusterPins(points, selection.topic, layers.conflicts && layers.queries ? 53 : 39);
    const occupied = [...groups];
    const buttons = [];
    context.beginPath();
    for (const group of groups) {
      const { x, y, members } = group;
      const ids = members.map(topic => topic.id).sort().join(' ');
      const active = members.find(topic => topic.id === selection.topic);
      let queryPin;
      const count = layers.queries ? queryCount(members, queryIndex, selection.scope, selection.mapLang) : 0;
      if (count) {
        const sharedAnchor = members.length > 1 && members.every(topic => topic.x === x && topic.y === y);
        queryPin = layers.conflicts ? queryMarkerPosition(group, width, height, occupied, sharedAnchor) : group;
        occupied.push(queryPin);
        context.moveTo(x, y);
        context.lineTo(queryPin.x, queryPin.y);
        const button = pinButton('query-pin', `queries:${ids}`, queryPin.x, queryPin.y);
        const label = `${count} ${count === 1 ? 'query' : 'queries'} · ${members.length === 1 ? members[0].label : `${members.length} nearby topics`}`;
        button.setAttribute('aria-label', label);
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'cluster');
        button.title = label;
        button.classList.toggle('selected', Boolean(active));
        button.textContent = count;
        button.addEventListener('click', () => openQueryMenu(button, members, label));
        buttons.push(button);
      }
      if (!layers.conflicts) continue;

      const button = pinButton('map-marker', `topics:${ids}`, x, y);
      button.classList.toggle('label-left', queryPin ? queryPin.x >= x : x > width * .62);
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
        const countLabel = document.createElement('span');
        countLabel.textContent = members.length;
        button.append(countLabel);
        button.addEventListener('click', () => openTopicMenu(button, members));
      }
      if (active && !layers.queries) {
        const label = document.createElement('span');
        label.className = 'pin-label';
        label.setAttribute('aria-hidden', 'true');
        label.textContent = active.pinLabel ?? active.label;
        button.append(label);
      }
      buttons.push(button);
    }
    if (layers.conflicts && layers.queries) {
      context.lineWidth = 2.5;
      context.strokeStyle = '#132341';
      context.stroke();
      context.setLineDash([4, 3]);
      context.lineWidth = 1.35;
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
    ocean.addColorStop(0, '#3d73ac');
    ocean.addColorStop(.66, '#16447a');
    ocean.addColorStop(1, '#092951');
    context.beginPath();
    path(SPHERE);
    context.fillStyle = ocean;
    context.shadowColor = '#6796f0';
    context.shadowBlur = 14;
    context.fill();
    context.shadowBlur = 0;

    const ground = context.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    ground.addColorStop(0, '#b4d2d8');
    ground.addColorStop(1, '#779dae');
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
    if (regions.length) {
      context.save();
      context.beginPath();
      path(conflictLinks(regions));
      context.strokeStyle = '#082b58';
      context.lineWidth = 4;
      context.setLineDash([1, 7]);
      context.lineCap = 'round';
      context.stroke();
      context.strokeStyle = '#e9f48a';
      context.lineWidth = 2;
      context.stroke();
      context.beginPath();
      path({ type: 'MultiPoint', coordinates: regions.map(region => region.location) });
      context.fillStyle = '#e9f48a';
      context.fill();
      context.setLineDash([]);
      context.lineWidth = 1.4;
      context.strokeStyle = '#082b58';
      context.stroke();
      context.restore();
    }
    drawMarkers(width, height);
  }

  function scheduleDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function setView(lon, lat, zoom) {
    view = globeView(lon, lat, zoom);
    map.classList.toggle('map-zoomed', view.zoom > 1);
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
      const hadRegions = regions.length > 0;
      selection = next;
      updateControls();
      if (center || (regions.length > 0 && !hadRegions)) {
        const topic = placedTopics.find(item => item.id === selection.topic);
        const span = Math.max(0, ...regions.map(region => geoDistance(topic.location, region.location)));
        if (span > LIMB) setView(...regionCenter(regions), 1);
        else if (topic) setView(...topic.location, span ? Math.min(view.zoom, .9 / Math.sin(span)) : view.zoom);
        else setView(DEFAULT_VIEW.lon, DEFAULT_VIEW.lat, DEFAULT_VIEW.zoom);
      } else {
        scheduleDraw();
      }
    },
  };
}
