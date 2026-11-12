export function globeView(lon, lat, zoom) {
  return {
    lon: ((lon + 180) % 360 + 360) % 360 - 180,
    lat: Math.max(-85, Math.min(85, lat)),
    zoom: Math.max(1, Math.min(3, zoom)),
  };
}

export function unproject([x, y]) {
  return [x * 360 / 1000 - 180, 84 - y * 144 / 400];
}

export function clusterPins(points, selected, gap) {
  const ordered = [...points].sort((a, b) => Number(b.id === selected) - Number(a.id === selected));
  const groups = [];
  for (const point of ordered) {
    const { x, y } = point;
    const group = groups.find(item => Math.hypot(x - item.x, y - item.y) < gap);
    if (group) group.members.push(point);
    else groups.push({ x, y, members: [point] });
  }
  return groups;
}

export function globeLayers(mode) {
  return { conflicts: mode !== 'queries', queries: mode !== 'conflicts' };
}

function languagesForScope(query, scope) {
  return scope === 'dataset' ? query.available : query.languages;
}

export function mapQueryMatches(query, scope, language) {
  const languages = languagesForScope(query, scope);
  return language ? languages.includes(language) : languages.length > 0;
}

export function queryAnswerLanguage(query, preferred, scope) {
  const languages = languagesForScope(query, scope);
  if (languages.includes(preferred)) return preferred;
  return languages.includes('en') ? 'en' : languages[0];
}

export function queryCount(topics, index, scope, language) {
  return topics.reduce((count, topic) => count + (index[topic.id] ?? [])
    .filter(query => mapQueryMatches(query, scope, language)).length, 0);
}

export function queryMarkerPosition(anchor, width, height, occupied, sharedAnchor = false, preferredPosition) {
  const radius = 40;
  const margin = 23;
  let best;
  let preferred;
  let clearance = -Infinity;
  let preferredClearance = 28;
  const directions = sharedAnchor ? [0, 4, 1, 2, 3, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (const direction of directions) {
    const angle = direction * Math.PI / 4;
    const x = anchor.x + radius * Math.cos(angle);
    const y = anchor.y + radius * Math.sin(angle);
    if (x < margin || x > width - margin || y < margin || y > height - margin) continue;
    const gap = Math.min(...occupied.map(pin => Math.hypot(x - pin.x, y - pin.y)));
    const point = { x, y };
    const matchesPreference = preferredPosition?.(point);
    if (sharedAnchor && (direction === 0 || direction === 4) && gap >= 38 && (!preferredPosition || matchesPreference)) return { x, y: anchor.y };
    if (matchesPreference && gap > preferredClearance) {
      preferred = point;
      preferredClearance = gap;
    }
    if (gap > clearance) {
      best = point;
      clearance = gap;
    }
  }
  return preferred ?? best ?? anchor;
}

export function conflictLinks(regions) {
  return {
    type: 'MultiLineString',
    coordinates: regions.slice(1).map(region => [regions[0].location, region.location]),
  };
}

export function regionCenter(regions) {
  const radians = Math.PI / 180;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const { location: [longitude, latitude] } of regions) {
    const lon = longitude * radians;
    const lat = latitude * radians;
    x += Math.cos(lat) * Math.cos(lon);
    y += Math.cos(lat) * Math.sin(lon);
    z += Math.sin(lat);
  }
  return [Math.atan2(y, x) / radians, Math.atan2(z, Math.hypot(x, y)) / radians];
}
