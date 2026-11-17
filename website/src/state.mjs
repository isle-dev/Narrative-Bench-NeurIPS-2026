const DEFAULT_TASK = 'DP';
const EXPLORER_PARAMS = ['topic', 'lang', 'query', 'task', 'left', 'right', 'pins', 'scope', 'mapLang'];

export function parseRoute(hash) {
  const [name, search] = hash.slice(1).split('?');
  const params = new URLSearchParams(search);
  const route = { page: name === 'leaderboard' ? 'leaderboard' : 'explorer' };
  const keys = name === 'leaderboard' ? ['metric', 'topic', 'lang', 'sourceModel'] : name === 'explore' ? EXPLORER_PARAMS : [];
  for (const key of keys) {
    if (params.has(key)) route[key] = params.get(key);
  }
  return route;
}

function inScope(query, lang, scope) {
  return Boolean(query.translations[lang] && (scope === 'dataset' || Object.values(query.cases[lang] ?? {}).some(Boolean)));
}

export function queryScrollState(rows, height, scrollHeight, scrollTop) {
  const max = Math.max(0, scrollHeight - height);
  const position = Math.max(0, Math.min(scrollTop, max));
  const first = rows.findIndex(row => row.offsetTop + row.offsetHeight > position) + 1;
  const last = rows.findLastIndex(row => row.offsetTop < position + height) + 1;
  return { first, last, max, position, atEnd: max - position < 1 };
}

export function queryChoices(queries, lang, scope) {
  return queries.filter(query => inScope(query, lang, scope));
}

export function queryLanguages(queries, scope) {
  return new Set(queries.flatMap(query => Object.keys(query.translations).filter(lang => inScope(query, lang, scope))));
}

export function resolveSelection(queries, route) {
  const languages = queryLanguages(queries, route.scope);
  const lang = languages.has(route.lang) ? route.lang : languages.has('en') ? 'en' : languages.values().next().value;
  const choices = queryChoices(queries, lang, route.scope);
  const query = choices.find(item => item.id === route.query) ?? choices[0];
  const cases = query?.cases[lang] ?? {};
  const task = Object.hasOwn(cases, route.task) ? route.task : Object.hasOwn(cases, DEFAULT_TASK) ? DEFAULT_TASK : Object.keys(cases)[0];
  return { lang, choices, query, task, caseId: cases[task] ?? null };
}

export function rankedRows(models, metric) {
  const rows = models.map(model => ({ ...model, value: Math.round(model.scores[metric] * 1000) }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  return rows.map((row, index) => ({
    ...row,
    rank: index > 0 && row.value === rows[index - 1].value
      ? rows.findIndex(other => other.value === row.value) + 1
      : index + 1,
  }));
}

export function sliceRanking(catalog, slices, topic, lang, metric) {
  if (topic === 'all' && lang === 'all') {
    return { rows: rankedRows(catalog.models, metric), counts: catalog.counts.tasks };
  }
  const slice = slices?.[topic]?.[lang];
  if (!slice?.counts[metric]) return null;
  const models = catalog.models.map(model => ({ ...model, scores: slice.scores[model.id] }));
  return { rows: rankedRows(models, metric), counts: slice.counts };
}
