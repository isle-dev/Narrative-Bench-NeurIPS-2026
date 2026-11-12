import assert from 'node:assert/strict';
import { test } from 'node:test';
import { globeView, clusterPins, queryPinPositions, unproject } from '../src/globe-state.mjs';

test('globe views wrap longitude and clamp latitude and zoom', () => {
  assert.deepEqual(globeView(190, -100, 5), { lon: -170, lat: -85, zoom: 3 });
  assert.deepEqual(globeView(-181, 100, 0.5), { lon: 179, lat: 85, zoom: 1 });
});

test('clustering keeps topic identities and does not shift the selected pin', () => {
  const first = { id: 'a', x: 30, y: 30 };
  const selected = { id: 'b', x: 40, y: 30 };
  const distant = { id: 'c', x: 90, y: 80 };
  const groups = clusterPins([first, selected, distant], selected.id, 28);
  assert.deepEqual(groups, [
    { x: 40, y: 30, members: [selected, first] },
    { x: 90, y: 80, members: [distant] },
  ]);
  assert.equal(clusterPins([first, distant], undefined, 28).length, 2);
});

test('published map coordinates decode to the original geographic extent', () => {
  assert.deepEqual(unproject([0, 0]), [-180, 84]);
  assert.deepEqual(unproject([1000, 400]), [180, -60]);
  assert.deepEqual(unproject([500, 200]), [0, 12]);
});

test('query pins fan out from a topic without covering nearby topic markers', () => {
  const anchor = { x: 150, y: 120 };
  const other = { x: 216, y: 120 };
  const pins = queryPinPositions(anchor, 3, 300, 240, [anchor, other]);
  assert.equal(pins.length, 3);
  for (const pin of pins) {
    assert.ok(pin.x >= 17 && pin.x <= 283 && pin.y >= 17 && pin.y <= 223);
    assert.ok(Math.hypot(pin.x - anchor.x, pin.y - anchor.y) > 36);
    assert.ok(Math.hypot(pin.x - other.x, pin.y - other.y) > 36);
  }
  assert.deepEqual(queryPinPositions(null, 3, 300, 240, []), []);
});
