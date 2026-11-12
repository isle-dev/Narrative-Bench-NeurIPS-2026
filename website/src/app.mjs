import { formatAnswer } from './answer-format.mjs';
import { mountLeaderboardPlot } from './leaderboard.mjs';
import { parseRoute, queryLanguages, resolveSelection, sliceRanking } from './state.mjs';

const TASKS = {
  NI: ['Narrative Inclusion', 'NI F1'],
  NE: ['Narrative Exclusion', 'NE F1'],
  MNI: ['Missing Narrative Identification', 'MNI recall'],
  BP: ['Baseline Prompt', 'BP recall'],
  DP: ['Diverse Prompt', 'DP recall'],
};
const LANGUAGE_STATUS = {
  same: 'Passed query-language check',
  different: 'Different language',
  mixed: 'Mixed languages',
  no_answer: 'No answer',
  unknown: 'Language uncertain',
};
const DEFAULT_TOPIC = 'gaza';
const DEFAULT_MODELS = ['gemini', 'gpt-5.4-mini'];
const $ = id => document.getElementById(id);
const number = new Intl.NumberFormat('en');
const percent = value => `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
const cache = new Map();
const currentResponses = new WeakMap();
const plotRanking = mountLeaderboardPlot($('rank-plot'), $('ranking-status'));
let catalog;
let map;
let mapSelection;
let activeQuery;
let renderId = 0;
let lastPage;
let queryListKey;
let loadedCase;

function data(path) {
  if (!cache.has(path)) {
    const request = fetch(new URL(`./data/${path}.json`, import.meta.url))
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
  const hash = hashFor({ ...parseRoute(location.hash), ...changes });
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

async function renderLeaderboard(route, run) {
  const metric = Object.hasOwn(TASKS, route.metric) ? route.metric : 'NI';
  const topics = sortedTopics();
  const topic = topics.some(item => item.id === route.topic) ? route.topic : 'all';
  const lang = Object.hasOwn(catalog.languages, route.lang) ? route.lang : 'all';
  const entries = Object.entries(TASKS);
  options($('metric'), entries.map(([id, [label, short]]) => [id, `${label} (${short})`]), metric);
  options($('rank-topic'), [['all', 'All topics'], ...topics.map(item => [item.id, item.label])], topic);
  options($('rank-language'), [['all', 'All query languages'], ...sortedLanguages()], lang);
  const hash = hashFor({
    page: 'leaderboard', metric: metric === 'NI' ? undefined : metric,
    topic: topic === 'all' ? undefined : topic, lang: lang === 'all' ? undefined : lang,
  });
  history.replaceState(null, '', hash);
  $('nav-leaderboard').href = hash;
  $('score-note').hidden = true;
  $('table-scroll').hidden = true;
  plotRanking.clear('Loading scores…');

  let slices;
  if (topic !== 'all' || lang !== 'all') {
    try {
      slices = await data('rankings');
    } catch (error) {
      if (run === renderId) plotRanking.clear('Filtered scores could not load.');
      throw error;
    }
  }
  if (run !== renderId) return;
  const selection = sliceRanking(catalog, slices, topic, lang, metric);
  if (!selection) {
    plotRanking.clear('No evaluated cases for these filters.');
    return;
  }
  const { rows: ranking, counts } = selection;
  const head = element('tr');
  for (const name of ['Rank', 'Model configuration']) {
    const cell = element('th', name);
    cell.scope = 'col';
    head.append(cell);
  }
  for (const [id, [name, short]] of entries) {
    const cell = element('th', short, 'number');
    cell.scope = 'col';
    cell.title = name;
    if (id === metric) cell.setAttribute('aria-sort', 'descending');
    head.append(cell);
  }
  $('score-head').replaceChildren(head);
  const rows = ranking.map(model => {
    const row = element('tr');
    const name = element('th', model.name);
    name.scope = 'row';
    row.append(element('td', String(model.rank)), name);
    for (const [id] of entries) {
      row.append(element('td', counts[id] ? percent(model.scores[id]) : '—', id === metric ? 'number active-metric' : 'number'));
    }
    return row;
  });
  $('score-rows').replaceChildren(...rows);
  const cases = counts[metric];
  $('score-note').textContent =
    `${number.format(ranking.length)} model configurations · ${number.format(cases)} evaluated ${cases === 1 ? 'case' : 'cases'} per model for ${TASKS[metric][0]}`;
  $('score-note').hidden = false;
  $('table-scroll').hidden = false;
  plotRanking(ranking, TASKS[metric][1], cases);
}

function renderQueries(topic, selection, scope) {
  const { lang, query, choices } = selection;
  const list = $('queries');
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
  list.hidden = !choices.length;
  const active = [...list.children].find(button => button.dataset.query === query?.id);
  if (active && document.activeElement !== active) {
    const top = active.offsetTop;
    if (top < list.scrollTop || top + active.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top;
  }
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

function renderCaseDetails(item, sources) {
  if (loadedCase === item.id) return;
  const context = $('case-context');
  context.replaceChildren();
  for (const [label, value] of [
    ['System instruction', item.instruction], ['Query context', item.context],
    ['Fixed prior answer', item.priorAnswer], ['Follow-up instruction', item.followup],
  ]) {
    if (!value) continue;
    const text = element('p', value);
    text.dir = 'auto';
    context.append(element('h3', label), text);
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
  $('case-sources').replaceChildren(element('h3', 'Articles supplied to the models'), list);
  loadedCase = item.id;
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
    $('queries').hidden = true;
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
  options($('task'), tasks.map(([id, [label]]) => [id, label]), task);
  if (!caseId) $('task').append(new Option('No recorded evaluation', ''));

  const modelIds = new Set(catalog.models.map(model => model.id));
  const left = modelIds.has(route.left) ? route.left : DEFAULT_MODELS[0];
  const right = modelIds.has(route.right) ? route.right : DEFAULT_MODELS[1];
  const resolved = {
    page: 'explorer', topic: topic.id, lang, query: query?.id, task, left, right,
    pins: mode === 'both' ? undefined : mode, scope: scope === 'benchmark' ? undefined : scope, mapLang,
  };
  const hash = hashFor(resolved);
  history.replaceState(null, '', hash);
  $('nav-explorer').href = hash;

  if (caseId !== loadedCase) {
    $('answer-grid').hidden = true;
    $('case-details').hidden = true;
    setAnswerStatus(caseId ? 'Loading recorded answers…' : '');
  }
  if (!caseId) {
    showDatasetAnswerStatus(query, lang);
    return;
  }
  let item;
  let sources;
  try {
    [item, sources] = await Promise.all([data(`cases/${caseId}`), data('sources')]);
  } catch {
    if (renderId === run) setAnswerStatus('The recorded answers could not load.', true);
    return;
  }
  if (renderId !== run) return;

  $('answer-question').textContent = item.query;
  renderCaseDetails(item, sources);
  $('case-details').hidden = false;
  const models = [...catalog.models].sort((a, b) => a.name.localeCompare(b.name))
    .map(model => [model.id, model.name]);
  options($('left-model'), models, left);
  options($('right-model'), models, right);
  renderAnswer($('left-answer'), item.responses[left], lang);
  renderAnswer($('right-answer'), item.responses[right], lang);
  setAnswerStatus('');
  $('answer-grid').hidden = false;
}

async function render() {
  const run = ++renderId;
  const route = parseRoute(location.hash);
  const explorer = route.page === 'explorer';
  $('explorer').hidden = !explorer;
  $('leaderboard').hidden = explorer;
  $('app-error').hidden = true;
  const active = $(explorer ? 'nav-explorer' : 'nav-leaderboard');
  $(explorer ? 'nav-leaderboard' : 'nav-explorer').removeAttribute('aria-current');
  active.setAttribute('aria-current', 'page');
  document.title = explorer ? 'NarrativeBench Explorer' : 'NarrativeBench Leaderboard';
  if (lastPage && lastPage !== route.page) {
    window.scrollTo(0, 0);
    $('main').focus({ preventScroll: true });
  }
  lastPage = route.page;
  try {
    catalog ??= await data('catalog');
    if (run !== renderId) return;
    if (explorer) await renderExplorer(route, run);
    else await renderLeaderboard(route, run);
  } catch {
    if (run === renderId) $('app-error').hidden = false;
  }
}

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  $('main').focus();
});
$('topic').addEventListener('change', event => selectTopic(event.target.value));
for (const [id, parameter] of [
  ['language', 'lang'], ['task', 'task'], ['left-model', 'left'], ['right-model', 'right'], ['metric', 'metric'],
  ['rank-topic', 'topic'], ['rank-language', 'lang'], ['map-language', 'mapLang'],
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
fetch(new URL('./narrativebench.bib', import.meta.url)).then(response => {
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
