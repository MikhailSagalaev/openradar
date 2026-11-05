/**
 * Order boards the collector knows. A new board is one entry here, a reader in collector.js
 * and a line in COLLECTOR_PLATFORMS on the hub; the popup builds its switches and filters
 * from this list, so nobody pastes addresses.
 *
 * filters: chips the owner picks; none picked means «everything». lists(settings) turns the
 * choice into the pages a walk opens.
 */
const YOUDO_CITIES = {
  moscow: ['Москва', 'Moscow', 55.75, 37.62],
  spb: ['Санкт-Петербург', 'Saint Petersburg', 59.93, 30.31],
  novosibirsk: ['Новосибирск', 'Novosibirsk', 55.03, 82.92],
  ekb: ['Екатеринбург', 'Yekaterinburg', 56.84, 60.6],
  kazan: ['Казань', 'Kazan', 55.79, 49.12],
  nn: ['Нижний Новгород', 'Nizhny Novgorod', 56.33, 44],
  krasnodar: ['Краснодар', 'Krasnodar', 45.04, 38.98],
  sochi: ['Сочи', 'Sochi', 43.6, 39.73],
  stavropol: ['Ставрополь', 'Stavropol', 45.04, 41.97],
};

const YOUDO_LIST = 'https://youdo.com/tasks-all-opened-all';

const BOARDS = [
  {
    id: 'youdo',
    title: 'YouDo',
    origin: 'https://youdo.com/*',
    open: YOUDO_LIST,
    hint: { ru: 'Вся лента, вход не нужен', en: 'The whole feed, no sign-in needed' },
    filters: [
      { key: 'remote', title: { ru: 'Формат', en: 'Format' }, options: { only: { ru: 'Только удалённые', en: 'Remote only' } } },
      { key: 'cities', title: { ru: 'Города', en: 'Cities' }, options: Object.fromEntries(Object.entries(YOUDO_CITIES).map(([id, [ru, en]]) => [id, { ru, en }])) },
      {
        key: 'categories',
        title: { ru: 'Направления', en: 'Fields' },
        options: {
          webdevelopment: { ru: 'Разработка', en: 'Development' },
          design: { ru: 'Дизайн', en: 'Design' },
          virtualassistant: { ru: 'Помощник', en: 'Assistant' },
          computerhelp: { ru: 'Компьютеры', en: 'Computers' },
          teaching: { ru: 'Обучение', en: 'Teaching' },
        },
      },
    ],
    lists(settings) {
      const shared = settings.categories?.length ? [`categories=${settings.categories.join(',')}`] : [];
      if (settings.remote?.includes('only')) return [`${YOUDO_LIST}#${['virtual=1', ...shared].join('&')}`];
      const cities = (settings.cities ?? []).filter((id) => YOUDO_CITIES[id]);
      if (!cities.length) return [`${YOUDO_LIST}#${shared.join('&')}`];
      return cities.map((id) => `${YOUDO_LIST}#${[`lat=${YOUDO_CITIES[id][2]}`, `lng=${YOUDO_CITIES[id][3]}`, 'radius=30', ...shared].join('&')}`);
    },
    isSignIn: () => false,
  },
  {
    id: 'yandex',
    title: 'Яндекс Услуги',
    origin: 'https://uslugi.yandex.ru/*',
    open: 'https://uslugi.yandex.ru/cab/orders?type=new',
    hint: { ru: 'Нужен вход. Город берётся из настроек аккаунта', en: 'Needs sign-in. The city comes from the account' },
    filters: [
      {
        key: 'rubrics',
        title: { ru: 'Рубрики', en: 'Rubrics' },
        options: {
          '/komp_utery-i-it/sajty-pod-kluc': { ru: 'Сайты', en: 'Websites' },
          '/komp_utery-i-it/drugoe': { ru: 'IT, другое', en: 'IT, other' },
          '/dizajnery/veb-dizajner': { ru: 'Веб-дизайн', en: 'Web design' },
          '/dizajnery/ux/ui-dizajner': { ru: 'UX/UI', en: 'UX/UI' },
        },
      },
    ],
    lists(settings) {
      const rubrics = (settings.rubrics ?? []).map((rubric) => `&rubric=${encodeURIComponent(rubric)}`).join('');
      return [`https://uslugi.yandex.ru/cab/orders?type=new${rubrics}`];
    },
    isSignIn: (url) => /passport\.yandex/.test(url),
  },
  {
    id: 'profi',
    title: 'Профи.ру',
    origin: 'https://profi.ru/*',
    open: 'https://profi.ru/backoffice/n.php',
    hint: { ru: 'Нужен вход. Специальности и город берутся из анкеты', en: 'Needs sign-in. Specialties and city come from the profile' },
    filters: [],
    lists: () => ['https://profi.ru/backoffice/n.php'],
    isSignIn: (_url, title) => /^Вход/.test(title),
  },
];
