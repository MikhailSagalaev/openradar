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
    id: 'kwork-all',
    kind: 'kwork',
    title: 'Kwork — Все заказы',
    description: 'Биржа Kwork: новые заказы всех разделов — разработка, дизайн, тексты, реклама, видео (нативный парсер)',
    config: {},
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
    title: 'We Work Remotely — Все вакансии',
    description: 'Международный RSS-фид удалённых вакансий всех направлений',
    config: {
      url: 'https://weworkremotely.com/remote-jobs.rss',
    },
  },
  {
    id: 'trudvsem-remote',
    kind: 'trudvsem',
    title: 'Работа России — Удалённая работа',
    description: 'Официальный Open API портала «Работа России» (Минтруд РФ) — удалённые вакансии всех профессий',
    config: {
      url: 'https://opendata.trudvsem.ru/api/v1/vacancies',
      text: 'удаленная',
      // The API's full-text search also matches «удалению», «не удаленно»: keep real remote work.
      includeKeywords: ['удаленно', 'удалённо', 'удаленная работа', 'удалённая работа', 'удаленный формат', 'удалённый формат', 'дистанционн'],
      excludeKeywords: ['не удаленно', 'не удалённо', 'без удаленки', 'без удалёнки'],
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
    id: 'hh-remote-project',
    kind: 'rss',
    title: 'HeadHunter — Удалённая проектная работа',
    description: 'RSS hh.ru: удалённая проектная работа всех профессий — тексты, дизайн, аналитика, маркетинг, разработка',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?schedule=remote&employment=project&order_by=publication_time',
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
    id: 'jobicy',
    kind: 'rss',
    title: 'Jobicy — Все вакансии',
    description: 'RSS-фид удалённых вакансий всех направлений с Jobicy',
    config: {
      url: 'https://jobicy.com/feed/job_feed',
    },
  },
  {
    id: 'remoteok',
    kind: 'remoteok',
    title: 'RemoteOK — Все вакансии',
    description: 'Официальный публичный JSON API RemoteOK — международные удалённые вакансии всех направлений',
    config: {
      url: 'https://remoteok.com/api',
      limit: 20,
    },
  },
  {
    id: 'remotive',
    kind: 'remotive',
    title: 'Remotive — Все вакансии',
    description: 'Официальный открытый API Remotive — международные удалённые вакансии всех направлений',
    config: {
      url: 'https://remotive.com/api/remote-jobs',
      limit: 50,
    },
  },
  {
    id: 'arbeitnow',
    kind: 'arbeitnow',
    title: 'Arbeitnow — Вакансии Германии и ЕС',
    description: 'Официальный открытый API Arbeitnow — вакансии Германии и ЕС, в основном на английском',
    config: {
      url: 'https://www.arbeitnow.com/api/job-board-api',
      limit: 50,
    },
  },
  {
    id: 'hn-hiring',
    kind: 'hn',
    title: 'Hacker News — Who is hiring',
    description: 'Комментарии месячного треда «Ask HN: Who is hiring?» — вакансии стартапов, в основном удалённые',
    config: {
      url: 'https://hn.algolia.com/api/v1',
      limit: 100,
    },
  },
  {
    id: 'himalayas',
    kind: 'rss',
    title: 'Himalayas — Все вакансии',
    description: 'RSS-фид международной доски удалённых вакансий Himalayas',
    config: {
      url: 'https://himalayas.app/jobs/rss',
    },
  },
  {
    id: 'jobspresso',
    kind: 'rss',
    title: 'Jobspresso — Отобранные вакансии',
    description: 'RSS-фид Jobspresso — отобранные удалённые вакансии международного рынка',
    config: {
      url: 'https://jobspresso.co/feed/',
    },
  },
  {
    id: 'cryptojobslist',
    kind: 'rss',
    title: 'CryptoJobsList — Web3 вакансии',
    description: 'RSS-фид CryptoJobsList — вакансии web3, крипто и блокчейн-компаний',
    config: {
      url: 'https://api.cryptojobslist.com/jobs.rss',
    },
  },
  {
    id: 'remoteworker-uk',
    kind: 'rss',
    title: 'RemoteWorker UK — Все вакансии',
    description: 'RSS-фид RemoteWorker — удалённые вакансии Великобритании и Европы',
    config: {
      url: 'https://remoteworker.co.uk/feeds/all.xml',
    },
  },
];

