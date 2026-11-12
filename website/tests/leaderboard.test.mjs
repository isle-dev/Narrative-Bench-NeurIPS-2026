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

test('the full results matrix preserves all published values and supports sorting', async () => {
  const { readFile } = await import('node:fs/promises');
  const { paperResultsFigure } = await import('../src/leaderboard.mjs');
  const paper = JSON.parse(await readFile(new URL('../paper-results.json', import.meta.url)));
  const original = paperResultsFigure(paper, 'paper', 1240);
  assert.equal(original.traces.length, 11);
  assert.deepEqual(original.layout.yaxis.categoryarray, paper.rows.map(row => row.name));
  assert.deepEqual(original.traces[0].text.slice(0, 2), ['21.0 (1.0)', '26.0 (1.3)']);
  assert.equal(original.traces[0].marker.color[0], '#cb181d');
  const bestInclusion = paperResultsFigure(paper, '0', 1240);
  assert.equal(bestInclusion.layout.yaxis.categoryarray[0], 'Gemini 3.8 Flash (low)');
  const fewestViolations = paperResultsFigure(paper, '10', 1240);
  assert.equal(fewestViolations.traces[10].text[0], '22');
});
