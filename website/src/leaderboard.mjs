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

export function paperResultsRows(paper, sort) {
  if (sort === 'paper') return paper.rows;
  const index = Number(sort);
  const direction = paper.columns[index].task ? -1 : 1;
  return [...paper.rows].sort((a, b) => {
    const left = a.cells[index].value;
    const right = b.cells[index].value;
    if (left == null || right == null) return Number(left == null) - Number(right == null);
    return direction * (left - right);
  });
}

export function paperResultsFigure(paper, sort, width) {
  const rows = paperResultsRows(paper, sort);
  const names = rows.map(row => row.name);
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
  const group = (text, x, y, size = 12) => ({
    text, x, y, xref: 'x', yref: 'paper', showarrow: false, font: { size },
  });
  const layout = {
    width, height: rows.length * 31 + 101,
    margin: { l: 214, r: 16, t: 89, b: 12 },
    barmode: 'stack', bargap: .11, showlegend: false, hovermode: 'closest', dragmode: false,
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent', font: { ...font, size: 12 },
    hoverlabel: { bgcolor: '#002d72', font: { color: '#f8f8fc' }, align: 'left' },
    annotations: [
      group('<b>Foundational capabilities</b>', 1.5, 1.176, 13),
      group('<b>Higher-level information-seeking capabilities</b>', 6.5, 1.176, 13),
      group('<b>Language<br>compliance</b>', 10.5, 1.176, 12),
      ...[[.5, 'FC-1'], [1.5, 'FC-2'], [2.5, 'FC-3'], [4, 'HC-1'], [5.5, 'HC-2'], [8, 'HC-3']]
        .map(([x, label]) => group(label, x, 1.124, 11)),
    ],
    xaxis: {
      side: 'top', range: [0, paper.columns.length], tickmode: 'array', fixedrange: true,
      tickvals: paper.columns.map((_, index) => index + .5),
      ticktext: paper.columns.map(column => `<b>${column.label}</b><br>(${column.unit})`),
      tickfont: { size: 11 }, showgrid: false, zeroline: false,
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

export function mountPaperResults(host, fallback, status) {
  const update = mountPlot(host, ({ paper, sort }, width) => paperResultsFigure(paper, sort, width), {
    wave: ['.barlayer .trace', '.bartext'],
    success() {
      fallback.classList.add('sr-only');
      status.hidden = true;
    },
    failure() {
      host.hidden = true;
      fallback.classList.remove('sr-only');
      status.textContent = 'Showing the exact scores in a standard table.';
      status.hidden = false;
    },
  });
  return (paper, sort) => update({ paper, sort });
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
