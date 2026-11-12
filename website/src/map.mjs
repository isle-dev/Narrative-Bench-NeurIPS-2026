import { mapView } from './state.mjs';

export function mountMap(countries, topics, selectTopic) {
  const map = document.querySelector('#map');
  const canvas = document.querySelector('#world');
  const markers = document.querySelector('#markers');
  const menu = document.querySelector('#cluster');
  const plus = document.querySelector('#zoom-in');
  const minus = document.querySelector('#zoom-out');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Map canvas is unavailable');
  const placedTopics = topics.filter(topic => topic.point);
  const land = countries.map(country => {
    const path = new Path2D();
    for (const polygon of country) {
      for (const ring of polygon) {
        path.moveTo(...ring[0]);
        for (const point of ring.slice(1)) path.lineTo(...point);
        path.closePath();
      }
    }
    return path;
  });
  let view = mapView(1, 500, 200);
  let selected;
  let rendered = [];
  let expanded;
  let drag;
  let frame;

  function closeMenu(restoreFocus = false) {
    menu.hidden = true;
    expanded?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) expanded?.focus();
    expanded = null;
  }

  function syncSelection() {
    for (const { button, members } of rendered) {
      const active = members.some(topic => topic.id === selected);
      if (members.length === 1) button.setAttribute('aria-pressed', String(active));
      else button.classList.toggle('contains-selected', active);
    }
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

  function drawMarkers(left, top, width, height) {
    closeMenu();
    const clusters = [];
    for (const topic of placedTopics) {
      const x = (topic.point[0] - left) / view.width * width;
      const y = (topic.point[1] - top) / view.height * height;
      if (x < 14 || x > width - 14 || y < 14 || y > height - 14) continue;
      const cluster = clusters.find(group => Math.hypot(group.x - x, group.y - y) < 30);
      if (cluster) cluster.members.push(topic);
      else clusters.push({ x, y, members: [topic] });
    }
    rendered = clusters.map(({ x, y, members }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-marker';
      button.style.left = `${x}px`;
      button.style.top = `${y}px`;
      if (members.length === 1) {
        button.title = members[0].label;
        button.setAttribute('aria-label', members[0].label);
        button.addEventListener('click', () => {
          closeMenu();
          selectTopic(members[0].id);
        });
      } else {
        button.classList.add('group');
        button.title = members.map(topic => topic.label).join(' · ');
        button.setAttribute('aria-label', `${members.length} nearby topics: ${button.title}`);
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'cluster');
        const count = document.createElement('span');
        count.className = 'marker-count';
        count.textContent = String(members.length);
        button.append(count);
        button.addEventListener('click', () => openMenu(button, members));
      }
      return { button, members };
    });
    markers.replaceChildren(...rendered.map(item => item.button));
    syncSelection();
  }

  function draw() {
    frame = undefined;
    const width = map.clientWidth;
    const height = map.clientHeight;
    if (!width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const left = view.x - view.width / 2;
    const top = view.y - view.height / 2;
    const scale = canvas.width / view.width;
    const verticalScale = canvas.height / view.height;
    context.setTransform(scale, 0, 0, verticalScale, -left * scale, -top * verticalScale);
    context.strokeStyle = '#afc6b9';
    context.lineWidth = .7 * ratio / scale;
    context.beginPath();
    for (let x = 0; x < 1000; x += 1000 / 12) {
      context.moveTo(x, 0);
      context.lineTo(x, 400);
    }
    for (let lat = -60; lat <= 84; lat += 30) {
      const y = (84 - lat) / 144 * 400;
      context.moveTo(0, y);
      context.lineTo(1000, y);
    }
    context.stroke();
    context.fillStyle = '#f6f7ee';
    context.strokeStyle = '#7d9c8b';
    context.lineWidth = .63 * ratio / scale;
    for (const path of land) {
      context.fill(path, 'evenodd');
      context.stroke(path);
    }
    drawMarkers(left, top, width, height);
  }

  function scheduleDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function setView(zoom, x, y) {
    view = mapView(zoom, x, y);
    plus.disabled = view.zoom >= 8;
    minus.disabled = view.zoom <= 1;
    map.classList.toggle('is-zoomed', view.zoom > 1);
    scheduleDraw();
  }

  function changeZoom(factor) {
    const point = placedTopics.find(topic => topic.id === selected)?.point;
    const [x, y] = view.zoom === 1 && point ? point : [view.x, view.y];
    setView(view.zoom * factor, x, y);
  }

  plus.addEventListener('click', () => changeZoom(2));
  minus.addEventListener('click', () => changeZoom(.5));
  map.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button, a, .cluster-menu')) return;
    closeMenu();
    if (view.zoom === 1) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, view };
    map.setPointerCapture(event.pointerId);
    map.classList.add('dragging');
  });
  map.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    setView(view.zoom, drag.view.x - (event.clientX - drag.x) * view.width / map.clientWidth,
      drag.view.y - (event.clientY - drag.y) * view.height / map.clientHeight);
  });
  map.addEventListener('lostpointercapture', () => {
    drag = null;
    map.classList.remove('dragging');
  });
  map.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded) closeMenu(true);
  });
  new ResizeObserver(scheduleDraw).observe(map);
  setView(1, 500, 200);

  return {
    select(topicId) {
      if (selected === topicId) return;
      selected = topicId;
      const point = placedTopics.find(topic => topic.id === selected)?.point;
      const visible = rendered.some(group => group.members.some(topic => topic.id === selected));
      if (view.zoom > 1 && point && !visible) setView(view.zoom, ...point);
      else syncSelection();
    },
  };
}
