import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leaderboardFigure, paperResultsFigure, paperResultsPreview, paperResultsRows } from '../src/leaderboard.mjs';
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
  assert.equal(compact.xaxis.title.text, 'Mean score');
  assert.equal(desktop.xaxis.title.text, 'Mean score');
});

test('the exact scores follow the selected ranking, with paper order available', () => {
  const paper = {
    columns: [
      { task: 'NI', description: 'Narrative inclusion F1', unit: '%' },
      { task: 'NE', description: 'Narrative exclusion F1', unit: '%' },
    ],
    rows: models.map(model => ({ id: model.id, name: model.name, cells: [] })),
  };
  const inclusion = rankedRows(models, 'NI');
  const exclusion = rankedRows(models, 'NE');
  assert.deepEqual(paperResultsRows(paper, 'ranking', inclusion).map(row => row.id), ['a', 'b']);
  assert.deepEqual(paperResultsRows(paper, 'ranking', exclusion).map(row => row.id), ['b', 'a']);
  assert.equal(paperResultsRows(paper, 'paper', exclusion), paper.rows);
});

test('the full results matrix preserves all published values and supports sorting', async () => {
  const { readFile } = await import('node:fs/promises');
  const paper = JSON.parse(await readFile(new URL('../paper-results.json', import.meta.url)));
  const original = paperResultsFigure(paper, 'paper', 1240);
  assert.equal(original.traces.length, 11);
  assert.deepEqual(original.layout.yaxis.categoryarray, paper.rows.map(row => row.name));
  const inclusionHeader = original.layout.annotations.find(header => header.x === .5);
  assert.match(inclusionHeader.text.replaceAll('<br>', ' '), /<b>Narrative inclusion<\/b> F1 \(%\)/);
  const missingHeader = original.layout.annotations.find(header => header.x === 2.5);
  assert.match(missingHeader.text.replaceAll('<br>', ' '), /<b>Include Missing Narratives<\/b> Recall \(%\)/);
  assert.ok(original.layout.annotations.some(header => /Language violations/.test(header.text.replaceAll('<br>', ' '))));
  assert.deepEqual(original.traces[0].text.slice(0, 2), ['21.0 (1.0)', '26.0 (1.3)']);
  assert.equal(original.traces[0].marker.color[0], '#cb181d');
  const bestInclusion = paperResultsFigure(paper, '0', 1240);
  assert.equal(bestInclusion.layout.yaxis.categoryarray[0], 'Gemini 3.8 Flash (low)');
  const fewestViolations = paperResultsFigure(paper, '10', 1240);
  assert.equal(fewestViolations.traces[10].text[0], '22');
});

test('only the column controlling exact-score order is highlighted', async () => {
  const { readFile } = await import('node:fs/promises');
  const paper = JSON.parse(await readFile(new URL('../paper-results.json', import.meta.url)));
  const highlighted = (sort, metric) => paperResultsFigure(paper, sort, 1600, paper.rows, metric)
    .layout.annotations.filter(header => header.bgcolor).map(header => header.x);
  assert.deepEqual(highlighted('ranking', 'NI'), [.5]);
  assert.deepEqual(highlighted('ranking', 'DP'), [4.5]);
  assert.deepEqual(highlighted('10', 'DP'), [10.5]);
  assert.deepEqual(highlighted('paper', 'DP'), []);
});

test('the homepage preview shows the best published score for each foundational task', async () => {
  const { readFile } = await import('node:fs/promises');
  const paper = JSON.parse(await readFile(new URL('../paper-results.json', import.meta.url)));
  assert.deepEqual(paperResultsPreview(paper), [
    { measure: 'Narrative inclusion', name: 'Gemini 3.8 Flash (low)', score: 52.5 },
    { measure: 'Narrative exclusion', name: 'Gemini 2.5 Pro', score: 74.2 },
    { measure: 'Include Missing Narratives', name: 'Gemini 3.8 Flash (low)', score: 82.8 },
  ]);
});

test('filtered scores keep the paper matrix shape and distinguish unavailable values from zero', async () => {
  const { readFile } = await import('node:fs/promises');
  const { filteredResults } = await import('../src/leaderboard.mjs');
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

test('language comparisons preserve both disparity axes and paired run connections', async () => {
  const {disparityFigure, languageGridFigure, selectRuns} = await import('../src/language-disparities.mjs');
  const row={id:'m',name:'Model',query:4,source:6,coverage:80,cases:960,languages:{query:[{language:'en',gap:0,score:80,english:80,cases:20}],source:[]}};
  const data={original:[row],hard:[{...row,query:5,source:8,cases:900}]};
  const {traces}=disparityFigure({data,cohort:'both',selected:'all'},900);
  assert.deepEqual(traces[0].x,[4,5]);
  assert.deepEqual(traces[0].y,[6,8]);
  assert.equal(traces[2].customdata[0][3],900);
  assert.equal(selectRuns(data,'original').length,1);
  const grid=languageGridFigure({data,cohort:'both',selected:'all',axis:'query',languages:{en:'English'}},500);
  assert.deepEqual(grid.traces[0].x,['English','English']);
  assert.equal(grid.traces[0].customdata[1][4],20);
});


test('Hard rows stay directly below the same original model when sorting', async () => {
  const { combinedResults } = await import('../src/leaderboard.mjs');
  const original = { columns: [{task:'NI'}], palette:['#fff','#f00'], rows:[
    {id:'a', name:'A', cells:[{value:90,display:'90.0'}]},
    {id:'b', name:'B', cells:[{value:80,display:'80.0'}]}] };
  const hard = {...original, rows:[{id:'a',name:'A',counts:{NI:1},cells:[{value:40,display:'40.0'}]}]};
  const result = combinedResults(original, hard);
  assert.deepEqual(paperResultsRows(result, '0').map(row=>row.id), ['a','a--hard','b']);
  assert.equal(result.rows[1].counts.NI,1);
  assert.match(result.rows[1].name,/Hard/);
  assert.equal(result.rows[0].cells[0].display, '90.0');
  assert.equal(result.rows[1].cells[0].value,40);
});
