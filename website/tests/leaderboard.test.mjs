import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leaderboardFigure } from '../src/leaderboard.mjs';
import { rankedRows } from '../src/state.mjs';

const models = [
  { id: 'a', name: 'Model A', scores: { NI: .9, NE: .40801 } },
  { id: 'b', name: 'Model B', scores: { NI: .6, NE: .92 } },
];

test('the Plotly chart follows the same ranking, rounding, and denominators as the table', () => {
  const rows = rankedRows(models, 'NE');
  const { traces, layout } = leaderboardFigure(rows, 'NE F1', 960, 800);
  assert.deepEqual(traces[1].y, ['Model B', 'Model A']);
  assert.deepEqual(traces[1].x, [.92, .408]);
  assert.deepEqual(traces[1].customdata, [[1, 960], [2, 960]]);
  assert.deepEqual(layout.xaxis.range, [0, 1]);
});

test('the plot allocates a smaller label area on mobile', () => {
  const rows = rankedRows(models, 'NI');
  const compact = leaderboardFigure(rows, 'NI F1', 960, 340).layout;
  const desktop = leaderboardFigure(rows, 'NI F1', 960, 800).layout;
  assert.equal(compact.width, 340);
  assert.ok(compact.margin.l < desktop.margin.l);
});
