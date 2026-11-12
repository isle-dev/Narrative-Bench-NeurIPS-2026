const DEFAULT_TASK = 'DP';
const EXPLORER_PARAMS = ['topic', 'lang', 'query', 'task', 'left', 'right'];

export function parseRoute(hash) {
  const [name, search] = hash.slice(1).split('?');
  const params = new URLSearchParams(search);
  if (name === 'leaderboard') {
    return params.has('metric') ? { page: 'leaderboard', metric: params.get('metric') } : { page: 'leaderboard' };
  }
  const route = { page: 'explorer' };
  if (name === 'explore') {
    for (const key of EXPLORER_PARAMS) {
      if (params.has(key)) route[key] = params.get(key);
    }
  }
  return route;
}

export function queryChoices(queries, lang) {
  return queries.filter(query => query.translations[lang])
    .sort((a, b) => Number(Boolean(b.cases[lang])) - Number(Boolean(a.cases[lang])));
}

export function resolveSelection(queries, route) {
  const languages = new Set(queries.flatMap(query => Object.keys(query.translations)));
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
