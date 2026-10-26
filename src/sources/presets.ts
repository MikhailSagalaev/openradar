import type { SourceConfig, SourceKind } from '../core/types.ts';

export interface SourcePreset {
  id: string;
  kind: SourceKind;
  title: string;
  description: string;
  config: SourceConfig;
}

export const SOURCE_PRESETS: SourcePreset[] = [
  {
    id: 'fl-all',
    kind: 'rss',
    title: 'FL.ru — Все заказы',
    description: 'Официальный RSS-фид всех новых проектов и заказов биржи FL.ru',
    config: {
      url: 'https://www.fl.ru/rss/all.xml',
    },
  },
  {
    id: 'habr-career',
    kind: 'rss',
    title: 'Хабр Карьера — Вакансии и заказы',
    description: 'Официальный RSS-фид удаленной проектной работы и вакансий Хабр Карьеры',
    config: {
      url: 'https://career.habr.com/vacancies/rss',
    },
  },
  {
    id: 'kwork-dev',
    kind: 'kwork',
    title: 'Kwork — Разработка и IT',
    description: 'Биржа Kwork: заказы на бирже в категории «Разработка и IT» (нативный парсер)',
    config: {
      categoryId: '11',
    },
  },
  {
    id: 'tg-freelance',
    kind: 'telegram',
    title: 'Telegram — @freelance_orders',
    description: 'Публичный Telegram-канал с заказами фриланса (чтение через t.me/s/)',
    config: {
      channel: 'freelance_orders',
    },
  },
  {
    id: 'weworkremotely',
    kind: 'rss',
    title: 'We Work Remotely — Dev Projects',
    description: 'Международный RSS-фид удаленных контрактов и задач по программированию',
    config: {
      url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss',
    },
  },
  {
    id: 'trudvsem-it',
    kind: 'trudvsem',
    title: 'Работа России — IT-вакансии',
    description: 'Официальный Open API портала «Работа России» (Минтруд РФ) — вакансии в сфере IT и разработки',
    config: {
      url: 'https://opendata.trudvsem.ru/api/v1/vacancies',
      text: 'разработчик',
    },
  },
  {
    id: 'hh-it',
    kind: 'rss',
    title: 'HeadHunter — IT-вакансии',
    description: 'RSS поиска hh.ru по IT-вакансиям. В отличие от Open API, работает и с IP дата-центров',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?text=%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA&professional_role=96&order_by=publication_time',
    },
  },
  {
    id: 'freelancehunt',
    kind: 'rss',
    title: 'Freelancehunt — Все проекты',
    description: 'Официальный RSS-фид открытых проектов биржи Freelancehunt',
    config: {
      url: 'https://freelancehunt.com/projects.rss',
    },
  },
  {
    id: 'jobicy-dev',
    kind: 'rss',
    title: 'Jobicy — Remote Dev Jobs',
    description: 'RSS-фид удалённых вакансий в разработке с Jobicy',
    config: {
      url: 'https://jobicy.com/feed/job_feed?job_categories=dev',
    },
  },
  {
    id: 'remoteok-dev',
    kind: 'remoteok',
    title: 'RemoteOK — Remote Jobs',
    description: 'Официальный публичный JSON API RemoteOK — международные удаленные вакансии',
    config: {
      url: 'https://remoteok.com/api',
      tag: 'dev',
      limit: 20,
    },
  },
];

