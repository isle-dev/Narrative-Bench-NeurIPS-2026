import assert from 'node:assert/strict';
import { test } from 'node:test';
import { globeView, clusterPins, unproject } from '../src/globe-state.mjs';

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
