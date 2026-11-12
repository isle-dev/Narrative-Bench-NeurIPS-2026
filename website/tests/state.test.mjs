import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRoute, queryChoices, evaluatedLanguages, resolveSelection, rankedRows, sliceRanking } from '../src/state.mjs';

const queries = [
  { id: 'q1', translations: { en: 'first', ar: 'أول' }, cases: { ar: { DP: 'c1' } } },
  { id: 'q2', translations: { en: 'second' }, cases: { en: { BP: 'c2', DP: 'c3' } } },
];

test('only recognized fragment routes and parameters are used', () => {
  assert.deepEqual(parseRoute('#leaderboard?metric=NE&topic=gaza&lang=ar&unused=x'), {
    page: 'leaderboard', metric: 'NE', topic: 'gaza', lang: 'ar',
  });
  assert.deepEqual(parseRoute('#unknown?topic=china'), { page: 'explorer' });
  assert.deepEqual(parseRoute('#explore?topic=china&query=q1&lang=ar&task=DP'), {
    page: 'explorer', topic: 'china', query: 'q1', lang: 'ar', task: 'DP',
  });
});

test('only offers evaluated questions and falls back from an old unevaluated link', () => {
  assert.equal(resolveSelection(queries, { lang: 'en' }).query.id, 'q2');
  assert.equal(resolveSelection(queries, { lang: 'en' }).caseId, 'c3');
  assert.equal(resolveSelection(queries, { lang: 'en', query: 'q1' }).caseId, 'c3');
  assert.deepEqual(queryChoices(queries, 'en').map(query => query.id), ['q2']);
  assert.deepEqual([...evaluatedLanguages([queries[0]])], ['ar']);
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

test('filtered rankings use only the requested slice and keep its denominator', () => {
  const catalog = {
    models: [{ id: 'a', name: 'A', scores: { NI: .7 } }, { id: 'b', name: 'B', scores: { NI: .3 } }],
    counts: { tasks: { NI: 960 } },
  };
  const filters = { gaza: { ar: { scores: { a: { NI: 0 }, b: { NI: 1 } }, counts: { NI: 2 } } } };
  assert.deepEqual(sliceRanking(catalog, filters, 'gaza', 'ar', 'NI').rows.map(row => row.id), ['b', 'a']);
  assert.equal(sliceRanking(catalog, filters, 'gaza', 'ar', 'NI').counts.NI, 2);
  assert.equal(sliceRanking(catalog, filters, 'gaza', 'fr', 'NI'), null);
  assert.equal(sliceRanking(catalog, filters, 'all', 'all', 'NI').rows[0].id, 'a');
});
