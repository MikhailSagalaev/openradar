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
  contacts: string;
  contactsHidden: string;
  channel: string;
  privateChannel: string;
  skills: string;
  aiAnalysis: string;
  aiMatch: string;
  urgency: string;
  stack: string;
  scoreReasons: string;
  cautionFlag: string;
  // Signals
  signalMarketBudget: string;
  salaryCheck: string;
  salaryCheckHint: string;
  signalDirectEmployer: string;
  signalPossibleScam: string;
  /** Quality flags shown on a feed row (src/core/quality.ts). */
  qualityFlag: Record<'channel_ad' | 'digest' | 'mlm' | 'outstaff', string>;
  skipToFeed: string;
  // Voting
  useful: string;
  junk: string;
  scam: string;
  closed: string;
  leadClosedNotice: string;
  leadExpiredNotice: string;
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
  guideLink: string;
  protocolLink: string;
  // Feed intro for guests
  heroTitle: string;
  heroText: string;
  heroSignIn: string;
  heroSignInHint: string;
  heroNode: string;
  heroNodeHint: string;
  heroSend: string;
  heroSendHint: string;
  heroDismiss: string;
  scoreHint: string;
  sortNew: string;
  sortScore: string;
  sortBudget: string;
  budgetAny: string;
  budgetFrom: string;
  skillAny: string;
  remoteOnly: string;
  itOnly: string;
  resetFilters: string;
  rankedWindow: string;
  heroTitleDelayed: string;
  feedFoundToday: string;
  foundTodayHint: string;
  feedDelayNote: string;
  contactsHiddenShort: string;
  removeDelay: string;
  scoreWhat: string;
  loadMore: string;
  suggestionsTitle: string;
  foundCount: string;
  forQuery: string;
  resetSearch: string;
  langAny: string;
  langRu: string;
  langEn: string;
  similarLeads: string;
  navProfile: string;
  recentSearches: string;
  popularSkills: string;
  partialMatch: string;
  shareLead: string;
  linkCopied: string;
  filtersTitle: string;
  profileTitle: string;
  notFoundTitle: string;
  notFoundDesc: string;
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
  brandSubtitle: 'openradar — открытый децентрализованный агрегатор заказов и вакансий.',
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
  searchPlaceholder: 'Поиск по заказам, вакансиям и навыкам',
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
  score: 'Рейтинг',
  published: 'Опубликован',
  added: 'Добавлен',
  author: 'Автор',
  contacts: 'Контакты',
  contactsHidden: 'Контакты видны после входа',
  channel: 'Канал',
  privateChannel: 'закрытый',
  skills: 'Навыки и стек',
  aiAnalysis: 'AI Анализ заказа',
  aiMatch: 'совпадение',
  urgency: 'Срочность',
  stack: 'Стек',
  scoreReasons: 'Почему так',
  cautionFlag: 'Внимание: участники сообщества отметили этот заказ как подозрительный. Тщательно проверяйте заказчика перед началом работы.',
  signalMarketBudget: 'указан бюджет',
  salaryCheck: 'зарплату проверить',
  salaryCheckHint: 'Сумма намного ниже обычной для такой работы — возможно, это ставка за час или за проект. Проверьте на сайте источника.',
  signalDirectEmployer: 'прямой заказчик',
  signalPossibleScam: 'возможен скам',
  qualityFlag: { channel_ad: 'реклама канала', digest: 'подборка вакансий', mlm: 'похоже на набор в схему', outstaff: 'аутстафф' },
  skipToFeed: 'К содержимому',
  useful: 'Полезно',
  junk: 'Мусор',
  scam: 'Скам',
  closed: 'Закрыто',
  leadClosedNotice: 'Закрыто: площадка показывает этот заказ закрытым или удалила его. Откликнуться, скорее всего, уже нельзя.',
  leadExpiredNotice: 'Опубликовано давно и уже не показывается в ленте: возможно, неактуально.',
  signInToVote: 'Войти через GitHub, чтобы голосовать',
  voteAuthTitle: 'Авторизация для голосования',
  voteAuthDesc: 'Чтобы исключить накрутку и спам, оценивать заказы и помечать скам могут только авторизованные через GitHub участники.',
  signInGithub: 'Войти через GitHub',
  cancel: 'Отмена',
  footerDesc: 'Открытая некоммерческая сеть заказов, задач и вакансий.',
  footerLicense: 'Свободное программное обеспечение. Лицензия AGPL-3.0.',
  licenseLink: 'Лицензия AGPL-3.0',
  rssFeed: 'RSS фид',
  guideLink: 'Как пользоваться',
  protocolLink: 'API и протокол',
  heroTitle: 'Свежие заказы и вакансии со всех площадок',
  heroText: 'openradar собирает заказы и вакансии с бирж, RSS и Telegram-каналов в одну ленту. Без платных откликов: контакты в посте, вы пишете заказчику напрямую. Код открыт, ленту пополняют сами участники.',
  heroSignIn: 'Войти через GitHub',
  heroSignInHint: 'меньше задержка, видны контакты',
  heroNode: 'Запустить свой узел',
  heroNodeHint: 'своя лента и фильтры без задержки',
  heroSend: 'Присылать заказы',
  heroSendHint: 'кто делится, видит ленту первым',
  heroDismiss: 'Скрыть',
  notFoundTitle: 'Страница не найдена',
  notFoundDesc: 'Такой страницы нет: ссылка устарела, или заказ уже скрыт.',
  scoreHint: 'Рейтинг от 0 до 100 — насколько заказ стоит внимания: бюджет или зарплата, навыки, насколько подробно описана задача, прямой контакт и голоса участников. Медиана около 60, от 80 — сильный заказ.',
  sortNew: 'Сначала новые',
  sortScore: 'Сначала лучшие',
  sortBudget: 'Сначала дорогие',
  budgetAny: 'Любой бюджет',
  budgetFrom: 'от {n} ₽',
  skillAny: 'Все навыки',
  remoteOnly: 'Только удалённо',
  itOnly: 'Только IT',
  resetFilters: 'Сбросить фильтры',
  rankedWindow: 'Лучшие и дорогие — среди заказов за последние 7 дней.',
  heroTitleDelayed: 'Заказы и вакансии со всех площадок',
  feedFoundToday: 'За сутки найдено {n}',
  foundTodayHint: 'По площадкам — на странице источников',
  feedDelayNote: 'лента с задержкой {d}',
  contactsHiddenShort: 'контакты скрыты',
  removeDelay: 'Как смотреть без задержки',
  scoreWhat: 'Что такое рейтинг?',
  loadMore: 'Показать ещё',
  suggestionsTitle: 'Быстрый поиск',
  foundCount: 'Найдено',
  forQuery: 'по запросу',
  resetSearch: 'Сбросить',
  langAny: 'Любой язык',
  langRu: 'На русском',
  langEn: 'На английском',
  similarLeads: 'Похожие заказы',
  navProfile: 'Профиль',
  recentSearches: 'Недавние запросы',
  popularSkills: 'Популярные навыки за неделю',
  partialMatch: 'Точных совпадений нет — показаны заказы с частью слов.',
  shareLead: 'Поделиться',
  linkCopied: 'Ссылка скопирована',
  filtersTitle: 'Фильтры и сортировка',
  profileTitle: 'Мой профиль',
  extensionGuide: 'Расширение для браузера',
  submitTitle: 'Добавить по ссылке',
  submitSubtitle: 'Автоматический сбор описания вакансии или заказа через разметку страницы',
  urlPlaceholder: 'Вставьте ссылку на вакансию или заказ (например, hh.ru, habr.com, vc.ru...)',
  fetchData: 'Получить данные',
  fetching: 'Получение данных...',
  publish: 'Опубликовать в openradar',
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
  submitGuestDesc: 'Чтобы база openradar оставалась доверенной, добавлять лиды могут только зарегистрированные участники. Войдите через GitHub — это займёт секунды.',
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
  brandSubtitle: 'openradar — open-source decentralized aggregator for jobs and freelance gigs.',
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
  searchPlaceholder: 'Search gigs, jobs and skills',
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
  contacts: 'Contacts',
  contactsHidden: 'Sign in to see contacts',
  channel: 'Channel',
  privateChannel: 'private',
  skills: 'Skills & stack',
  aiAnalysis: 'AI Analysis',
  aiMatch: 'match',
  urgency: 'Urgency',
  stack: 'Stack',
  scoreReasons: 'Score breakdown',
  cautionFlag: 'Caution: community members flagged this lead as suspicious. Verify the client carefully before proceeding.',
  signalMarketBudget: 'budget stated',
  salaryCheck: 'check the salary',
  salaryCheckHint: 'Far below the usual pay for this kind of job: possibly an hourly or per-task rate. Check it on the source site.',
  signalDirectEmployer: 'direct employer',
  signalPossibleScam: 'possible scam',
  qualityFlag: { channel_ad: 'channel promo', digest: 'job roundup', mlm: 'looks like a scheme', outstaff: 'outstaffing' },
  skipToFeed: 'Skip to content',
  useful: 'Useful',
  junk: 'Junk',
  scam: 'Scam',
  closed: 'Closed',
  leadClosedNotice: 'Closed: the board shows this post as closed or removed. It is probably too late to apply.',
  leadExpiredNotice: 'Posted a while ago and no longer in the feed: it may be outdated.',
  signInToVote: 'Sign in via GitHub to vote',
  voteAuthTitle: 'Sign in to vote',
  voteAuthDesc: 'To prevent manipulation and spam, voting and scam reporting requires signing in with GitHub.',
  signInGithub: 'Sign in with GitHub',
  cancel: 'Cancel',
  footerDesc: 'Open, non-commercial network of gigs, tasks and jobs.',
  footerLicense: 'Free and open-source software. AGPL-3.0 License.',
  licenseLink: 'AGPL-3.0 License',
  rssFeed: 'RSS feed',
  guideLink: 'Getting started',
  protocolLink: 'API and protocol',
  heroTitle: 'Fresh gigs and jobs from every board',
  heroText: 'openradar collects freelance orders and jobs from boards, RSS and Telegram channels into one feed. No paid responses: contacts stay in the post and you write to the client directly. The code is open and the feed is filled by its participants.',
  heroSignIn: 'Sign in with GitHub',
  heroSignInHint: 'shorter delay, contacts visible',
  heroNode: 'Run your own node',
  heroNodeHint: 'your own feed and filters, no delay',
  heroSend: 'Send leads',
  heroSendHint: 'those who share see the feed first',
  heroDismiss: 'Hide',
  notFoundTitle: 'Page not found',
  notFoundDesc: 'There is no such page: the link is outdated, or the lead has been hidden.',
  scoreHint: 'Score from 0 to 100: how much a lead is worth your attention. It counts the budget or salary, skills, how well the task is described, a direct contact and participant votes. The median is about 60; 80 and above is a strong lead.',
  sortNew: 'Newest first',
  sortScore: 'Best first',
  sortBudget: 'Highest budget first',
  budgetAny: 'Any budget',
  budgetFrom: 'from {n} ₽',
  skillAny: 'All skills',
  remoteOnly: 'Remote only',
  itOnly: 'IT only',
  resetFilters: 'Reset filters',
  rankedWindow: 'Best and highest budget: among leads of the last 7 days.',
  heroTitleDelayed: 'Gigs and jobs from every board',
  feedFoundToday: '{n} found in the last 24 h',
  foundTodayHint: 'By platform on the sources page',
  feedDelayNote: 'feed delayed by {d}',
  contactsHiddenShort: 'contacts hidden',
  removeDelay: 'How to see it without delay',
  scoreWhat: 'What is the score?',
  loadMore: 'Show more',
  suggestionsTitle: 'Quick search',
  foundCount: 'Found',
  forQuery: 'for',
  resetSearch: 'Reset',
  langAny: 'Any language',
  langRu: 'In Russian',
  langEn: 'In English',
  similarLeads: 'Similar leads',
  navProfile: 'Profile',
  recentSearches: 'Recent searches',
  popularSkills: 'Popular skills this week',
  partialMatch: 'No exact matches: showing leads with some of the words.',
  shareLead: 'Share',
  linkCopied: 'Link copied',
  filtersTitle: 'Filters and sorting',
  profileTitle: 'My profile',
  extensionGuide: 'Browser Extension',
  submitTitle: 'Submit by URL',
  submitSubtitle: 'Automated extraction of job or gig details using page schema',
  urlPlaceholder: 'Paste link to vacancy or order (e.g. hh.ru, habr.com, vc.ru...)',
  fetchData: 'Fetch data',
  fetching: 'Fetching data...',
  publish: 'Publish to openradar',
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

export function detectBrowserLang(header?: string): SupportedLang {
  if (!header) return 'ru';
  const tokens = header
    .split(',')
    .map((part) => {
      const parts = part.trim().split(';');
      const langCode = parts[0]?.trim() || '';
      const qPart = parts[1];
      const code = langCode.toLowerCase().split('-')[0]?.trim() || '';
      let q = 1.0;
      if (qPart && qPart.trim().startsWith('q=')) {
        const parsedQ = parseFloat(qPart.trim().slice(2));
        if (!isNaN(parsedQ)) q = parsedQ;
      }
      return { code, q };
    })
    .sort((a, b) => b.q - a.q);

  for (const token of tokens) {
    if (token.code === 'ru' || token.code === 'be' || token.code === 'uk' || token.code === 'kk') {
      return 'ru';
    }
    if (token.code && token.code !== '*' && token.q > 0) {
      return 'en';
    }
  }
  return 'ru';
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
  return detectBrowserLang(c.req.header('accept-language'));
}
