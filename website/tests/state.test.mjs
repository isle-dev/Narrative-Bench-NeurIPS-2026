import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRoute, queryChoices, resolveSelection, rankedRows, mapView } from '../src/state.mjs';

const queries = [
  { id: 'q1', translations: { en: 'first', ar: 'أول' }, cases: { ar: { DP: 'c1' } } },
  { id: 'q2', translations: { en: 'second' }, cases: { en: { BP: 'c2', DP: 'c3' } } },
];

test('only recognized fragment routes and parameters are used', () => {
  assert.deepEqual(parseRoute('#leaderboard?metric=NE&unused=x'), { page: 'leaderboard', metric: 'NE' });
  assert.deepEqual(parseRoute('#unknown?topic=china'), { page: 'explorer' });
  assert.deepEqual(parseRoute('#explore?topic=china&query=q1&lang=ar&task=DP'), {
    page: 'explorer', topic: 'china', query: 'q1', lang: 'ar', task: 'DP',
  });
});

test('chooses an evaluated question by default and preserves an explicit unevaluated translation', () => {
  assert.equal(resolveSelection(queries, { lang: 'en' }).query.id, 'q2');
  assert.equal(resolveSelection(queries, { lang: 'en' }).caseId, 'c3');
  assert.equal(resolveSelection(queries, { lang: 'en', query: 'q1' }).caseId, null);
  assert.equal(resolveSelection(queries, { lang: 'ar', query: 'q2' }).caseId, 'c1');
  assert.equal(resolveSelection(queries, { lang: 'invalid', task: 'invalid' }).lang, 'en');
  assert.deepEqual(queryChoices(queries, 'ar').map(query => query.id), ['q1']);
});

test('leaderboard ranks by chosen metric with tied display values and stable names', () => {
  const models = [
    { name: 'C', scores: { NI: 0.712, DP: 0.92 } },
    { name: 'B', scores: { NI: 0.71201, DP: 0.89 } },
    { name: 'A', scores: { NI: 0.700, DP: 0.91 } },
  ];
  assert.deepEqual(rankedRows(models, 'NI').map(row => [row.rank, row.name]), [[1, 'B'], [1, 'C'], [3, 'A']]);
  assert.deepEqual(rankedRows(models, 'DP').map(row => row.name), ['C', 'A', 'B']);
});

test('map pan clamps to geographic bounds at the selected zoom', () => {
  assert.deepEqual(mapView(2, -10, 600), { zoom: 2, x: 250, y: 300, width: 500, height: 200 });
  assert.deepEqual(mapView(1, 1, 1), { zoom: 1, x: 500, y: 200, width: 1000, height: 400 });
});
