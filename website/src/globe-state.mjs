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
