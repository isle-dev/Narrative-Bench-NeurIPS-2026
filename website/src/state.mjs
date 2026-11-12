const DEFAULT_TASK = 'DP';
const EXPLORER_PARAMS = ['topic', 'lang', 'query', 'task', 'left', 'right'];

export function parseRoute(hash) {
  const [name, search] = hash.slice(1).split('?');
  const params = new URLSearchParams(search);
  const route = { page: name === 'leaderboard' ? 'leaderboard' : 'explorer' };
  const keys = name === 'leaderboard' ? ['metric', 'topic', 'lang'] : name === 'explore' ? EXPLORER_PARAMS : [];
  for (const key of keys) {
    if (params.has(key)) route[key] = params.get(key);
  }
  return route;
}

function hasEvaluation(query, lang) {
  return Boolean(query.translations[lang] && Object.values(query.cases[lang] ?? {}).some(Boolean));
}

export function queryChoices(queries, lang) {
  return queries.filter(query => hasEvaluation(query, lang));
}

export function evaluatedLanguages(queries) {
  return new Set(queries.flatMap(query => Object.keys(query.cases).filter(lang => hasEvaluation(query, lang))));
}

export function resolveSelection(queries, route) {
  const languages = evaluatedLanguages(queries);
  const lang = languages.has(route.lang) ? route.lang : languages.has('en') ? 'en' : languages.values().next().value;
  const choices = queryChoices(queries, lang);
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
