import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

export type SupportedLang = 'ru' | 'en';

export interface Translations {
  lang: SupportedLang;
  brandSubtitle: string;
  navLeads: string;
  navSources: string;
  submitByUrl: string;
  addSource: string;
  pollAll: string;
  polling: string;
  signIn: string;
  signOut: string;
  all: string;
  gigs: string;
  jobs: string;
  // Statuses
  statusAll: string;
  statusNew: string;
  statusInteresting: string;
  statusApplied: string;
  statusInWork: string;
  statusRejected: string;
  statusDelivered: string;
  statusFailed: string;
  // Metrics
  metricLeadsFound: string;
  metricActiveSources: string;
  metricNewToday: string;
  metricApplied: string;
  // Search
  searchPlaceholder: string;
  searchBtn: string;
  // Empty
  emptyTitle: string;
  emptyDesc: string;
  // Lead page
  backToLeads: string;
  openOriginal: string;
  copyText: string;
  copied: string;
  copyFailed: string;
  leadDescription: string;
  details: string;
  type: string;
  gigType: string;
  jobType: string;
  community: string;
  votes: string;
  source: string;
  category: string;
  location: string;
  remote: string;
  format: string;
  remoteFormat: string;
  onsiteFormat: string;
  budget: string;
  score: string;
  published: string;
  added: string;
  author: string;
  skills: string;
  aiAnalysis: string;
  aiMatch: string;
  urgency: string;
  stack: string;
  scoreReasons: string;
  cautionFlag: string;
  // Signals
  signalHighScore: string;
  signalMarketBudget: string;
  signalDirectEmployer: string;
  signalPossibleScam: string;
  // Voting
  useful: string;
  junk: string;
  scam: string;
  closed: string;
  signInToVote: string;
  voteAuthTitle: string;
  voteAuthDesc: string;
  signInGithub: string;
  cancel: string;
  // Footer
  footerDesc: string;
  footerLicense: string;
  licenseLink: string;
  rssFeed: string;
  s3Delta: string;
  systemStatus: string;
  extensionGuide: string;
  // Submit page
  submitTitle: string;
  submitSubtitle: string;
  urlPlaceholder: string;
  fetchData: string;
  fetching: string;
  publish: string;
  publishing: string;
  previewHeader: string;
  titleLabel: string;
  authorLabel: string;
  categoryLabel: string;
  locationLabel: string;
  isRemoteLabel: string;
  budgetLabel: string;
  currencyLabel: string;
  skillsLabel: string;
  descLabel: string;
  submitGuestTitle: string;
  submitGuestDesc: string;
  noOAuthConfig: string;
  // Sources page
  sourcesTitle: string;
  protocol: string;
  sourceName: string;
  urlFeed: string;
  channelTelegram: string;
  createSource: string;
  runs: string;
  // Relatives
  justNow: string;
  minsAgo: (mins: number) => string;
  hoursAgo: (hours: number) => string;
  daysAgo: (days: number) => string;
}

export const RU: Translations = {
  lang: 'ru',
  brandSubtitle: 'OpenRadar — открытый децентрализованный агрегатор заказов и вакансий.',
  navLeads: 'Заказы',
  navSources: 'Источники',
  submitByUrl: 'Добавить по ссылке',
  addSource: 'Добавить источник',
  pollAll: 'Опросить все',
  polling: 'Опрос...',
  signIn: 'Войти',
  signOut: 'Выйти',
  all: 'Все',
  gigs: 'Заказы',
  jobs: 'Вакансии',
  statusAll: 'все',
  statusNew: 'новый',
  statusInteresting: 'интересно',
  statusApplied: 'откликнулся',
  statusInWork: 'в работе',
  statusRejected: 'отклонён',
  statusDelivered: 'доставлен',
  statusFailed: 'ошибка',
  metricLeadsFound: 'заказов и вакансий',
  metricActiveSources: 'источников',
  metricNewToday: 'новых сегодня',
  metricApplied: 'откликов',
  searchPlaceholder: 'Поиск по задачам, навыкам, стеку... (нажмите / для фокуса)',
  searchBtn: 'Найти',
  emptyTitle: 'Ничего не найдено',
  emptyDesc: 'Попробуйте изменить запрос или проверить другие фильтры.',
  backToLeads: '← Все заказы',
  openOriginal: 'Открыть оригинал ↗',
  copyText: 'Копировать текст',
  copied: 'Скопировано',
  copyFailed: 'Не удалось',
  leadDescription: 'Текст заказа',
  details: 'Детали',
  type: 'Тип',
  gigType: 'Заказ',
  jobType: 'Вакансия',
  community: 'Сообщество',
  votes: 'Голоса',
  source: 'Источник',
  category: 'Категория',
  location: 'Локация',
  remote: 'Удалённо',
  format: 'Формат',
  remoteFormat: 'Удалённая работа',
  onsiteFormat: 'На объекте / Офлайн',
  budget: 'Бюджет',
  score: 'Скор',
  published: 'Опубликован',
  added: 'Добавлен',
  author: 'Автор',
  skills: 'Навыки и стек',
  aiAnalysis: 'AI Анализ заказа',
  aiMatch: 'совпадение',
  urgency: 'Срочность',
  stack: 'Стек',
  scoreReasons: 'Почему так',
  cautionFlag: 'Внимание: участники сообщества отметили этот заказ как подозрительный. Тщательно проверяйте заказчика перед началом работы.',
  signalHighScore: 'высокий рейтинг',
  signalMarketBudget: 'вилка в рынке',
  signalDirectEmployer: 'прямой заказчик',
  signalPossibleScam: 'возможен скам',
  useful: 'Полезно',
  junk: 'Мусор',
  scam: 'Скам',
  closed: 'Закрыто',
  signInToVote: 'Войти через GitHub, чтобы голосовать',
  voteAuthTitle: 'Авторизация для голосования',
  voteAuthDesc: 'Чтобы исключить накрутку и спам, оценивать заказы и помечать скам могут только авторизованные через GitHub участники.',
  signInGithub: 'Войти через GitHub',
  cancel: 'Отмена',
  footerDesc: 'OpenRadar — открытый децентрализованный агрегатор заказов и вакансий.',
  footerLicense: 'Свободное программное обеспечение. Лицензия Apache 2.0.',
  licenseLink: 'Лицензия Apache 2.0',
  rssFeed: 'RSS фид',
  s3Delta: 'S3 Delta Stream',
  systemStatus: 'Статус системы',
  extensionGuide: 'Расширение для браузера',
  submitTitle: 'Добавить по ссылке',
  submitSubtitle: 'Автоматический сбор описания вакансии или заказа через разметку страницы',
  urlPlaceholder: 'Вставьте ссылку на вакансию или заказ (например, hh.ru, habr.com, vc.ru...)',
  fetchData: 'Получить данные',
  fetching: 'Получение данных...',
  publish: 'Опубликовать в OpenRadar',
  publishing: 'Публикация...',
  previewHeader: 'Предпросмотр данных',
  titleLabel: 'Заголовок',
  authorLabel: 'Компания / Автор',
  categoryLabel: 'Категория',
  locationLabel: 'Город / Локация',
  isRemoteLabel: 'Удалённая работа',
  budgetLabel: 'Бюджет / Вилка',
  currencyLabel: 'Валюта',
  skillsLabel: 'Навыки и стек',
  descLabel: 'Текст / Описание',
  submitGuestTitle: 'Добавление заказов — для участников',
  submitGuestDesc: 'Чтобы база OpenRadar оставалась доверенной, добавлять лиды могут только зарегистрированные участники. Войдите через GitHub — это займёт секунды.',
  noOAuthConfig: 'На этом сервере не настроен GitHub OAuth.',
  sourcesTitle: 'Источники данных',
  protocol: 'Технологический протокол',
  sourceName: 'Название источника',
  urlFeed: 'URL фида',
  channelTelegram: 'Канал Telegram',
  createSource: 'Создать источник',
  runs: 'Запуски',
  justNow: 'только что',
  minsAgo: (mins: number) => `${mins} мин назад`,
  hoursAgo: (hours: number) => `${hours} ч назад`,
  daysAgo: (days: number) => `${days} дн назад`,
};

export const EN: Translations = {
  lang: 'en',
  brandSubtitle: 'OpenRadar — open-source decentralized aggregator for jobs and freelance gigs.',
  navLeads: 'Leads',
  navSources: 'Sources',
  submitByUrl: 'Submit by URL',
  addSource: 'Add Source',
  pollAll: 'Poll all',
  polling: 'Polling...',
  signIn: 'Sign in',
  signOut: 'Sign out',
  all: 'All',
  gigs: 'Gigs',
  jobs: 'Jobs',
  statusAll: 'all',
  statusNew: 'new',
  statusInteresting: 'interesting',
  statusApplied: 'applied',
  statusInWork: 'in work',
  statusRejected: 'rejected',
  statusDelivered: 'delivered',
  statusFailed: 'failed',
  metricLeadsFound: 'leads found',
  metricActiveSources: 'active sources',
  metricNewToday: 'new today',
  metricApplied: 'applied',
  searchPlaceholder: 'Search leads, skills, tech stack... (press / to focus)',
  searchBtn: 'Search',
  emptyTitle: 'No leads found',
  emptyDesc: 'Try adjusting your search query or switching filters.',
  backToLeads: '← All leads',
  openOriginal: 'Open original ↗',
  copyText: 'Copy text',
  copied: 'Copied',
  copyFailed: 'Failed',
  leadDescription: 'Description',
  details: 'Details',
  type: 'Type',
  gigType: 'Gig',
  jobType: 'Job',
  community: 'Community',
  votes: 'Votes',
  source: 'Source',
  category: 'Category',
  location: 'Location',
  remote: 'Remote',
  format: 'Format',
  remoteFormat: 'Remote work',
  onsiteFormat: 'On-site / Offline',
  budget: 'Budget',
  score: 'Score',
  published: 'Published',
  added: 'Added',
  author: 'Author',
  skills: 'Skills & stack',
  aiAnalysis: 'AI Analysis',
  aiMatch: 'match',
  urgency: 'Urgency',
  stack: 'Stack',
  scoreReasons: 'Score breakdown',
  cautionFlag: 'Caution: community members flagged this lead as suspicious. Verify the client carefully before proceeding.',
  signalHighScore: 'high score',
  signalMarketBudget: 'market budget',
  signalDirectEmployer: 'direct employer',
  signalPossibleScam: 'possible scam',
  useful: 'Useful',
  junk: 'Junk',
  scam: 'Scam',
  closed: 'Closed',
  signInToVote: 'Sign in via GitHub to vote',
  voteAuthTitle: 'Sign in to vote',
  voteAuthDesc: 'To prevent manipulation and spam, voting and scam reporting requires signing in with GitHub.',
  signInGithub: 'Sign in with GitHub',
  cancel: 'Cancel',
  footerDesc: 'OpenRadar — open-source decentralized aggregator for jobs and freelance gigs.',
  footerLicense: 'Free and open-source software. Apache 2.0 License.',
  licenseLink: 'Apache 2.0 License',
  rssFeed: 'RSS feed',
  s3Delta: 'S3 Delta Stream',
  systemStatus: 'System status',
  extensionGuide: 'Browser Extension',
  submitTitle: 'Submit by URL',
  submitSubtitle: 'Automated extraction of job or gig details using page schema',
  urlPlaceholder: 'Paste link to vacancy or order (e.g. hh.ru, habr.com, vc.ru...)',
  fetchData: 'Fetch data',
  fetching: 'Fetching data...',
  publish: 'Publish to OpenRadar',
  publishing: 'Publishing...',
  previewHeader: 'Data preview',
  titleLabel: 'Title',
  authorLabel: 'Company / Author',
  categoryLabel: 'Category',
  locationLabel: 'City / Location',
  isRemoteLabel: 'Remote work',
  budgetLabel: 'Budget / Range',
  currencyLabel: 'Currency',
  skillsLabel: 'Skills & stack',
  descLabel: 'Text / Description',
  submitGuestTitle: 'Adding leads is for registered members',
  submitGuestDesc: 'To ensure high quality data, only authenticated members can submit leads. Sign in with GitHub in seconds.',
  noOAuthConfig: 'GitHub OAuth is not configured on this server.',
  sourcesTitle: 'Data Sources',
  protocol: 'Protocol',
  sourceName: 'Source name',
  urlFeed: 'Feed URL',
  channelTelegram: 'Telegram channel',
  createSource: 'Create source',
  runs: 'Runs',
  justNow: 'just now',
  minsAgo: (mins: number) => `${mins}m ago`,
  hoursAgo: (hours: number) => `${hours}h ago`,
  daysAgo: (days: number) => `${days}d ago`,
};

export function getTranslations(lang: SupportedLang = 'ru'): Translations {
  return lang === 'en' ? EN : RU;
}

export function resolveLang(c: Context): SupportedLang {
  const queryLang = c.req.query('lang');
  if (queryLang === 'en' || queryLang === 'ru') {
    try {
      setCookie(c, 'openradar_lang', queryLang, {
        path: '/',
        maxAge: 31536000,
        sameSite: 'Lax',
      });
    } catch {}
    return queryLang;
  }
  const cookieLang = getCookie(c, 'openradar_lang');
  if (cookieLang === 'en' || cookieLang === 'ru') {
    return cookieLang;
  }
  const accept = c.req.header('accept-language')?.toLowerCase() ?? '';
  if (accept.startsWith('en')) {
    return 'en';
  }
  return 'ru';
}
