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

test('filtered scores keep the paper matrix shape and distinguish unavailable values from zero', async () => {
  const { readFile } = await import('node:fs/promises');
  const { filteredResults, paperResultsFigure } = await import('../src/leaderboard.mjs');
  const paper = JSON.parse(await readFile(new URL('../paper-results.json', import.meta.url)));
  const id = paper.rows[0].id;
  const slice = {
    scores: { [id]: { NI: .125, NE: 0 } },
    diagnostics: { [id]: { confirmatory_absolute_gap_pp: 5.125, language_violations: 0 } },
  };
  const filtered = filteredResults(paper, slice);
  assert.deepEqual(filtered.rows.map(row => row.name), paper.rows.map(row => row.name));
  assert.equal(filtered.columns.length, 11);
  assert.deepEqual(filtered.rows[0].cells.map(cell => cell.display),
    ['12.5', '0.0', '—', '—', '—', '5.13', '—', '—', '—', '—', '0']);
  const figure = paperResultsFigure(filtered, '6', 1240);
  assert.equal(figure.traces[6].text[0], '—');
  assert.match(figure.traces[6].hovertemplate[0], /unavailable/i);
  assert.equal(filteredResults(paper).rows[0].cells[0].display, '—');
});

test('the empty ranking keeps its model axis and frame without drawing zero scores', () => {
  const rows = models.map(model => ({ ...model, value: null, rank: null }));
  const { traces, layout } = leaderboardFigure(rows, 'NI F1', 0, 800);
  assert.deepEqual(layout.yaxis.categoryarray, ['Model A', 'Model B']);
  assert.deepEqual(traces[1].x, [null, null]);
  assert.equal(layout.height, leaderboardFigure(rankedRows(models, 'NI'), 'NI F1', 4, 800).layout.height);
});

test('source-language omission rates use available source-language opportunities', async () => {
  const { sourceOmissionFigure, sourceOmissionRows } = await import('../src/leaderboard.mjs');
  const rows = sourceOmissionRows({
    BP: { English: [1, 4], Arabic: [3, 4] },
    DP: { English: [1, 2], Arabic: [2, 3], Persian: [0, 2] },
  });
  assert.deepEqual(rows.map(row => row.language), ['Arabic', 'English', 'Persian']);
  const { traces } = sourceOmissionFigure(rows, 700);
  assert.deepEqual(traces[0].x, [.75, .25, null]);
  assert.deepEqual(traces[1].x, [2 / 3, .5, 0]);
  assert.deepEqual(traces[1].customdata[0], [2, 3]);
});

test('switching models preserves the language order for the selected scope', async () => {
  const { sourceOmissionRows } = await import('../src/leaderboard.mjs');
  const pooled = { DP: { English: [3, 10], Arabic: [6, 10] } };
  const model = { DP: { English: [3, 5], Arabic: [1, 5] } };
  const rows = sourceOmissionRows(model, pooled);
  assert.deepEqual(rows.map(row => row.language), ['Arabic', 'English']);
  assert.deepEqual(rows.map(row => row.DP), [[1, 5], [3, 5]]);
});
