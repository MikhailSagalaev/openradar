/**
 * Order boards the collector knows. A new board is one entry here, a reader in collector.js
 * and a line in COLLECTOR_PLATFORMS on the hub; the popup builds its switches and filters
 * from this list.
 *
 * Filters are not written here. probe() reads the board's own page, so cities and fields are
 * whatever the board offers today, and tells whether the owner is signed in. filters() turns
 * that catalog into chips; none picked means everything. lists() turns the choice into pages.
 * A walk goes in this order, so the long YouDo lists do not hold the others back.
 */
const YOUDO_LIST = 'https://youdo.com/tasks-all-opened-all';
const BOARD_HELP = 'https://github.com/MikhailSagalaev/openradar/blob/main/docs/GIG_SOURCES.md#что-определяет-охват';

/** The JSON a page carries in <script id="…">, or undefined. */
function pageState(html, id) {
  const page = new DOMParser().parseFromString(html, 'text/html');
  const text = page.getElementById(id)?.textContent;
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

/** A picked field stands for itself until the owner narrows it to some of its parts. */
function narrowed(parents = [], children = [], catalog = []) {
  const whole = [];
  const parts = [];
  for (const parent of parents) {
    const own = (catalog.find(([id]) => id === parent)?.[2] ?? []).map(([id]) => id).filter((id) => children.includes(id));
    if (own.length) parts.push(...own);
    else whole.push(parent);
  }
  return { parents: whole, children: parts };
}

const BOARDS = [
  {
    id: 'yandex',
    title: 'Яндекс Услуги',
    open: 'https://uslugi.yandex.ru/cab/orders?type=new',
    signInNeeded: true,
    hint: { ru: 'Город и удалённые заказы берутся из анкеты', en: 'The city comes from the profile' },
    help: BOARD_HELP,
    probe(html, url) {
      if (/passport\.yandex/.test(url)) return { state: 'signed_out' };
      const rubrics = pageState(html, '__PRELOADED_STATE__')?.rubrics?.occupations;
      if (!rubrics) return { state: 'unknown' };
      return { state: 'signed_in', catalog: { rubrics: rubrics.map((item) => [item.id, item.name, (item.specializations ?? []).map((spec) => [spec.id, spec.name])]) } };
    },
    filters: (catalog) => [{ key: 'rubrics', title: { ru: 'Разделы', en: 'Sections' }, options: catalog?.rubrics ?? [], childKey: 'specs' }],
    lists(settings, catalog) {
      const { parents, children } = narrowed(settings.rubrics, settings.specs, catalog?.rubrics);
      const rubrics = [...parents, ...children].map((rubric) => `&rubric=${encodeURIComponent(rubric)}`).join('');
      return [`https://uslugi.yandex.ru/cab/orders?type=new${rubrics}`];
    },
    isSignIn: (url) => /passport\.yandex/.test(url),
  },
  {
    id: 'profi',
    title: 'Профи.ру',
    open: 'https://profi.ru/backoffice/n.php',
    signInNeeded: true,
    hint: { ru: 'Специальности и город задаются в анкете на Профи.ру', en: 'Specialties and city are set in the Profi.ru profile' },
    help: BOARD_HELP,
    // The sign-in page carries this key; the board does not.
    probe: (html) => ({ state: html.includes('loginHeader') ? 'signed_out' : 'signed_in' }),
    filters: () => [],
    lists: () => ['https://profi.ru/backoffice/n.php'],
    isSignIn: (_url, title) => /^Вход/.test(title),
  },
  {
    id: 'youdo',
    title: 'YouDo',
    open: YOUDO_LIST,
    signInNeeded: false,
    hint: { ru: 'Вход не нужен', en: 'No sign-in needed' },
    probe(html) {
      const dictionaries = pageState(html, '__NEXT_DATA__')?.props?.initialState?.dictionariesState;
      if (!dictionaries?.categoriesTree) return { state: 'unknown' };
      return {
        state: 'open',
        catalog: {
          categories: dictionaries.categoriesTree.map((item) => [item.code, item.name, (item.subcategories ?? []).map((sub) => [String(sub.id), sub.name])]),
          cities: (dictionaries.cities ?? []).filter((item) => item.code !== 'Other').map((item) => [item.code, item.name, item.location?.center?.latitude, item.location?.center?.longitude]),
        },
      };
    },
    filters(catalog) {
      return [
        { key: 'remote', title: { ru: 'Формат', en: 'Format' }, options: [['only', { ru: 'Только удалённые', en: 'Remote only' }]] },
        { key: 'cities', title: { ru: 'Города', en: 'Cities' }, options: (catalog?.cities ?? []).map(([code, name]) => [code, name]) },
        { key: 'categories', title: { ru: 'Направления', en: 'Fields' }, options: catalog?.categories ?? [], childKey: 'subs' },
      ];
    },
    lists(settings, catalog) {
      const shared = [];
      const whole = narrowed(settings.categories, settings.subs, catalog?.categories);
      if (whole.parents.length) shared.push(`categories=${whole.parents.join(',')}`);
      if (whole.children.length) shared.push(`sub=${whole.children.join(',')}`);
      if (settings.remote?.includes('only')) return [`${YOUDO_LIST}#${['virtual=1', ...shared].join('&')}`];
      const cities = (catalog?.cities ?? []).filter(([code]) => settings.cities?.includes(code));
      if (!cities.length) return [`${YOUDO_LIST}#${shared.join('&')}`];
      return cities.map(([, , lat, lng]) => `${YOUDO_LIST}#${[`lat=${lat}`, `lng=${lng}`, 'radius=30', ...shared].join('&')}`);
    },
    isSignIn: () => false,
  },
];
