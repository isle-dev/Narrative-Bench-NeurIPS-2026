const config = { displayModeBar: false, displaylogo: false, showTips: false };
const font = { family: 'Work Sans, system-ui, sans-serif', color: '#002d72' };
let plotly;

function loadPlotly() {
  plotly ??= import('./vendor/plotly.js').then(() => globalThis.Plotly ?? globalThis.moduleName);
  return plotly;
}

export function filteredResults(paper, slice) {
  const rows = paper.rows.map(({ id, name }) => ({ id, name, cells: [] }));
  paper.columns.forEach((column, index) => {
    const values = rows.map(({ id }) => {
      if (column.task) {
        const score = slice?.scores[id]?.[column.task];
        return score == null ? null : score * 100;
      }
      return slice?.diagnostics?.[id]?.[column.diagnostic] ?? null;
    });
    const distances = values.map(value => value == null ? null : column.task ? 100 - value : value);
    const worst = Math.max(0, ...distances);
    for (const [row, value] of values.entries()) {
      if (value == null) {
        rows[row].cells[index] = { value: null, bin: null, display: '—' };
        continue;
      }
      const display = column.task ? (Math.round(value * 10) / 10).toFixed(1) : value.toFixed(column.decimals);
      const bin = worst > 0 ? Math.min(paper.palette.length - 1, Math.floor(distances[row] / worst * paper.palette.length)) : 0;
      rows[row].cells[index] = { value, bin, display };
    }
  });
  return { ...paper, rows };
}

export function paperResultsRows(paper, sort, ranking) {
  if (sort === 'paper') return paper.rows;
  if (sort === 'ranking') {
    const rowsById = new Map(paper.rows.map(row => [row.id, row]));
    return ranking.map(row => rowsById.get(row.id));
  }
  const index = Number(sort);
  const direction = paper.columns[index].task ? -1 : 1;
  return [...paper.rows].sort((a, b) => {
    const left = a.cells[index].value;
    const right = b.cells[index].value;
    if (left == null || right == null) return Number(left == null) - Number(right == null);
    return direction * (left - right);
  });
}

export function paperSortColumn(paper, sort, metric) {
  if (sort === 'paper') return -1;
  return sort === 'ranking' ? paper.columns.findIndex(column => column.task === metric) : Number(sort);
}

export function paperResultsPreview(paper) {
  return ['NI', 'NE', 'MNI'].map(task => {
    const index = paper.columns.findIndex(column => column.task === task);
    const [best] = paperResultsRows(paper, String(index));
    return { measure: paper.columns[index].description, name: best.name, score: best.cells[index].value };
  });
}

function wrapColumnLabel(label) {
  const lines = [];
  let line = '';
  for (const word of label.split(' ')) {
    if (line && line.length + word.length + 1 > 19) {
      lines.push(line);
      line = '';
    }
    line = line ? `${line} ${word}` : word;
  }
  return [...lines, line].join('<br>');
}

export function paperResultsFigure(paper, sort, width, ranking, metric) {
  const rows = paperResultsRows(paper, sort, ranking);
  const names = rows.map(row => row.name);
  const activeColumn = paperSortColumn(paper, sort, metric);
  const traces = paper.columns.map((column, index) => {
    const cells = rows.map(row => row.cells[index]);
    return {
      type: 'bar', orientation: 'h', y: names, x: names.map(() => 1),
      text: cells.map(cell => cell.display),
      textposition: 'inside', insidetextanchor: 'middle', constraintext: 'none',
      insidetextfont: { size: 12, color: cells.map(cell => cell.bin === 4 ? '#f8f8fc' : '#182135') },
      marker: { color: cells.map(cell => paper.palette[cell.bin] ?? '#e4eaf2'), line: { color: '#f8f8fc', width: 1 } },
      customdata: cells.map(cell => [cell.bin * 20, (cell.bin + 1) * 20]),
      hovertemplate: cells.map(cell => cell.value == null
        ? `<b>%{y}</b><br>${column.description}: unavailable for these filters<extra></extra>`
        : `<b>%{y}</b><br>${column.description}: %{text} (${column.unit})<br>%{customdata[0]}–%{customdata[1]}% distance from ideal<extra></extra>`),
    };
  });
  const header = (text, x, yshift, size) => ({
    text, x, y: 1, yshift, xref: 'x', yref: 'paper', yanchor: 'middle', showarrow: false, font: { size },
  });
  const layout = {
    width, height: rows.length * 34 + 160,
    margin: { l: 224, r: 16, t: 146, b: 14 },
    barmode: 'stack', bargap: .16, showlegend: false, hovermode: 'closest', dragmode: false,
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent', font: { ...font, size: 12 },
    hoverlabel: { bgcolor: '#002d72', font: { color: '#f8f8fc' }, align: 'left' },
    annotations: [
      header('<b>Foundational capabilities</b>', 1.5, 122, 13),
      header('<b>Higher-level information-seeking capabilities</b>', 6.5, 122, 13),
      header('<b>Language compliance</b>', 10.5, 122, 12),
      ...paper.columns.map((column, index) => {
        const selected = index === activeColumn;
        const direction = column.task ? '↓' : '↑';
        const unit = selected ? `(${column.unit}) ${direction}` : `(${column.unit})`;
        return {
          ...header(`<b>${wrapColumnLabel(column.description)}</b><br>${unit}`, index + .5, 57, 12),
          ...(selected ? { bgcolor: '#f08087', borderpad: 8 } : {}),
        };
      }),
    ],
    xaxis: {
      range: [0, paper.columns.length], fixedrange: true, showticklabels: false,
      showgrid: false, zeroline: false,
    },
    yaxis: {
      type: 'category', categoryorder: 'array', categoryarray: names, autorange: 'reversed',
      fixedrange: true, ticklabelstandoff: 9, showgrid: false,
    },
  };
  return { traces, layout };
}

function scoreWave(host, layer, selector) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const traces = host.querySelectorAll(layer);
  for (const [column, trace] of traces.entries()) {
    for (const [row, node] of trace.querySelectorAll(selector).entries()) {
      for (const animation of node.getAnimations?.() ?? []) animation.cancel();
      node.animate?.([{ opacity: .22, translate: '0 5px' }, { opacity: 1, translate: '0 0' }], {
        duration: 280, delay: column * 14 + row * 10, easing: 'ease-out', fill: 'backwards',
      });
    }
  }
}

function mountPlot(host, figure, { success, failure, wave }) {
  let current;
  let rendered;
  let previousWidth;
  let drawing = false;

  async function draw() {
    const width = host.clientWidth;
    if (!current || !width || drawing || (current === rendered && previousWidth === width)) return;
    const settings = current;
    const changed = rendered && settings !== rendered;
    drawing = true;
    try {
      const library = await loadPlotly();
      if (current !== settings || !host.clientWidth) return;
      const { traces, layout } = figure(settings, width);
      await library.react(host, traces, layout, config);
      if (current === settings) {
        success();
        if (changed) scoreWave(host, ...wave);
      }
    } catch {
      if (current === settings) failure();
    } finally {
      drawing = false;
      rendered = settings;
      previousWidth = width;
      if (current !== settings || host.clientWidth !== width) void draw();
    }
  }

  new ResizeObserver(draw).observe(host);
  return settings => {
    current = settings;
    host.hidden = false;
    void draw();
  };
}

function mountTablePlot(host, fallback, status, figure, wave) {
  return mountPlot(host, figure, {
    wave,
    success() {
      fallback.classList.add('sr-only');
      status.hidden = true;
    },
    failure() {
      host.hidden = true;
      fallback.classList.remove('sr-only');
      status.textContent = 'Showing the results in a standard table.';
      status.hidden = false;
    },
  });
}

export function mountPaperResults(host, fallback, status) {
  const update = mountTablePlot(host, fallback, status,
    ({ paper, sort, ranking, metric }, width) => paperResultsFigure(paper, sort, width, ranking, metric),
    ['.barlayer .trace', '.bartext']);
  return (paper, sort, ranking, metric) => update({ paper, sort, ranking, metric });
}

function omissionRate(counts) {
  return counts ? counts[0] / counts[1] : null;
}

export function sourceOmissionRows(data = {}, pooled = data) {
  const baseline = data.BP ?? {};
  const diverse = data.DP ?? {};
  const orderingRate = ({ language }) => omissionRate(pooled.DP?.[language]) ?? omissionRate(pooled.BP?.[language]);
  return [...new Set([...Object.keys(baseline), ...Object.keys(diverse)])]
    .map(language => ({ language, BP: baseline[language], DP: diverse[language] }))
    .sort((a, b) => orderingRate(b) - orderingRate(a) || a.language.localeCompare(b.language));
}

export function sourceOmissionFigure(rows, width) {
  const names = rows.map(row => row.language);
  const traces = [
    ['BP', 'Baseline prompt', '#68ace5'],
    ['DP', 'Diverse prompt', '#145897'],
  ].map(([task, name, color]) => ({
    type: 'bar', orientation: 'h', name, y: names,
    x: rows.map(row => omissionRate(row[task])),
    customdata: rows.map(row => row[task] ?? [0, 0]),
    marker: { color },
    hovertemplate: `<b>%{y}</b><br>${name}: %{x:.1%}<br>%{customdata[0]} omissions / %{customdata[1]} opportunities<extra></extra>`,
  }));
  const layout = {
    width, height: Math.max(182, rows.length * 26 + 90),
    margin: { l: width < 530 ? 82 : 110, r: 24, t: 36, b: 54 },
    barmode: 'group', bargap: .22, dragmode: false, hovermode: 'closest', showlegend: Boolean(rows.length),
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent', font: { ...font, size: width < 530 ? 10 : 12 },
    hoverlabel: { bgcolor: '#002d72', font: { color: '#f8f8fc' }, align: 'left' },
    xaxis: { range: [0, 1], tickformat: '.0%', fixedrange: true, gridcolor: '#dce5ee',
      title: { text: 'Source-language omission rate' } },
    yaxis: { type: 'category', categoryorder: 'array', categoryarray: names, autorange: 'reversed', fixedrange: true },
    annotations: rows.length ? [] : [{
      text: 'No source-language cases for these filters', x: .5, y: .5, xref: 'paper', yref: 'paper',
      showarrow: false, font: { size: 12 },
    }],
  };
  return { traces, layout };
}

export function mountSourceOmissions(host, fallback, status) {
  return mountTablePlot(host, fallback, status, sourceOmissionFigure, ['.barlayer .trace', '.point']);
}

export function leaderboardFigure(rows, metric, cases, width) {
  const compact = width < 600;
  const names = rows.map(row => row.name);
  const values = rows.map(row => row.value == null ? null : row.value / 1000);
  const color = rows.map(row => row.rank === 1 ? '#002d72' : '#4877a8');
  const traces = [
    {
      type: 'scatter',
      mode: 'lines',
      x: values.flatMap(value => [value == null ? null : 0, value, null]),
      y: names.flatMap(name => [name, name, null]),
      line: { color: '#8ab5da', width: 2 },
      hoverinfo: 'skip',
    },
    {
      type: 'scatter',
      mode: 'markers+text',
      x: values,
      y: names,
      customdata: rows.map(row => [row.rank, cases]),
      marker: { color, size: compact ? 8 : 11 },
      text: values.map(value => value == null ? '' : `${(value * 100).toFixed(1)}%`),
      textposition: 'middle right',
      textfont: { size: compact ? 9 : 12 },
      hovertemplate: `<b>%{y}</b><br>${metric}: %{x:.1%}<br>Rank %{customdata[0]} · n = %{customdata[1]}<extra></extra>`,
      cliponaxis: false,
    },
  ];
  if (!cases) {
    traces.push({ type: 'scatter', mode: 'markers', x: names.map(() => 0), y: names, opacity: 0, hoverinfo: 'skip' });
  }
  const layout = {
    width,
    height: rows.length * (compact ? 27 : 30) + 69,
    margin: { l: compact ? 144 : 233, r: compact ? 38 : 46, t: 12, b: 56 },
    showlegend: false,
    hovermode: 'closest',
    dragmode: false,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { ...font, size: compact ? 10 : 13 },
    hoverlabel: { bgcolor: '#161e36', font: { color: '#f8f8fc' }, align: 'left' },
    xaxis: {
      range: [0, 1],
      tickformat: '.0%',
      dtick: compact ? .25 : .1,
      gridcolor: '#dddce8',
      zerolinecolor: '#b4b0c5',
      fixedrange: true,
      title: { text: compact ? 'Mean score' : 'Mean language-gated score', font: { size: compact ? 11 : 13 } },
    },
    yaxis: { type: 'category', ticklabelstandoff: 9, showgrid: false, categoryorder: 'array', categoryarray: names, autorange: 'reversed', fixedrange: true },
    annotations: cases ? [] : [{
      text: 'No evaluated cases for these filters', x: .5, y: .5, xref: 'paper', yref: 'paper',
      showarrow: false, font: { size: 12 }, bgcolor: '#f8f8fc', borderpad: 7,
    }],
  };
  return { traces, layout };
}

export function mountLeaderboardPlot(host, status) {
  const update = mountPlot(host, ({ rows, metric, cases }, width) => leaderboardFigure(rows, metric, cases, width), {
    wave: ['.scatterlayer .trace', '.textpoint, .point'],
    success() {
      status.hidden = true;
    },
    failure() {
      status.textContent = 'The chart could not load. See the exact scores table for the results.';
      status.hidden = false;
    },
  });
  return (rows, metric, cases) => update({ rows, metric, cases });
}
