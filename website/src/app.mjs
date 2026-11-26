import { formatAnswer } from './answer-format.mjs';
import { BENCHMARK_NAMES, PAPER_GROUP_NAMES, paperResultsGroup, combinedResults, filteredResults, mountLeaderboardPlot, mountPaperResults, mountSourceOmissions, paperResultsRows, paperSortColumn, combinedSourceOmissionRows } from './leaderboard.mjs';
import { evaluationModels, parseRoute, queryLanguages, queryScrollState, resolveModelSelection, resolveSelection, sliceRanking } from './state.mjs';

const TASKS = {
  NI: 'Narrative inclusion',
  NE: 'Narrative exclusion',
  MNI: 'Include Missing Narratives',
  BP: 'Baseline prompt',
  DP: 'Diverse prompt',
};
const LANGUAGE_STATUS = {
  same: 'Passed query-language check',
  different: 'Different language',
  mixed: 'Mixed languages',
  no_answer: 'No answer',
  unknown: 'Language uncertain',
};
const DEFAULT_TOPIC = 'gaza';
const DEFAULT_MODELS = ['gemini-4-hydrogen-xhigh', 'gemini-4-hydrogen-xhigh--hard'];
const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en');
const percent = value => `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
const cache = new Map();
const currentResponses = new WeakMap();
const assetVersion = new URL(import.meta.url).search;
const plotRanking = mountLeaderboardPlot($('rank-plot'), $('ranking-status'));
const plotPaper = mountPaperResults($('paper-matrix'), $('paper-fallback'), $('paper-status'));
const plotOmissions = mountSourceOmissions($('source-plot'), $('source-fallback'), $('source-status'));
let paper;
let matrix;
let matrixKey;
let matrixCaption = 'Benchmark results';
let rankingKey;
let ranking;
let sourceKey;
let paperSort = 'paper';
let catalog;
let hardMatrix;
let hardCatalog;
let hardSlices;
let map;
let mapSelection;
let activeQuery;
let renderId = 0;
let lastPage;
let queryListKey;
let loadedCase;
let loadedCaseContext;

function data(path) {
  if (!cache.has(path)) {
    const request = fetch(new URL(`./data/${path}.json${assetVersion}`, import.meta.url))
      .then(response => {
        if (!response.ok) throw new Error(`Could not load ${path}`);
        return response.json();
      })
      .catch(error => {
        cache.delete(path);
        throw error;
      });
    cache.set(path, request);
    if (cache.size > 32) cache.delete(cache.keys().next().value);
  }
  return cache.get(path);
}

function datasetData(dataset, path) {
  return data((dataset === 'hard' ? 'hard/' : '') + path);
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function options(select, entries, value) {
  select.replaceChildren(...entries.map(([id, label]) => new Option(label, id)));
  select.value = value;
  select.disabled = entries.length === 0;
}

function hashFor(route) {
  const { page, ...values } = route;
  const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
  return `#${page === 'leaderboard' ? 'leaderboard' : 'explore'}${params.size ? `?${params}` : ''}`;
}

function changeRoute(changes) {
  const hash = hashFor({ ...parseRoute(location.hash), section: undefined, ...changes });
  if (hash === location.hash) render();
  else location.hash = hash;
}

function selectTopic(topic, fromGlobe = false) {
  if (parseRoute(location.hash).topic === topic) map?.setSelection(mapSelection, true);
  else changeRoute({ topic, query: undefined });
  if (fromGlobe && matchMedia('(max-width: 850px)').matches) {
    $('topic-title').scrollIntoView({ block: 'start' });
  }
}

function sortedLanguages() {
  return Object.entries(catalog.languages).sort((a, b) => a[1].localeCompare(b[1]));
}

function sortedTopics() {
  return [...catalog.topics].sort((a, b) => a.label.localeCompare(b.label));
}

function renderPaperResults() {
  const metric = $('metric').value;
  const activeColumn = paperSortColumn(matrix, paperSort, metric);
  options($('paper-sort'), [
    ['ranking', 'Follow Rank by'],
    ['paper', 'Published order, then follow-up runs'],
    ...matrix.columns.map((column, index) => [String(index), column.description]),
  ], paperSort);
  const table = element('table');
  table.append(element('caption', matrixCaption, 'sr-only'));
  const head = table.createTHead().insertRow();
  const modelHeading = element('th', 'Model');
  modelHeading.scope = 'col';
  head.append(modelHeading);
  for (const [index, column] of matrix.columns.entries()) {
    const detail = column.metric ? `${column.metric} (${column.unit})` : column.unit;
    const heading = element('th', `${column.description} · ${detail}`);
    heading.scope = 'col';
    if (index === activeColumn) heading.setAttribute('aria-sort', column.task ? 'descending' : 'ascending');
    head.append(heading);
  }
  let body;
  let group;
  for (const model of paperResultsRows(matrix, paperSort, ranking)) {
    const nextGroup = paperResultsGroup(model, paperSort);
    if (nextGroup !== group) {
      group = nextGroup;
      body = table.createTBody();
      const titleRow = body.insertRow();
      titleRow.className = `score-group-heading score-group-heading-${group}`;
      const title = element('th', PAPER_GROUP_NAMES[group]);
      title.scope = 'rowgroup';
      title.colSpan = matrix.columns.length + 1;
      titleRow.append(title);
    }
    const row = body.insertRow();
    const name = element('th', model.name);
    name.scope = 'row';
    row.append(name, ...model.cells.map(cell => element('td', cell.display, 'number')));
  }
  $('paper-fallback').replaceChildren(table);
  plotPaper(matrix, paperSort, ranking, metric);
}

function renderSourceOmissions(data, pooled, label) {
  const rows = combinedSourceOmissionRows(data, pooled);
  const fallback = $('source-fallback');
  if (!rows.length) {
    fallback.replaceChildren(element('p', 'No source-language cases for these filters.'));
    plotOmissions(rows);
    return;
  }
  const table = element('table');
  table.append(element('caption', `Source-language omission by prompt · ${label}`, 'sr-only'));
  const header = table.createTHead().insertRow();
  for (const name of ['Source language', ...Object.values(BENCHMARK_NAMES).flatMap(name => [`${name}: Baseline prompt`, `${name}: Diverse prompt`])]) {
    const heading = element('th', name);
    heading.scope = 'col';
    header.append(heading);
  }
  const body = table.createTBody();
  for (const item of rows) {
    const row = body.insertRow();
    const heading = element('th', item.language);
    heading.scope = 'row';
    row.append(heading);
    for (const counts of [item.original.BP, item.original.DP, item.hard.BP, item.hard.DP]) {
      const text = counts ? `${percent(counts[0] / counts[1])} (${number.format(counts[0])} / ${number.format(counts[1])})` : '—';
      row.append(element('td', text, 'number'));
    }
  }
  fallback.replaceChildren(table);
  plotOmissions(rows);
}

async function updateSourceOmissions(topic, lang, models, selected, pooled, run) {
  const key = `${topic}/${lang}/${selected ?? ''}`;
  const status = $('source-status');
  if (status.hasAttribute('data-model-error')) {
    delete status.dataset.modelError;
    status.hidden = true;
  }
  if (sourceKey === key) return;
  let counts = pooled;
  if (selected) {
    try {
      const entries = await Promise.all(['original', 'hard'].map(async dataset => {
        if (!models.some(model => model.dataset === dataset && model.baseId === selected)) return [dataset, undefined];
        const slices = await datasetData(dataset, `source-omissions/${selected}`);
        return [dataset, slices[topic]?.[lang]];
      }));
      counts = Object.fromEntries(entries);
    } catch {
      if (run !== renderId) return;
      status.dataset.modelError = '';
      status.textContent = 'Source-language results for this model could not load.';
      status.hidden = false;
      return;
    }
  }
  if (run !== renderId) return;
  const model = models.find(model => model.baseId === selected);
  const label = model?.name ?? 'All model configurations in each evaluation';
  const missing = selected && ['original', 'hard'].filter(dataset => !models.some(model => model.dataset === dataset && model.baseId === selected));
  const pooledLabel = `${catalog.models.length} NarrativeBench configurations and ${hardCatalog.models.length} NarrativeBench Hard configurations. Select a configuration evaluated on both to compare the same model.`;
  $('source-scope').textContent = missing?.length
    ? `${label} was not evaluated on ${missing.map(dataset => BENCHMARK_NAMES[dataset]).join(' or ')}.`
    : selected ? label : pooledLabel;
  sourceKey = key;
  renderSourceOmissions(counts, pooled, label);
}

async function renderLeaderboard(route, run) {
  const metric = Object.hasOwn(TASKS, route.metric) ? route.metric : 'NI';
  const topics = sortedTopics();
  const topic = topics.some(item => item.id === route.topic) ? route.topic : 'all';
  const lang = Object.hasOwn(catalog.languages, route.lang) ? route.lang : 'all';
  const sourceModels = evaluationModels(catalog.models, hardCatalog.models);
  const selectedModelId = route.sourceModel?.replace(/--hard$/, '');
  const sourceModel = sourceModels.find(model => model.baseId === selectedModelId);
  const modelOptions = [...new Map(sourceModels.map(({ baseId, name }) => [baseId, name]))]
    .sort((a, b) => a[1].localeCompare(b[1]));
  options($('source-model'), [['', 'All model configurations in each evaluation'], ...modelOptions], sourceModel?.baseId ?? '');
  options($('rank-topic'), [['all', 'All topics'], ...topics.map(item => [item.id, item.label])], topic);
  options($('rank-language'), [['all', 'All query languages'], ...sortedLanguages()], lang);
  const hash = hashFor({
    page: 'leaderboard', metric: metric === 'NI' ? undefined : metric,
    topic: topic === 'all' ? undefined : topic, lang: lang === 'all' ? undefined : lang,
    sourceModel: sourceModel?.baseId,
  });
  history.replaceState(null, '', hash);
  $('nav-leaderboard').href = hash;
  const key = `${topic}/${lang}`;
  const filtered = topic !== 'all' || lang !== 'all';
  const [results, slices, omissions, hardResults, hardFiltered, hardOmissions] = await Promise.all([
    paper ?? data('paper-results'), filtered ? data('rankings') : null, filtered ? null : data('source-omissions'),
    hardMatrix ?? data('hard/paper-results'), filtered ? (hardSlices ?? data('hard/rankings')) : null,
    filtered ? null : data('hard/source-omissions'),
  ]);
  if (run !== renderId) return;
  paper = results;
  hardMatrix = hardResults;
  if (hardFiltered) hardSlices = hardFiltered;
  const hardSlice = hardFiltered?.[topic]?.[lang];
  const slice = slices?.[topic]?.[lang];
  const measures = paper.columns.filter(column => column.task);
  const measure = measures.find(column => column.task === metric);
  options($('metric'), measures.map(column => [column.task, column.description]), metric);

  const matrixChanged = matrixKey !== key;
  if (matrixChanged) {
    const scope = [
      topics.find(item => item.id === topic)?.label ?? 'All topics',
      catalog.languages[lang] ?? 'All query languages',
    ];
    if (filtered && !slice && !hardSlice) scope.push('No evaluated cases');
    matrixCaption = filtered ? `Benchmark results · ${scope.join(' · ')}` : 'Benchmark results';
    matrix = combinedResults(filtered ? filteredResults(paper, slice) : paper,
      filtered ? filteredResults(hardResults, hardSlice) : hardResults);
    matrixKey = key;
  }

  const rankKey = `${key}/${metric}`;
  const rankingChanged = rankingKey !== rankKey;
  if (rankingChanged) {
    rankingKey = rankKey;
    const selection = sliceRanking(catalog, slices, topic, lang, metric);
    const originalRanking = selection?.rows ?? catalog.models.map(model => ({ ...model, value: null, rank: null }));
    const hardRanking = sliceRanking(hardCatalog, hardFiltered, topic, lang, metric)?.rows ?? hardCatalog.models.map(model => ({ ...model, value: null, rank: null }));
    ranking = [...originalRanking, ...hardRanking.map(row => ({
      ...row, id: `${row.id}--hard`, dataset: 'hard',
    }))];
    const cases = selection?.counts[metric] ?? 0;
    $('score-note').textContent = `${measure.description} · ${measure.metric}`;
    plotRanking(ranking, `${measure.description} (${measure.metric})`, cases);
  }
  if (matrixChanged || (rankingChanged && paperSort === 'ranking')) renderPaperResults();
  await updateSourceOmissions(topic, lang, sourceModels, sourceModel?.baseId, {
    original: filtered ? slice?.sourceOmissions : omissions,
    hard: filtered ? hardSlice?.sourceOmissions : hardOmissions,
  }, run);
}

const queryList = $('queries');
const queryScrollbar = $('query-scrollbar');
const moreQueries = $('more-queries');

function updateQueryScroll() {
  if (!queryList.clientHeight) return;
  const rows = [...queryList.children];
  const { first, last, max, position, atEnd } = queryScrollState(
    rows, queryList.clientHeight, queryList.scrollHeight, queryList.scrollTop,
  );
  const overflow = max > 1;
  queryScrollbar.hidden = !overflow;
  $('query-pagination').hidden = !overflow;
  if (!overflow) return;
  const range = `Showing ${first === last ? first : `${first}–${last}`} of ${rows.length}`;
  queryScrollbar.max = max;
  queryScrollbar.value = position;
  queryScrollbar.setAttribute('aria-valuetext', range);
  $('query-range').textContent = range;
  moreQueries.textContent = atEnd ? 'Back to first queries ↑' : 'More queries ↓';
}

queryList.addEventListener('scroll', updateQueryScroll, { passive: true });
queryScrollbar.addEventListener('input', () => { queryList.scrollTop = queryScrollbar.valueAsNumber; });
moreQueries.addEventListener('click', () => {
  const atEnd = queryScrollbar.max - queryList.scrollTop < 1;
  queryList.scrollTo({
    top: atEnd ? 0 : queryList.scrollTop + queryList.clientHeight * .85,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
});
new ResizeObserver(updateQueryScroll).observe(queryList);

function renderQueries(topic, selection, scope) {
  const { lang, query, choices } = selection;
  const list = queryList;
  const key = `${topic.id}/${lang}/${scope}`;
  if (queryListKey !== key) {
    const buttons = choices.map(item => {
      const button = element('button');
      button.type = 'button';
      button.dataset.query = item.id;
      const text = element('span', item.translations[lang]);
      text.dir = 'auto';
      text.lang = lang;
      const framing = item.type === 'neutral' ? 'Neutral' : 'Confirmatory';
      const availability = item.cases[lang] ? 'Recorded answers' : 'Dataset only';
      button.append(text, element('small', scope === 'dataset' ? `${framing} · ${availability}` : framing));
      button.addEventListener('click', () => changeRoute({ topic: topic.id, lang, query: item.id }));
      return button;
    });
    list.replaceChildren(...buttons);
    list.scrollTop = 0;
    queryListKey = key;
  }
  for (const button of list.children) button.setAttribute('aria-pressed', String(button.dataset.query === query?.id));
  $('query-browser').hidden = !choices.length;
  const active = [...list.children].find(button => button.dataset.query === query?.id);
  if (active && document.activeElement !== active) {
    const top = active.offsetTop;
    if (top < list.scrollTop || top + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top;
  }
  updateQueryScroll();
  $('query-count').textContent = choices.length ? `${number.format(choices.length)} ${choices.length === 1 ? 'query' : 'queries'}` : '';
  $('query-status').hidden = Boolean(choices.length);
  $('query-status').textContent = 'No questions are available for this selection.';
}

function setAnswerStatus(message, retry) {
  const status = $('answer-status');
  status.replaceChildren(document.createTextNode(message));
  status.hidden = !message;
  if (retry) {
    const button = element('button', 'Try again', 'retry-answer');
    button.type = 'button';
    button.addEventListener('click', render);
    status.append(' ', button);
  }
}

function showDatasetAnswerStatus(query, lang) {
  if (!query) {
    setAnswerStatus('');
    return;
  }
  setAnswerStatus(`No recorded answers for this query in ${catalog.languages[lang]}.`);
  const evaluated = queryLanguages([query]);
  const alternate = evaluated.has('en') ? 'en' : evaluated.values().next().value;
  if (!alternate) return;
  const button = element('button', `View answers in ${catalog.languages[alternate]}`, 'retry-answer');
  button.type = 'button';
  button.addEventListener('click', () => changeRoute({ lang: alternate }));
  $('answer-status').append(' ', button);
}

function renderAnswer(container, response, lang) {
  if (!response) {
    container.replaceChildren(element('p', 'No response is available for this case.', 'muted'));
    currentResponses.delete(container);
    return;
  }
  if (currentResponses.get(container) === response) return;
  const score = element('strong', `Score ${percent(response.score)}`);
  const meta = element('p', undefined, 'answer-meta');
  meta.append(score, element('span', LANGUAGE_STATUS[response.language]));
  const text = element('div', undefined, 'answer-text');
  text.dir = 'auto';
  if (response.language === 'same') text.lang = lang;
  if (response.text.trim()) {
    try {
      text.append(formatAnswer(response.text));
    } catch {
      text.textContent = response.text;
      text.classList.add('plain-answer');
    }
  } else {
    text.textContent = 'No answer was recorded.';
  }
  container.replaceChildren(meta, text);
  container.scrollTop = 0;
  currentResponses.set(container, response);
}

function renderCaseDetails(items, sources, caseId) {
  const caseContext = `${caseId}/${Object.keys(items).join('/')}`;
  if (loadedCaseContext === caseContext) return;
  const evaluations = $('case-evaluations');
  evaluations.replaceChildren();
  for (const [dataset, item] of Object.entries(items)) {
    const context = element('section', undefined, 'case-evaluation');
    context.append(element('h3', `${BENCHMARK_NAMES[dataset]} · ${item.sources.length} supplied articles`, 'case-evaluation-heading'));
    for (const [label, value] of [
      ['System instruction', item.instruction], ['Query context', item.context],
      ['Fixed prior answer', item.priorAnswer], ['Follow-up instruction', item.followup],
    ]) {
      if (!value) continue;
      const text = element('p', value);
      text.dir = 'auto';
      context.append(element('h4', label), text);
    }
    const list = element('ul');
    for (const id of item.sources) {
      const source = sources[id];
      const label = [id, source.publisher, source.region, source.language].filter(Boolean).join(' · ');
      const row = element('li');
      if (source.url) {
        const link = element('a', label);
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        row.append(link);
      } else {
        row.textContent = label;
      }
      list.append(row);
    }
    context.append(element('h4', 'Articles supplied to the models'), list);
    evaluations.append(context);
  }
  loadedCase = caseId;
  loadedCaseContext = caseContext;
}

const answerReader = $('answer-reader');
const readerOpener = $('open-answer-reader');
readerOpener.hidden = typeof answerReader.showModal !== 'function';
readerOpener.addEventListener('click', () => {
  $('answer-reader-body').append($('answer-question'), $('answer-grid'));
  answerReader.showModal();
});
$('close-answer-reader').addEventListener('click', () => answerReader.close());
answerReader.addEventListener('close', () => {
  $('answer-status').before($('answer-question'));
  $('case-details').before($('answer-grid'));
  readerOpener.focus({ preventScroll: true });
});
const answerTabs = document.querySelectorAll('button[data-answer-side]');
for (const button of answerTabs) {
  button.addEventListener('click', () => {
    $('answer-grid').dataset.answerSide = button.dataset.answerSide;
    for (const tab of answerTabs) tab.setAttribute('aria-pressed', String(tab === button));
  });
}

async function renderExplorer(route, run) {
  const topics = sortedTopics();
  const topic = topics.find(item => item.id === route.topic)
    ?? topics.find(item => item.id === DEFAULT_TOPIC) ?? topics[0];
  options($('topic'), topics.map(item => [item.id, item.label]), topic.id);
  if ($('topic-title').textContent !== topic.label) $('topic-title').textContent = topic.label;
  const scope = route.scope === 'dataset' ? 'dataset' : 'benchmark';
  const mode = ['conflicts', 'queries'].includes(route.pins) ? route.pins : 'both';
  const mapLang = Object.hasOwn(catalog.languages, route.mapLang) ? route.mapLang : '';
  for (const button of document.querySelectorAll('[data-scope]')) {
    button.setAttribute('aria-pressed', String(button.dataset.scope === scope));
  }
  for (const button of document.querySelectorAll('[data-pins]')) {
    button.setAttribute('aria-pressed', String(button.dataset.pins === mode));
  }
  options($('map-language'), [['', 'All languages'], ...sortedLanguages()], mapLang);
  $('map-language').disabled = mode === 'conflicts';

  if (!queryListKey?.startsWith(`${topic.id}/`)) {
    $('language').disabled = true;
    $('query-browser').hidden = true;
    $('query-count').textContent = '';
    $('query-status').hidden = false;
    $('query-status').textContent = 'Loading queries…';
    $('answer-grid').hidden = true;
    $('case-details').hidden = true;
    $('answer-question').hidden = true;
    $('task').disabled = true;
    setAnswerStatus('Loading recorded answers…');
  }
  const questions = await data(`topics/${topic.id}`);
  if (renderId !== run) return;
  const selection = resolveSelection(questions, route);
  const { lang, query, task, caseId } = selection;
  if ($('answer-reader').open && caseId !== loadedCase) $('answer-reader').close();
  activeQuery = query;
  const availableLanguages = queryLanguages(questions, scope);
  const languages = sortedLanguages().filter(([id]) => availableLanguages.has(id));
  options($('language'), languages, lang);
  renderQueries(topic, selection, scope);
  const nextMapSelection = { topic: topic.id, lang, queryId: query?.id, mode, scope, mapLang };
  if (Object.keys(nextMapSelection).some(key => mapSelection?.[key] !== nextMapSelection[key])) {
    mapSelection = nextMapSelection;
    map?.setSelection(mapSelection);
  }
  $('answer-question').textContent = query?.translations[lang] ?? '';
  $('answer-question').lang = lang ?? '';
  $('answer-question').hidden = !query;

  const tasks = Object.entries(TASKS).filter(([id]) => query?.cases[lang]?.[id]);
  options($('task'), tasks, task);
  if (!caseId) $('task').append(new Option('No recorded evaluation', ''));

  const models = evaluationModels(catalog.models, hardCatalog.models);
  const legacyBenchmark = route.benchmark;
  const left = resolveModelSelection(models, route.left, legacyBenchmark, DEFAULT_MODELS[0]);
  const right = resolveModelSelection(models, route.right, legacyBenchmark, DEFAULT_MODELS[1]);
  const resolved = {
    page: 'explorer', topic: topic.id, lang, query: query?.id, task, left: left.id, right: right.id,
    pins: mode === 'both' ? undefined : mode, scope: scope === 'benchmark' ? undefined : scope, mapLang,
  };
  const hash = hashFor({ ...resolved, section: route.section === 'poster' ? 'poster' : undefined });
  history.replaceState(null, '', hash);
  $('nav-explorer').href = hashFor(resolved);

  if (caseId !== loadedCase) {
    $('answer-grid').hidden = true;
    $('case-details').hidden = true;
    setAnswerStatus(caseId ? 'Loading recorded answers…' : '');
  }
  if (!caseId) {
    showDatasetAnswerStatus(query, lang);
    return;
  }
  let items;
  let sources;
  const datasets = [...new Set([left.dataset, right.dataset])].sort((a, b) => Number(a === 'hard') - Number(b === 'hard'));
  try {
    const [entries, articles] = await Promise.all([
      Promise.all(datasets.map(async dataset => [dataset, await datasetData(dataset, `cases/${caseId}`)])),
      data('sources'),
    ]);
    items = Object.fromEntries(entries);
    sources = articles;
  } catch {
    if (renderId === run) setAnswerStatus('The recorded answers could not load.', true);
    return;
  }
  if (renderId !== run) return;

  $('answer-question').textContent = items[left.dataset].query;
  renderCaseDetails(items, sources, caseId);
  $('case-details').hidden = false;
  const modelOptions = models.sort((a, b) => Number(a.dataset === 'hard') - Number(b.dataset === 'hard') || a.name.localeCompare(b.name))
    .map(model => [model.id, `${model.name} · ${BENCHMARK_NAMES[model.dataset]}`]);
  options($('left-model'), modelOptions, left.id);
  options($('right-model'), modelOptions, right.id);
  renderAnswer($('left-answer'), items[left.dataset].responses[left.baseId], lang);
  renderAnswer($('right-answer'), items[right.dataset].responses[right.baseId], lang);
  setAnswerStatus('');
  $('answer-grid').hidden = false;
}

async function render() {
  const run = ++renderId;
  const route = parseRoute(location.hash);
  const explorer = route.page === 'explorer';
  if (!explorer && $('answer-reader').open) $('answer-reader').close();
  $('explorer').hidden = !explorer;
  $('leaderboard').hidden = explorer;
  $('app-error').hidden = true;
  const activeNav = explorer ? (route.section === 'poster' ? 'nav-poster' : 'nav-explorer') : 'nav-leaderboard';
  for (const id of ['nav-explorer', 'nav-leaderboard', 'nav-poster']) {
    if (id === activeNav) $(id).setAttribute('aria-current', 'page');
    else $(id).removeAttribute('aria-current');
  }
  document.title = explorer ? 'The Narrative Gap | NarrativeBench' : 'Full results | NarrativeBench';
  if (lastPage && lastPage !== route.page) {
    window.scrollTo(0, 0);
    $('main').focus({ preventScroll: true });
  }
  lastPage = route.page;
  try {
    if (!catalog || !hardCatalog) {
      const [original, hard] = await Promise.all([data('catalog'), data('hard/catalog')]);
      if (run !== renderId) return;
      catalog = original;
      hardCatalog = hard;
    }
    if (run !== renderId) return;
    if (explorer) {
      await renderExplorer(route, run);
      if (run === renderId && route.section === 'poster') scrollToSection('poster');
    } else await renderLeaderboard(route, run);
  } catch {
    if (run === renderId) $('app-error').hidden = false;
  }
}

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  $('main').focus();
});
function scrollToSection(id) {
  const section = $(id);
  section.focus({ preventScroll: true });
  section.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

$('open-map').addEventListener('click', () => scrollToSection('globe-section'));
$('results-preview-link')?.addEventListener('click', () => {
  if (paperSort === 'paper') return;
  paperSort = 'paper';
  matrixKey = undefined;
});
$('metric-guide-link').addEventListener('click', event => {
  event.preventDefault();
  $('score-method').open = true;
  scrollToSection('score-method');
});
for (const link of document.querySelectorAll('a[href="#poster"]')) {
  link.addEventListener('click', event => {
    event.preventDefault();
    const explorerRoute = parseRoute(new URL($('nav-explorer').href).hash);
    const hash = hashFor({ ...explorerRoute, page: 'explorer', section: 'poster' });
    if (hash === location.hash) scrollToSection('poster');
    else location.hash = hash;
  });
}
$('nav-cite').addEventListener('click', event => {
  event.preventDefault();
  scrollToSection('cite');
});
$('paper-sort').addEventListener('change', event => {
  paperSort = event.target.value;
  renderPaperResults();
});
$('metric').addEventListener('change', event => {
  paperSort = 'ranking';
  changeRoute({ metric: event.target.value });
});
$('topic').addEventListener('change', event => selectTopic(event.target.value));
for (const [id, parameter] of [
  ['language', 'lang'], ['task', 'task'], ['left-model', 'left'], ['right-model', 'right'],
  ['rank-topic', 'topic'], ['rank-language', 'lang'], ['source-model', 'sourceModel'], ['map-language', 'mapLang'],
]) {
  $(id).addEventListener('change', event => changeRoute({ [parameter]: event.target.value || undefined }));
}
for (const button of document.querySelectorAll('[data-pins]')) {
  button.addEventListener('click', () => changeRoute({ pins: button.dataset.pins === 'both' ? undefined : button.dataset.pins }));
}
for (const button of document.querySelectorAll('[data-scope]')) {
  button.addEventListener('click', () => {
    const scope = button.dataset.scope;
    const route = parseRoute(location.hash);
    const evaluated = activeQuery ? queryLanguages([activeQuery]) : new Set();
    const alternate = evaluated.has('en') ? 'en' : evaluated.values().next().value;
    const lang = scope === 'benchmark' && !evaluated.has(route.lang) ? alternate ?? route.lang : route.lang;
    changeRoute({ scope: scope === 'dataset' ? scope : undefined, lang });
  });
}
const bibtex = $('citation-text');
const copyBibtex = $('copy-bibtex');
fetch(new URL(`./narrativebench.bib${assetVersion}`, import.meta.url)).then(response => {
  if (!response.ok) throw new Error('BibTeX could not load');
  return response.text();
}).then(text => {
  bibtex.textContent = text.trimEnd();
  copyBibtex.disabled = false;
}).catch(() => {
  bibtex.textContent = 'The BibTeX preview could not load.';
});
copyBibtex.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(bibtex.textContent);
    $('citation-status').textContent = 'BibTeX copied.';
  } catch {
    $('citation-status').textContent = 'Select the citation text to copy it, or download the .bib file.';
  }
});
$('retry').addEventListener('click', render);
window.addEventListener('hashchange', render);
void render();
try {
  const [{ mountGlobe }, geometry, index, queryIndex] = await Promise.all([
    import('./globe.mjs'), data('map'), data('catalog'), data('map-queries'),
  ]);
  map = mountGlobe(geometry, { topics: index.topics, languages: index.languages, queryIndex }, {
    selectTopic: id => selectTopic(id, true),
    selectQuery: (topic, query, lang) => {
      changeRoute({ topic, query, lang });
      if (matchMedia('(max-width: 850px)').matches) $('query-title').scrollIntoView({ block: 'start' });
    },
  });
  if (mapSelection) map.setSelection(mapSelection);
  $('map').classList.add('map-ready');
} catch {
  $('map-error').hidden = false;
} finally {
  $('map-loading').hidden = true;
}

void import('./language-disparities.mjs').catch(() => { $('disparity-status').textContent = 'Language charts could not load. The scores remain available in the table.'; });
