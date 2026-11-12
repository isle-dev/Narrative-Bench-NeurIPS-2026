import assert from 'node:assert/strict';
import { test } from 'node:test';
import { globeView, clusterPins, queryMarkerPosition, globeLayers, queryAnswerLanguage, queryCount, mapQueryMatches, unproject } from '../src/globe-state.mjs';

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

test('globe layers independently control conflict and query markers', () => {
  assert.deepEqual(globeLayers('conflicts'), { conflicts: true, queries: false });
  assert.deepEqual(globeLayers('queries'), { conflicts: false, queries: true });
  assert.deepEqual(globeLayers('both'), { conflicts: true, queries: true });
  assert.deepEqual(globeLayers('invalid'), globeLayers('both'));
});

test('a query badge avoids the anchor and an adjacent conflict pin', () => {
  const anchor = { x: 150, y: 120 };
  const other = { x: 190, y: 120 };
  const pin = queryMarkerPosition(anchor, 300, 240, [anchor, other]);
  assert.ok(pin.x >= 23 && pin.x <= 277 && pin.y >= 23 && pin.y <= 217);
  assert.ok(Math.hypot(pin.x - anchor.x, pin.y - anchor.y) >= 37);
  assert.ok(Math.hypot(pin.x - other.x, pin.y - other.y) >= 37);
});

test('query clusters count distinct questions regardless of selected answer language', () => {
  const q1 = { id: 'q1', languages: ['ar', 'fr'], available: ['ar', 'en', 'fr'] };
  const q2 = { id: 'q2', languages: ['ar', 'en'], available: ['ar', 'en'] };
  assert.equal(queryCount([{ id: 'one' }, { id: 'two' }], { one: [q1], two: [q2] }), 2);
  assert.equal(queryAnswerLanguage(q1, 'fr'), 'fr');
  assert.equal(queryAnswerLanguage(q1, 'en'), 'ar');
  assert.equal(queryAnswerLanguage(q2, 'fr'), 'en');
  assert.equal(queryAnswerLanguage(q1, 'en', 'dataset'), 'en');
  assert.equal(mapQueryMatches(q1, 'benchmark', 'en'), false);
  assert.equal(mapQueryMatches(q1, 'dataset', 'en'), true);
  assert.equal(queryCount([{ id: 'one' }, { id: 'two' }], { one: [q1], two: [q2] }, 'benchmark', 'en'), 1);
});

test('selected conflict links join the named regions across the antimeridian', async () => {
  const { conflictLinks, regionCenter } = await import('../src/globe-state.mjs');
  const regions = [{ location: [170, 30] }, { location: [-170, 30] }, { location: [179, 40] }];
  assert.equal(conflictLinks(regions).coordinates.length, 2);
  assert.deepEqual(conflictLinks(regions).coordinates[0], [[170, 30], [-170, 30]]);
  assert.ok(Math.abs(regionCenter(regions)[0]) > 170);
  assert.deepEqual(conflictLinks([]).coordinates, []);
});

test('query groups with a shared geographic anchor stay level with the topic marker', () => {
  const anchor = { x: 175, y: 150 };
  const query = queryMarkerPosition(anchor, 350, 300, [anchor], true);
  assert.equal(query.y, anchor.y);
  assert.ok(Math.abs(query.x - anchor.x) >= 35);
});
