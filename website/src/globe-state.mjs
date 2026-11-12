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

export function queryPinPositions(anchor, count, width, height, topicPins) {
  if (!anchor || !count) return [];
  const radius = 53;
  const margin = 18;
  let best = [];
  let clearance = -Infinity;
  for (let direction = 0; direction < 8; direction++) {
    const fan = Array.from({ length: count }, (_, index) => {
      const angle = direction * Math.PI / 4 + (index - (count - 1) / 2) * .83;
      return { x: anchor.x + radius * Math.cos(angle), y: anchor.y + radius * Math.sin(angle) };
    });
    if (fan.some(({ x, y }) => x < margin || x > width - margin || y < margin || y > height - margin)) continue;
    const gap = Math.min(...fan.flatMap(pin => topicPins.map(topic => Math.hypot(pin.x - topic.x, pin.y - topic.y))));
    if (gap > clearance) {
      best = fan;
      clearance = gap;
    }
  }
  return best;
}
