export function leaderboardFigure(rows, metric, cases, width) {
  const compact = width < 600;
  const names = rows.map(row => row.name);
  const values = rows.map(row => row.value / 1000);
  const color = rows.map(row => row.rank === 1 ? '#463cf4' : '#7770ac');
  const traces = [
    {
      type: 'scatter',
      mode: 'lines',
      x: values.flatMap(value => [0, value, null]),
      y: names.flatMap(name => [name, name, null]),
      line: { color: '#8e88bc', width: 2 },
      hoverinfo: 'skip',
    },
    {
      type: 'scatter',
      mode: 'markers+text',
      x: values,
      y: names,
      customdata: rows.map(row => [row.rank, cases]),
      marker: { color, size: compact ? 8 : 11 },
      text: values.map(value => `${(value * 100).toFixed(1)}%`),
      textposition: 'middle right',
      textfont: { size: compact ? 9 : 12 },
      hovertemplate: `<b>%{y}</b><br>${metric}: %{x:.1%}<br>Rank %{customdata[0]} · %{customdata[1]} cases<extra></extra>`,
      cliponaxis: false,
    },
  ];
  const layout = {
    width,
    height: rows.length * (compact ? 27 : 30) + 69,
    margin: { l: compact ? 144 : 233, r: compact ? 26 : 46, t: 12, b: 56 },
    showlegend: false,
    hovermode: 'closest',
    dragmode: false,
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: 'DM Sans, system-ui, sans-serif', color: '#181b30', size: compact ? 10 : 13 },
    hoverlabel: { bgcolor: '#161e36', font: { color: '#fff' }, align: 'left' },
    xaxis: {
      range: [0, 1],
      tickformat: '.0%',
      dtick: compact ? .25 : .1,
      gridcolor: '#dddce8',
      zerolinecolor: '#b4b0c5',
      fixedrange: true,
      title: { text: compact ? 'Mean score' : 'Mean language-gated score', font: { size: compact ? 11 : 13 } },
    },
    yaxis: { type: 'category', showgrid: false, categoryorder: 'array', categoryarray: names, autorange: 'reversed', fixedrange: true },
  };
  return { traces, layout };
}

export function mountLeaderboardPlot(host, status) {
  let plotly;
  let current;
  let previousWidth;
  const config = { displayModeBar: false, displaylogo: false, showTips: false };

  async function draw() {
    if (!current || !host.clientWidth) return;
    const settings = current;
    const width = host.clientWidth;
    previousWidth = width;
    try {
      plotly ??= import('./vendor/plotly.js').then(() => globalThis.Plotly ?? globalThis.moduleName);
      const library = await plotly;
      if (current !== settings || !host.clientWidth) return;
      const { traces, layout } = leaderboardFigure(settings.rows, settings.metric, settings.cases, width);
      await library.react(host, traces, layout, config);
      if (current === settings) status.hidden = true;
    } catch {
      if (current === settings) {
        status.textContent = 'The chart could not load. Open Exact scores to see the results.';
        status.hidden = false;
      }
    }
  }

  new ResizeObserver(() => {
    if (host.clientWidth && host.clientWidth !== previousWidth) draw();
  }).observe(host);

  return (rows, metric, cases) => {
    current = { rows, metric, cases };
    draw();
  };
}
