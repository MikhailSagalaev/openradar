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
  alsoPublished: string;
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
  hybridFormat: string;
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
  /** Visa sponsorship note from a public register (plan 021D). */
  visaSponsorLabel: string;
  visaSponsorHint: string;
  explainLabel: string;
  explainGates: string;
  explainChecks: string;
  explainPassed: (n: number, total: number) => string;
  verdict: Record<'strong' | 'stretch' | 'skip', string>;
  gateName: Record<string, string>;
  checkName: Record<string, string>;
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
  qualityFlag: Record<'channel_ad' | 'digest' | 'mlm' | 'outstaff' | 'mystery_shopper', string>;
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
  sortSelectLabel: string;
  budgetSelectLabel: string;
  skillSelectLabel: string;
  directionSelectLabel: string;
  langSelectLabel: string;
  closeDialog: string;
  sortNew: string;
  sortScore: string;
  sortBudget: string;
  sortRelevance: string;
  budgetAny: string;
  budgetFrom: string;
  skillAny: string;
  directionAny: string;
  remoteOnly: string;
  itOnly: string;
  resetFilters: string;
  follow: string;
  followHint: string;
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
  searchPlaceholder: 'Поиск по заказам и навыкам',
  searchBtn: 'Найти',
  emptyTitle: 'Ничего не найдено',
  emptyDesc: 'Попробуйте изменить запрос или проверить другие фильтры.',
  backToLeads: '← Все заказы',
  openOriginal: 'Открыть оригинал ↗',
  alsoPublished: 'Также опубликовано',
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
  hybridFormat: 'Гибридный формат',
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
  visaSponsorLabel: 'Визовое спонсорство',
  visaSponsorHint: 'Работодатель есть в публичном реестре лицензированных спонсоров Великобритании (Worker / Skilled Worker). Это факт о лицензии компании, а не обещание спонсорства для этой вакансии — уточняйте у работодателя. Реестр обновляется ежедневно, Open Government Licence v3.0.',
  explainLabel: 'Оценка и проверки',
  explainGates: 'Обязательные условия',
  explainChecks: 'Проверки',
  explainPassed: (n, total) => `${n} из ${total}`,
  verdict: { strong: 'Сильное совпадение', stretch: 'С натяжкой', skip: 'Пропустить' },
  gateName: { live: 'Активна', 'real-offer': 'Единое предложение' },
  checkName: { score: 'Оценка', pay: 'Оплата', requirements: 'Требования', direction: 'Направление', detail: 'Подробность' },
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
  qualityFlag: { channel_ad: 'реклама канала', digest: 'подборка вакансий', mlm: 'похоже на набор в схему', outstaff: 'аутстафф', mystery_shopper: 'тайный покупатель' },
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
  sortSelectLabel: 'Сортировка ленты',
  budgetSelectLabel: 'Минимальный бюджет',
  skillSelectLabel: 'Фильтр по навыку',
  directionSelectLabel: 'Фильтр по направлению',
  langSelectLabel: 'Язык публикаций',
  closeDialog: 'Закрыть окно',
  sortNew: 'Сначала новые',
  sortScore: 'Сначала лучшие',
  sortBudget: 'Сначала дорогие',
  sortRelevance: 'По релевантности',
  budgetAny: 'Любой бюджет',
  budgetFrom: 'от {n} ₽',
  skillAny: 'Все навыки',
  directionAny: 'Все направления',
  remoteOnly: 'Только удалённо',
  itOnly: 'Только IT',
  resetFilters: 'Сбросить фильтры',
  follow: 'Следить',
  followHint: 'Присылать новые заказы с этими фильтрами в Telegram или на вебхук',
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
  searchPlaceholder: 'Search jobs and skills',
  searchBtn: 'Search',
  emptyTitle: 'No leads found',
  emptyDesc: 'Try adjusting your search query or switching filters.',
  backToLeads: '← All leads',
  openOriginal: 'Open original ↗',
  alsoPublished: 'Also published at',
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
  hybridFormat: 'Hybrid',
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
  visaSponsorLabel: 'Visa sponsorship',
  visaSponsorHint: 'The employer appears in the UK public register of licensed sponsors (Worker / Skilled Worker). This is a fact about the company\'s licence, not a promise that this role is sponsored — confirm with the employer. The register updates daily, Open Government Licence v3.0.',
  explainLabel: 'Score & checks',
  explainGates: 'Requirements',
  explainChecks: 'Checks',
  explainPassed: (n, total) => `${n} of ${total}`,
  verdict: { strong: 'Strong fit', stretch: 'Stretch', skip: 'Skip' },
  gateName: { live: 'Live', 'real-offer': 'Single offer' },
  checkName: { score: 'Score', pay: 'Pay', requirements: 'Requirements', direction: 'Direction', detail: 'Detail' },
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
  qualityFlag: { channel_ad: 'channel promo', digest: 'job roundup', mlm: 'looks like a scheme', outstaff: 'outstaffing', mystery_shopper: 'mystery shopper' },
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
  sortSelectLabel: 'Feed sort order',
  budgetSelectLabel: 'Minimum budget',
  skillSelectLabel: 'Filter by skill',
  directionSelectLabel: 'Filter by direction',
  langSelectLabel: 'Publication language',
  closeDialog: 'Close dialog',
  sortNew: 'Newest first',
  sortScore: 'Best first',
  sortBudget: 'Highest budget first',
  sortRelevance: 'Most relevant',
  budgetAny: 'Any budget',
  budgetFrom: 'from {n} ₽',
  skillAny: 'All skills',
  directionAny: 'All directions',
  remoteOnly: 'Remote only',
  itOnly: 'IT only',
  resetFilters: 'Reset filters',
  follow: 'Follow',
  followHint: 'Send new leads matching these filters to Telegram or a webhook',
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
  // X/Twitter previews the link for an international audience: its crawler
  // always gets the English card, whatever the cookie or Accept-Language says.
  if (/(^|[\s/])Twitterbot([/\s]|$)/i.test(c.req.header('user-agent') ?? '')) return 'en';
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


const SKILL_EN: Record<string, string> = {
  "1С": "1C",
  "Битрикс": "Bitrix",
  "Нейросети": "Neural Networks",
  "Видеомонтаж": "Video Editing",
  "Моушн-дизайн": "Motion Design",
  "Брендинг": "Branding",
  "Иллюстрация": "Illustration",
  "Тексты": "Copywriting & Content",
  "Копирайтинг": "Copywriting",
  "Переводы": "Translation",
  "Таргет": "Targeted Ads",
  "Контекстная реклама": "PPC Advertising",
  "Авито": "Avito",
  "Маркетплейсы": "Marketplaces",
  "Бухгалтерия": "Accounting",
  "Юриспруденция": "Legal",
  "Обучение": "Education & Mentoring",
  "Фото": "Photography",
  "Продажи": "Sales",
  "Поддержка": "Support",
  "Вайб-кодинг": "Vibe Coding",
  "Разработка": "Development",
  "Аналитика": "Analytics",
  "Тестирование": "QA & Testing",
  "Управление проектами": "Project Management",
  "Продакт-менеджмент": "Product Management",
  "Рекрутинг": "Recruiting & HR",
  "Маркетинг": "Marketing",
  "Дизайн": "Design",
  "Администрирование": "System Administration",
  "Верстка": "HTML/CSS Layout",
  "Вёрстка": "HTML/CSS Layout",
  "Парсинг": "Web Scraping",
  "Информационная безопасность": "Information Security",
  "Информационные технологии": "Information Technology",
  "Боты": "Bots",
  "Сайты": "Websites",
  "Видео и анимация": "Video & Animation",
};

export function translateSkill(skill: string, lang: SupportedLang = "ru"): string {
  if (lang !== "en" || !skill) return skill;
  return SKILL_EN[skill] ?? skill;
}

const CITY_EN: Record<string, string> = {
  "Онлайн": "Online",
  "Удаленно": "Remote",
  "Удалённо": "Remote",
  "Москва": "Moscow",
  "Санкт-Петербург": "Saint Petersburg",
  "Нижний Новгород": "Nizhny Novgorod",
  "Екатеринбург": "Yekaterinburg",
  "Новосибирск": "Novosibirsk",
  "Казань": "Kazan",
  "Ростов-на-Дону": "Rostov-on-Don",
  "Краснодар": "Krasnodar",
  "Самара": "Samara",
  "Воронеж": "Voronezh",
  "Пермь": "Perm",
  "Уфа": "Ufa",
  "Челябинск": "Chelyabinsk",
  "Омск": "Omsk",
  "Волгоград": "Volgograd",
  "Красноярск": "Krasnoyarsk",
  "Саратов": "Saratov",
  "Тюмень": "Tyumen",
  "Тольятти": "Tolyatti",
  "Ижевск": "Izhevsk",
  "Барнаул": "Barnaul",
  "Ульяновск": "Ulyanovsk",
  "Иркутск": "Irkutsk",
  "Хабаровск": "Khabarovsk",
  "Ярославль": "Yaroslavl",
  "Владивосток": "Vladivostok",
  "Махачкала": "Makhachkala",
  "Томск": "Tomsk",
  "Оренбург": "Orenburg",
  "Кемерово": "Kemerovo",
  "Новокузнецк": "Novokuznetsk",
  "Рязань": "Ryazan",
  "Астрахань": "Astrakhan",
  "Пенза": "Penza",
  "Липецк": "Lipetsk",
  "Тула": "Tula",
  "Киров": "Kirov",
  "Чебоксары": "Cheboksary",
  "Калининград": "Kaliningrad",
  "Брянск": "Bryansk",
  "Курск": "Kursk",
  "Иваново": "Ivanovo",
  "Магнитогорск": "Magnitogorsk",
  "Тверь": "Tver",
  "Ставрополь": "Stavropol",
  "Белгород": "Belgorod",
  "Сочи": "Sochi",
  "Владимир": "Vladimir",
  "Архангельск": "Arkhangelsk",
  "Калуга": "Kaluga",
  "Смоленск": "Smolensk",
  "Одинцово": "Odintsovo",
  "Мытищи": "Mytishchi",
  "Химки": "Khimki",
  "Подольск": "Podolsk",
  "Балашиха": "Balashikha",
  "Люберцы": "Lyubertsy",
  "Королёв": "Korolyov",
  "Красногорск": "Krasnogorsk",
  "Другие города": "Other cities",
  "Не указан": "Not stated",
};

export function translateCity(city: string | undefined, lang: SupportedLang = "ru"): string | undefined {
  if (!city || lang !== "en") return city;
  const trimmed = city.trim();
  if (CITY_EN[trimmed]) return CITY_EN[trimmed];
  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((part) => {
        const p = part.trim();
        return CITY_EN[p] ?? p;
      })
      .join(", ");
  }
  return city;
}

const SOURCE_PLATFORM_EN: Record<string, string> = {
  "Хабр Карьера": "Habr Career",
  "Работа России": "Rabota Rossii",
  "Карьерные страницы компаний": "Company career pages",
  "Ручное добавление": "Manual submissions",
  "Яндекс": "Yandex",
  "Яндекс Услуги": "Yandex Services",
  "Профи.ру": "Profi.ru",
  "Сбер": "Sber",
  "Сбер2Б": "Sber2B",
  "СберЗдоровье": "SberHealth",
  "Т-Банк": "T-Bank",
  "Точка Банк": "Tochka Bank",
  "МТС": "MTS",
  "Ростелеком": "Rostelecom",
  "билайн": "Beeline",
  "Золотое Яблоко": "Gold Apple",
  "Контур": "Kontur",
  "Фоксфорд": "Foxford",
  "Хантфлоу": "Huntflow",
  "Туту": "Tutu",
  "Циан": "Cian",
  "Тензор": "Tensor",
  "Диасофт": "Diasoft",
  "Авито": "Avito",
  "Озон": "Ozon",
  "Магнит Tech": "Magnit Tech",
  "Честный Знак (CRPT)": "Chestny ZNAK (CRPT)",
  "КРОК": "CROC",
  "Т1": "T1",
  "2ГИС": "2GIS",
  "Альфа-Банк": "Alfa-Bank",
  "Пятёрочка": "Pyaterochka",
  "Пятёрочка. Команда магазинов": "Pyaterochka (Store Team)",
  "МАГНИТ, Розничная сеть. Магазины продуктов": "Magnit Retail",
  "Fix Price. Магазины": "Fix Price Stores",
  "Правительство Москвы": "Moscow City Government",
  "Сбер. IT": "Sber IT",
  "Алабуга. Менеджмент": "Alabuga Management",
  "Team.Inno / Фабрика инноваций и решений": "Team.Inno",
  "Freelance Таверна": "Freelance Tavern",
};

const SOURCE_SCOPE_EN: Record<string, string> = {
  "Все заказы": "All gigs",
  "Государственная база вакансий (IT)": "National Job Bank (IT)",
  "Вакансии и заказы": "Jobs and gigs",
  "Вакансии IT и Digital": "IT & Digital jobs",
  "Все вакансии": "All vacancies",
  "Удалённая работа": "Remote work",
  "IT-вакансии": "IT vacancies",
  "Удалённая проектная работа": "Remote project work",
  "Все проекты": "All projects",
  "Все проекты и заказы": "All projects and gigs",
  "Вакансии Германии и ЕС": "Germany & EU jobs",
  "Отобранные вакансии": "Curated vacancies",
  "Web3 вакансии": "Web3 jobs",
  "Вакансии Европы": "European jobs",
  "Go-вакансии": "Go jobs",
  "Laravel и PHP": "Laravel & PHP",
  "Вакансии стартапов YC": "YC startup jobs",
  "Вакансии дизайнеров": "Designer jobs",
  "Удалённо из любой страны": "Remote from anywhere",
  "Удалённые вакансии": "Remote vacancies",
  "Карьерные страницы компаний": "Company career pages",
  "Вакансии": "Vacancies",
  "Карьерные вакансии": "Career vacancies",
  "Вакансии Vue.js и Frontend": "Vue.js & Frontend jobs",
  "Вакансии Python и Django": "Python & Django jobs",
  "Инженерные вакансии и проекты": "Engineering jobs & projects",
  "Вакансии США": "US jobs",
  "Продакт-менеджеры": "Product managers",
  "Проджект-менеджеры": "Project managers",
  "Аналитики": "Analysts",
  "Дизайнеры": "Designers",
  "Тестировщики (QA)": "QA & testers",
  "DevOps и администрирование": "DevOps & sysadmin",
  "Маркетинг и реклама": "Marketing & advertising",
  "Техподдержка": "Tech support",
  "Продажи": "Sales",
  "Информационная безопасность": "Information security",
  "1С": "1C",
  "Digital-вакансии": "Digital jobs",
  "заказы": "gigs",
  "Вакансии (из браузера)": "Vacancies (browser)",
  "DevOps, SRE и K8s": "DevOps, SRE & K8s",
  "Data Science, ML и AI": "Data Science, ML & AI",
  "Data Science, AI и ML": "Data Science, AI & ML",
  "Дизайн, UI/UX и графика": "Design, UI/UX & graphics",
  "Product и Project Management": "Product & Project Management",
  "Backend разработка": "Backend development",
  "Frontend разработка": "Frontend development",
  "Мобильная разработка": "Mobile development",
  "Тестирование и QA": "Testing & QA",
  "Системный и бизнес-анализ": "Systems & Business Analysis",
  "Информационная безопасность (ИБ)": "Information Security",
  "Job for Analysts и Data Scientists": "Job for Analysts & Data Scientists",
  "Job for HR (IT и Digital)": "Job for HR (IT & Digital)",
  "WorkASAP: удалённая работа": "WorkASAP: remote work",
  "Remocate: релокация и удалёнка": "Remocate: relocation & remote",
};

function translateSourceFragment(frag: string): string {
  if (!frag) return frag;
  if (SOURCE_PLATFORM_EN[frag]) return SOURCE_PLATFORM_EN[frag]!;
  if (SOURCE_SCOPE_EN[frag]) return SOURCE_SCOPE_EN[frag]!;
  if (frag.includes(':')) {
    const idx = frag.indexOf(':');
    const chan = frag.slice(0, idx).trim();
    const desc = frag.slice(idx + 1).trim();
    const descMap: Record<string, string> = {
      "вакансии продукта": "product jobs",
      "продукт": "product",
      "продуктовый дизайн": "product design",
      "motion-дизайн": "motion design",
      "джуны и стажировки": "juniors & internships",
      "удалёнка для джунов": "remote junior jobs",
      "аналитики без опыта": "junior analysts",
      "стажировки": "internships",
      "стартапы": "startups",
      "SMM и маркетинг": "SMM & marketing",
      "удалённая работа": "remote work",
      "релокация и удалёнка": "relocation & remote",
    };
    if (chan && desc && descMap[desc]) return `${chan}: ${descMap[desc]}`;
    if (chan && desc) {
      return `${chan}: ${desc
        .replace(/вакансии для продактов и проджектов/gi, "product & project jobs")
        .replace(/вакансии стартапов/gi, "startup jobs")
        .replace(/вакансии дизайнеров/gi, "designer jobs")
        .replace(/вакансии на/gi, "jobs in")
        .replace(/вакансии/gi, "jobs")
        .replace(/заказы/gi, "gigs")
        .replace(/разработка/gi, "development")
        .replace(/тестирование/gi, "QA")
        .replace(/дизайн/gi, "design")
        .replace(/маркетинг/gi, "marketing")
        .replace(/релокация и удалёнка/gi, "relocation & remote")
        .replace(/удалёнка/gi, "remote")}`;
    }
  }
  return frag
    .replace(/Вакансии для продактов и проджектов/g, "Product & project jobs")
    .replace(/Дизайн, UX\/UI и графика/g, "Design, UX/UI & graphics")
    .replace(/Дизайн, UI\/UX и графика/g, "Design, UI/UX & graphics")
    .replace(/Дизайн, UI\/UX & graphics/g, "Design, UI/UX & graphics")
    .replace(/Backend разработка/g, "Backend development")
    .replace(/Frontend разработка/g, "Frontend development")
    .replace(/Мобильная разработка/g, "Mobile development")
    .replace(/Product и Project Management/g, "Product & Project Management")
    .replace(/Data Science, AI и ML/g, "Data Science, AI & ML")
    .replace(/Data Science, ML и AI/g, "Data Science, ML & AI")
    .replace(/DevOps, SRE и K8s/g, "DevOps, SRE & K8s")
    .replace(/Job for Analysts и Data Scientists/g, "Job for Analysts & Data Scientists")
    .replace(/\(IT и Digital\)/g, "(IT & Digital)")
    .replace(/и автотестирование/g, "& automation QA")
    .replace(/и тестирование/g, "& QA")
    .replace(/и инфраструктура/g, "& infrastructure")
    .replace(/и администрирование/g, "& sysadmin")
    .replace(/и графика/g, "& graphics")
    .replace(/и маркетинг/g, "& marketing")
    .replace(/Дизайн и/g, "Design &")
    .replace(/релокация и удалёнка/g, "relocation & remote")
    .replace(/удалённая работа/g, "remote work")
    .replace(/вакансии на/gi, "jobs in")
    .replace(/Вакансии/g, "Vacancies")
    .replace(/вакансии/g, "jobs")
    .replace(/Заказы/g, "Gigs")
    .replace(/заказы/g, "gigs");
}

export function translateSourceTitle(title: string, lang: SupportedLang = "ru"): string {
  if (!title || lang !== "en") return title;
  if (SOURCE_PLATFORM_EN[title]) return SOURCE_PLATFORM_EN[title]!;
  if (SOURCE_SCOPE_EN[title]) return SOURCE_SCOPE_EN[title]!;
  const parts = title.split(/\s+—\s+/, 2);
  if (parts.length === 2) {
    const [left, right] = parts as [string, string];
    if (left === "Карьерные страницы компаний") {
      return `${translateSourceFragment(right)} — Company career pages`;
    }
    const enLeft = translateSourceFragment(left);
    const enRight = translateSourceFragment(right);
    return `${enLeft} — ${enRight}`;
  }
  return translateSourceFragment(title);
}

/** A value a string function interpolates. */
type Arg = string | number | undefined;

/**
 * User-visible strings of the SEO pages (src/server/seo.ts). The English dictionary is typed by
 * the Russian one, so a key missing in either language fails the build.
 */
const SEO_STRINGS_RU = {
  thisIsAGig: 'Это заказ',
  thisIsAJob: 'Это вакансия',
  storyWall: (repoUrl: string) => '<b>Стена историй:</b> нашли заказ — <a href="' + repoUrl + '/issues/new?template=i-found-work.yml" target="_blank" rel="noopener">расскажите</a>, ваша история появится в README.',
  vacancy: 'вакансия',
  vacancies: 'вакансии',
  gigs: 'заказы',
  noPostsYet: 'Пока пусто',
  newListingsWillAppearHere: 'Новые публикации появятся здесь в течение нескольких минут — источники опрашиваются автоматически.',
  navigation: 'Навигация',
  categories: 'Категории',
  rssFeed: 'RSS-лента',
  allJobs: 'Все вакансии',
  allGigs: 'Все заказы',
  overview: 'Что здесь',
  openradarIsAnOpenBase: 'openradar — открытая база заказов и вакансий без платных тарифов. Код проекта открыт, любой может запустить свой узел и подключить свои источники. <a href="/about">Подробнее о проекте</a>.',
  questions: 'Вопросы',
  relatedCategories: 'Похожие разделы',
  allCategories: 'Все категории',
  allOpenradarCategoriesFreelanceGigs: 'Все разделы openradar: заказы для фрилансеров по направлениям и IT-вакансии по специальностям. У каждого раздела своя RSS-лента.',
  categoriesOfOrdersAndVacancies: 'Категории заказов и вакансий',
  freelanceGigs: 'Заказы для фрилансеров',
  vacancies2: 'Вакансии',
  participants: 'Участники',
  onOpenradarSince: 'в openradar с',
  postsBrought: 'Постов принесено',
  pointsOver30Days: 'очков за 30 дней',
  tier: 'уровень',
  latestPosts: 'Последние публикации',
  noPublicPostsYet: 'Пока нет публикаций, открытых всем.',
  off: 'выключен',
  tooNew: 'мало данных',
  sources: 'Источники',
  quality: 'Качество',
  sourceQuality: 'Качество источников',
  overDaysDoesASource: (p0: Arg) => `За ${p0} дней: отвечает ли источник, приносит ли новое, живы ли посты, полны ли они и что сказали читатели.`,
  howItIsCounted: 'Как считается',
  source: 'Источник',
  score: 'Оценка',
  grade: 'Класс',
  answers: 'Отвечает',
  new: 'Новых',
  alive: 'Живых',
  complete: 'Полнота',
  readers: 'Читатели',
  readingIssues: 'Жалобы на сбор',
  checkingPostsByHand: 'Ручная проверка постов',
  checkedOf300: (p0: Arg) => `Проверено: ${p0} из 300. `,
  order: 'заказ',
  openTheOriginal: 'Открыть оригинал',
  nothingToCheck: 'Постов для проверки нет.',
  handCheck: 'Ручная проверка',
  of: 'из',
  closed: 'Закрытые',
  junk: 'Мусор',
  scam: 'Мошенничество',
  postType: 'Тип поста',
  modelDecisions: 'Решения модели',
  sureAnswersHidePostsAnd: 'Уверенные ответы убирают посты и меняют оценку. Любое действие можно вернуть.',
  search: 'Найти',
  other: 'Другое',
  job: 'Вакансия',
  gig2: 'Заказ',
  remote: 'Удалённо',
  openOriginal: 'Открыть оригинал ↗',
  jobDescription: 'Текст вакансии',
  gigDescription: 'Текст заказа',
  verdict: 'Решение',
  shownAs: 'Мы показали это как:',
  fixTypeOrDirection: 'Исправить тип или направление',
  otherDirection: 'Другое направление',
  legitimateWorkBriefTextIs: 'Реальная работа. Мало текста не беда, если оригинал в порядке.',
  looksGood: 'Всё верно',
  legitimateWorkCorrectTypeEnter: 'Реальная работа, верный тип · Enter',
  skipThisPostWithoutGrading: 'Пост пропускается, ответ не считается',
  skip: 'Не знаю',
  skipWithoutGrading: 'Пропустить без оценки',
  ingestionIssues: 'Что не так со сбором',
  optionalNoteAboutParsingIssues: 'Комментарий к сбору, если нужно',
  comment: 'Комментарий',
  nothingToReviewYet: 'Пока нечего разбирать',
  allPostsInThisDirection: 'В этом направлении все посты разобраны. Выберите другое направление выше или загляните позже.',
  allLeads: '← Все заказы',
  allDirections: 'Все направления',
  youReviewed: (p0: Arg) => `Вы разобрали: <strong>${p0}</strong>`,
  postReview: 'Разбор постов',
  reviewGuide: 'Справка по оценке (?)',
  howToReview: 'Как оценивать (?)',
  undoLastAnswerZ: 'Отменить последний ответ (Z)',
  undoAnswerZ: 'Отменить ответ (Z)',
  howToReview2: 'Как оценивать',
  close: 'Закрыть',
  evaluateTheJobGigItself: 'Оценивайте саму работу, а не то, как мы её показали.',
  ifTheDescriptionIsBrief: 'Если текста мало, сначала откройте оригинал.',
  ifTheOriginalIsLegitimate: 'Оригинал хороший, а у нас плохо считалось: это «Всё верно», а что не так, отметьте в проблемах сбора.',
  notWorkAdsCoursesResumes: '<strong>Не работа:</strong> реклама, курс, резюме, новость.',
  suspiciousUpfrontFeesHighPay: '<strong>Подозрительно:</strong> деньги вперёд, большой заработок без навыков, накрутки, подделка документов.',
  alreadyClosedPositionFilledListing: '<strong>Уже закрыта:</strong> на оригинале снята, заказ занят или страница не открывается.',
  unsureClickSkipItIs: 'Сомневаетесь? Нажмите «Не знаю»: это честнее, чем угадывать.',
  keys15OrEnter: 'Клавиши 1–5 или Enter выбирают ответ, стрелки ↑↓ переключают, О открывает оригинал, Z отменяет, ? открывает эту справку.',
  companiesWithOpenVacanciesHow: 'Компании с открытыми вакансиями: сколько позиций открыто сейчас и когда появилась последняя. Каждая страница собирает вакансии компании с разных площадок.',
  employers: 'Работодатели',
  companyName: 'Название компании',
  findACompany: 'Поиск компании',
  company: 'Компания',
  open: 'Открыто',
  latest: 'Последняя',
  noSuchCompaniesYet: 'Таких компаний пока нет.',
  openVacanciesAtNow: (p0: Arg, p1: Arg, p2: Arg, _p3: Arg) => `Открытые вакансии ${p0}: ${p1} сейчас${p2}.`,
  hasNoOpenVacanciesNow: (p0: Arg) => `Сейчас у ${p0} нет открытых вакансий.`,
  openNow: 'открыто сейчас',
  newIn7Days: 'новых за 7 дней',
  remote2: 'удалённо',
  sources2: 'источников',
  mostlyHiringFor: 'Чаще всего ищут',
  cities: 'Города',
  moreFreshVacancies: (p0: Arg) => `Ещё свежих вакансий: ${p0}.`,
  theyOpenALittleLater: 'Они откроются чуть позже.',
  signInToSeeThem: 'Войдите, чтобы видеть их раньше',
  noOpenVacanciesNow: 'Сейчас открытых вакансий нет.',
  vacanciesAt: 'Вакансии',
  network: 'Сеть',
  theOpenradarNetwork: 'Сеть openradar',
  participantsContributeToTheShared: (p0: Arg) => `Участники пополняют общую базу через расширение браузера, Telegram-каналы и узлы сети. Очки — рейтинг за ${p0} дней: кто первым обнаружил подтверждённый заказ, подтвердил публикацию или чей сигнал помог очистить ленту.`,
  participant: 'Участник',
  posts: 'Постов',
  points: 'Очки',
  tier2: 'Уровень',
  participantsWithALinkedGithub: 'Для участников с привязанным GitHub отображается @handle; для независимых узлов сети — криптографический ключ (hex-подпись). Закрытые каналы здесь не раскрываются.',
  nobodyHasEarnedPointsYet: 'Пока никто не получал очков — самые первые подтверждения появятся здесь.',
  sourcesOfTheWeek: 'Источники недели',
  leads: 'Лидов',
  postsThisWeekAcrossAutomated: (p0: Arg, _p1: Arg) => `Всего за неделю: ${p0} публикаций (автоматические парсеры и участники). Полный список с состояниями — на <a href="/sources">странице источников</a>.`,
  noDataForTheWeek: 'Пока нет данных за неделю.',
  howToGetOnThe: 'Как попасть в рейтинг',
  installTheBrowserExtensionSubmit: (p0: Arg, p1: Arg) => `Установите расширение для браузера, отправляйте публикации или подключите источник (публичный канал, RSS или свой узел с флагом share). Суммарно участники сети набрали ${p0} очков за ${p1} дней.`,
  openradarParticipantsAndSourcesThe: 'Участники и источники openradar: рейтинг за 30 дней, источники недели, как подключить свой.',
  contribute: 'Участвовать',
  connectASourceIn10: 'Подключите источник за 10 минут',
  bringTheOrdersOnlyYou: 'Приведите заказы, которые видите только вы. Кто делится — тот видит ленту первым: без задержки и с контактами. Рейтинг привязан к вашему ключу, атрибуция — к вашему каналу.',
  aTelegramChannel: 'Telegram-канал',
  t10Minutes: '10 минут',
  aPublicOrYourPrivate: 'Публичный или ваш закрытый канал — через ваш аккаунт (MTProto), сессия живёт у вас.',
  radarTelegramLoginSaveSession: `radar telegram login --save ./session\nradar telegram scan\nradar source add --kind telegram-account --folder "Заказы"`,
  t15RatingForA: '<b>×1.5 к рейтингу</b> за закрытый канал',
  yourOwnParser: 'Свой парсер',
  t5Minutes: '5 минут',
  anyScriptInAnyLanguage: 'Любой скрипт на любом языке: NDJSON-наблюдения в webhook-источник.',
  radarSourceAddKindWebhook: `radar source add --kind webhook --title "Мой парсер"\npython parser.py | radar push --source <id>`,
  theScoreComesFromRules: '<b>Скор лида</b> считают правила; LLM опционален',
  aFullNode: 'Готовый узел',
  t15Minutes: '15 минут',
  aFeedOfYourOwn: 'Своя лента целиком: Docker, PostgreSQL, свои источники и уведомления.',
  gitCloneGitCdOpenradar: (p0: Arg) => `git clone ${p0}.git && cd openradar\ndocker compose run --rm radar migrate\ndocker compose up -d`,
  theShareFlagSendsLeads: '<b>share</b>-флаг отправляет лиды в сеть',
  whatContributionGives: 'Что даёт вклад',
  earlyAccessActiveSeesLeads: '<b>Ранний доступ:</b> Active видит лиды через 30 минут, Core — сразу же.',
  rating10ForThe: '<b>Рейтинг:</b> +1.0 за первого, ×1.5 закрытый канал, ×1.5 эксклюзив за 6 часов.',
  attributionSourcesOfTheWeek: '<b>Атрибуция:</b> источники недели — на странице <a href="/network">Сети</a>.',
  notReadyToShareSubscribe: 'Не готовы делиться? Подпишитесь на RSS любого запроса — это тоже участие. Публичный список уже подключённых площадок — на <a href="/sources">странице источников</a>.',
  accessTiers: 'Уровни доступа',
  how: 'Как получить',
  delay: 'Задержка',
  notSignedIn: 'без входа',
  rating10: 'рейтинг ≥ 10',
  min: 'мин',
  rating50: 'рейтинг ≥ 50',
  protocolDetails: 'Подробности протокола: ',
  connectYourTelegramChannelParser: 'Подключите свой Telegram-канал, парсер или узел к openradar: без задержки, с контактами и рейтингом участника.',
  required: 'обязательный',
  optional: 'опциональный',
  parameters: 'Параметры',
  name: 'Имя',
  in: 'Где',
  required2: 'Обязательность',
  type: 'Тип',
  description: 'Описание',
  requestBody: 'Тело запроса:',
  responses: 'Ответы',
  tryOnTheLiveSite: 'Открыть на сайте',
  httpApi: 'HTTP API',
  openradarPublicRestApiEndpoints: 'Публичный REST API openradar: эндпоинты, параметры и ответы. Без ключа. OpenAPI 3.1: /openapi.json.',
  noApiKeyGuestsSee: 'Ключ не нужен. Гости видят ленту с задержкой и без контактов — та же проекция, что на сайте. Машиночитаемая схема: ',
  rfc9727Catalog: '; каталог RFC 9727: ',
  quickStart: 'Быстрый старт',
  endpoints: 'Эндпоинты',
  leadSchema: 'Схема Lead',
  field: 'Поле',
  whatOpenradarCollectsWhatIt: 'Что собирает openradar, чего не собирает никогда и как удалить данные.',
  whatWeCollect: 'Что собирается',
  publicPostingsOnlyOpenBoard: 'Только публичные постинги: открытые ленты бирж, официальные API, публичные страницы Telegram и письма-оповещения, которые оператор узла получил сам. Каждый источник объявляет уровень доступа и риски — это часть кода адаптера.',
  whatIsNeverHere: 'Чего здесь нет и не будет',
  resumesAndCandidateProfiles: 'Резюме и профилей кандидатов.',
  peopleContactDetailsBeyondThose: 'Контактных данных людей, кроме тех, что написаны в самом посте; гостям они скрыты.',
  loginCaptchaOrPaywallBypass: 'Обхода входа, капчи или платного доступа — это правило адаптеров, закреплённое в тестах.',
  paidAccessThereIsNo: 'Платного доступа: тарифов нет и не планируется.',
  security: 'Безопасность',
  secretsLiveInNodeEnvironment: 'Секреты только в переменных окружения узла. Запросы к источникам идут через SSRF-guard с проверкой адреса в момент соединения. События участников подписаны (BIP-340), HTTP-подписи одноразовые. HTML источников не рендерится, текст передаётся моделям как данные, скрытые Unicode-инструкции вырезаются на приёме.',
  removal: 'Удаление',
  aBoardCanAskTo: 'Площадка может потребовать убрать свой источник — он отключается из конфигурации, посты канала скрываются модератором. Участник удаляет свои посты событием kind 4042. По вопросам: ',
  serviceStatus: 'Статус сервиса: ',
  apiDocs: 'Документация API: ',
  whatOpenradarCollectsPublicPostings: 'Что собирает openradar (только публичные постинги), чего не собирает никогда, как обеспечивается безопасность и как удалить данные.',
};

export type SeoStrings = { [K in keyof typeof SEO_STRINGS_RU]: (typeof SEO_STRINGS_RU)[K] };

const SEO_STRINGS_EN: SeoStrings = {
  thisIsAGig: 'This is a gig',
  thisIsAJob: 'This is a job',
  storyWall: (repoUrl: string) => '<b>Story wall:</b> found work through openradar? <a href="' + repoUrl + '/issues/new?template=i-found-work.yml" target="_blank" rel="noopener">Tell the story</a> — it lands in the README.',
  vacancy: 'vacancy',
  vacancies: 'vacancies',
  gigs: 'gigs',
  noPostsYet: 'No posts yet',
  newListingsWillAppearHere: 'New listings will appear here within a few minutes — sources are polled automatically.',
  navigation: 'Navigation',
  categories: 'Categories',
  rssFeed: 'RSS feed',
  allJobs: 'All jobs',
  allGigs: 'All gigs',
  overview: 'Overview',
  openradarIsAnOpenBase: 'openradar is an open base of freelance orders and vacancies with no paid plans. Open source, anyone can run a node and connect their own sources. <a href="/about">About the project</a>.',
  questions: 'Questions',
  relatedCategories: 'Related categories',
  allCategories: 'All categories',
  allOpenradarCategoriesFreelanceGigs: 'All openradar categories: freelance gigs by trade and IT vacancies by specialization. Each section has its own RSS feed.',
  categoriesOfOrdersAndVacancies: 'Categories of orders and vacancies',
  freelanceGigs: 'Freelance gigs',
  vacancies2: 'Vacancies',
  participants: 'Participants',
  onOpenradarSince: 'on openradar since',
  postsBrought: 'Posts brought',
  pointsOver30Days: 'points over 30 days',
  tier: 'tier',
  latestPosts: 'Latest posts',
  noPublicPostsYet: 'No public posts yet.',
  off: 'off',
  tooNew: 'too new',
  sources: 'Sources',
  quality: 'Quality',
  sourceQuality: 'Source quality',
  overDaysDoesASource: (p0: Arg) => `Over ${p0} days: does a source answer, bring new posts, stay alive, carry full posts, and what readers said.`,
  howItIsCounted: 'How it is counted',
  source: 'Source',
  score: 'Score',
  grade: 'Grade',
  answers: 'Answers',
  new: 'New',
  alive: 'Alive',
  complete: 'Complete',
  readers: 'Readers',
  readingIssues: 'Reading issues',
  checkingPostsByHand: 'Checking posts by hand',
  checkedOf300: (p0: Arg) => `Checked: ${p0} of 300. `,
  order: 'order',
  openTheOriginal: 'Open the original',
  nothingToCheck: 'Nothing to check.',
  handCheck: 'Hand check',
  of: 'of',
  closed: 'Closed',
  junk: 'Junk',
  scam: 'Scam',
  postType: 'Post type',
  modelDecisions: 'Model decisions',
  sureAnswersHidePostsAnd: 'Sure answers hide posts and move scores. Any action can be overruled.',
  search: 'Search',
  other: 'Other',
  job: 'Job',
  gig2: 'Gig',
  remote: 'Remote',
  openOriginal: 'Open original ↗',
  jobDescription: 'Job description',
  gigDescription: 'Gig description',
  verdict: 'Verdict',
  shownAs: 'Shown as:',
  fixTypeOrDirection: 'Fix type or direction',
  otherDirection: 'Other direction',
  legitimateWorkBriefTextIs: 'Legitimate work. Brief text is fine if the original is valid.',
  looksGood: 'Looks good',
  legitimateWorkCorrectTypeEnter: 'Legitimate work, correct type · Enter',
  skipThisPostWithoutGrading: 'Skip this post without grading',
  skip: 'Skip',
  skipWithoutGrading: 'Skip without grading',
  ingestionIssues: 'Ingestion issues',
  optionalNoteAboutParsingIssues: 'Optional note about parsing issues',
  comment: 'Comment',
  nothingToReviewYet: 'Nothing to review yet',
  allPostsInThisDirection: 'All posts in this direction have been reviewed. Choose another direction above or check back later.',
  allLeads: '← All leads',
  allDirections: 'All directions',
  youReviewed: (p0: Arg) => `You reviewed: <strong>${p0}</strong>`,
  postReview: 'Post review',
  reviewGuide: 'Review guide (?)',
  howToReview: 'How to review (?)',
  undoLastAnswerZ: 'Undo last answer (Z)',
  undoAnswerZ: 'Undo answer (Z)',
  howToReview2: 'How to review',
  close: 'Close',
  evaluateTheJobGigItself: 'Evaluate the job/gig itself, not how openradar rendered it.',
  ifTheDescriptionIsBrief: 'If the description is brief, check the original link first.',
  ifTheOriginalIsLegitimate: 'If the original is legitimate but openradar parsed it poorly, select "Looks good" and mark parsing issues below.',
  notWorkAdsCoursesResumes: '<strong>Not work:</strong> ads, courses, resumes, news, promos.',
  suspiciousUpfrontFeesHighPay: '<strong>Suspicious:</strong> upfront fees, high pay with no skills, fake reviews, scam.',
  alreadyClosedPositionFilledListing: '<strong>Already closed:</strong> position filled, listing archived, or link dead.',
  unsureClickSkipItIs: 'Unsure? Click "Skip": it is better than guessing.',
  keys15OrEnter: 'Keys 1–5 or Enter choose an answer, ↑↓ arrows switch, O opens original, Z undoes, ? toggles this help.',
  companiesWithOpenVacanciesHow: 'Companies with open vacancies: how many roles are open now and when the latest appeared. Each page gathers the company\'s vacancies from every board.',
  employers: 'Employers',
  companyName: 'Company name',
  findACompany: 'Find a company',
  company: 'Company',
  open: 'Open',
  latest: 'Latest',
  noSuchCompaniesYet: 'No such companies yet.',
  openVacanciesAtNow: (p0: Arg, p1: Arg, _p2: Arg, p3: Arg) => `Open vacancies at ${p0}: ${p1} now${p3}.`,
  hasNoOpenVacanciesNow: (p0: Arg) => `${p0} has no open vacancies now.`,
  openNow: 'open now',
  newIn7Days: 'new in 7 days',
  remote2: 'remote',
  sources2: 'sources',
  mostlyHiringFor: 'Mostly hiring for',
  cities: 'Cities',
  moreFreshVacancies: (p0: Arg) => `${p0} more fresh vacancies.`,
  theyOpenALittleLater: 'They open a little later.',
  signInToSeeThem: 'Sign in to see them sooner',
  noOpenVacanciesNow: 'No open vacancies now.',
  vacanciesAt: 'Vacancies at',
  network: 'Network',
  theOpenradarNetwork: 'The openradar network',
  participantsContributeToTheShared: (p0: Arg) => `Participants contribute to the shared feed via the browser extension, Telegram channels, and network nodes. Points reflect the ${p0}-day rating: who discovered a confirmed lead first, confirmed a post, or helped clean the feed.`,
  participant: 'Participant',
  posts: 'Posts',
  points: 'Points',
  tier2: 'Tier',
  participantsWithALinkedGithub: 'Participants with a linked GitHub account appear by their @handle; independent network nodes appear by their cryptographic signing key. Private channels are never disclosed here.',
  nobodyHasEarnedPointsYet: 'Nobody has earned points yet — the first confirmations will show up here.',
  sourcesOfTheWeek: 'Sources of the week',
  leads: 'Leads',
  postsThisWeekAcrossAutomated: (_p0: Arg, p1: Arg) => `${p1} posts this week across automated parsers and participants. The full list with states lives on the <a href="/sources">sources page</a>.`,
  noDataForTheWeek: 'No data for the week yet.',
  howToGetOnThe: 'How to get on the leaderboard',
  installTheBrowserExtensionSubmit: (p0: Arg, p1: Arg) => `Install the browser extension, submit posts, or connect a source (public channel, RSS, or your own node with the share flag). The network has earned ${p0} points in ${p1} days.`,
  openradarParticipantsAndSourcesThe: 'openradar participants and sources: the 30-day rating, sources of the week, how to connect yours.',
  contribute: 'Contribute',
  connectASourceIn10: 'Connect a source in 10 minutes',
  bringTheOrdersOnlyYou: 'Bring the orders only you can see. Those who share see the feed first: no delay, contacts included. The rating belongs to your key, the attribution to your channel.',
  aTelegramChannel: 'A Telegram channel',
  t10Minutes: '10 minutes',
  aPublicOrYourPrivate: 'A public or your private channel — through your own account (MTProto); the session stays with you.',
  radarTelegramLoginSaveSession: `radar telegram login --save ./session\nradar telegram scan\nradar source add --kind telegram-account --folder "Orders"`,
  t15RatingForA: '<b>×1.5 rating</b> for a private channel',
  yourOwnParser: 'Your own parser',
  t5Minutes: '5 minutes',
  anyScriptInAnyLanguage: 'Any script in any language: NDJSON observations into a webhook source.',
  radarSourceAddKindWebhook: `radar source add --kind webhook --title "My parser"\npython parser.py | radar push --source <id>`,
  theScoreComesFromRules: '<b>The score</b> comes from rules; LLM optional',
  aFullNode: 'A full node',
  t15Minutes: '15 minutes',
  aFeedOfYourOwn: 'A feed of your own: Docker, PostgreSQL, your sources and notifications.',
  gitCloneGitCdOpenradar: (p0: Arg) => `git clone ${p0}.git && cd openradar\ndocker compose run --rm radar migrate\ndocker compose up -d`,
  theShareFlagSendsLeads: 'the <b>share</b> flag sends leads to the network',
  whatContributionGives: 'What contribution gives',
  earlyAccessActiveSeesLeads: '<b>Early access:</b> Active sees leads after 30 minutes, Core instantly.',
  rating10ForThe: '<b>Rating:</b> +1.0 for the first sighting, ×1.5 private channel, ×1.5 for a 6-hour exclusive.',
  attributionSourcesOfTheWeek: '<b>Attribution:</b> sources of the week live on the <a href="/network">Network</a> page.',
  notReadyToShareSubscribe: 'Not ready to share? Subscribe to the RSS of any query — that counts too. The public list of connected boards is on the <a href="/sources">sources page</a>.',
  accessTiers: 'Access tiers',
  how: 'How',
  delay: 'Delay',
  notSignedIn: 'not signed in',
  rating10: 'rating ≥ 10',
  min: 'min',
  rating50: 'rating ≥ 50',
  protocolDetails: 'Protocol details: ',
  connectYourTelegramChannelParser: 'Connect your Telegram channel, parser or node to openradar: no delay, contacts, participant rating.',
  required: 'required',
  optional: 'optional',
  parameters: 'Parameters',
  name: 'Name',
  in: 'In',
  required2: 'Required',
  type: 'Type',
  description: 'Description',
  requestBody: 'Request body:',
  responses: 'Responses',
  tryOnTheLiveSite: 'Try on the live site',
  httpApi: 'HTTP API',
  openradarPublicRestApiEndpoints: 'openradar public REST API: endpoints, parameters and responses. No API key. OpenAPI 3.1 at /openapi.json.',
  noApiKeyGuestsSee: 'No API key. Guests see the feed with a delay and without contacts — the same projection as the website. Machine-readable schema: ',
  rfc9727Catalog: '; RFC 9727 catalog: ',
  quickStart: 'Quick start',
  endpoints: 'Endpoints',
  leadSchema: 'Lead schema',
  field: 'Field',
  whatOpenradarCollectsWhatIt: 'What openradar collects, what it never does, and how to get data removed.',
  whatWeCollect: 'What we collect',
  publicPostingsOnlyOpenBoard: 'Public postings only: open board feeds, official APIs, public Telegram pages and job-alert mail the node operator received themselves. Every source declares its access level and risks — it is part of the adapter code.',
  whatIsNeverHere: 'What is never here',
  resumesAndCandidateProfiles: 'Resumes and candidate profiles.',
  peopleContactDetailsBeyondThose: 'People contact details beyond those written in the post itself; guests never see them.',
  loginCaptchaOrPaywallBypass: 'Login, CAPTCHA or paywall bypass — an adapter rule enforced in tests.',
  paidAccessThereIsNo: 'Paid access: there is no paid tier and none is planned.',
  security: 'Security',
  secretsLiveInNodeEnvironment: 'Secrets live in node environment variables only. Outbound requests go through an SSRF guard that checks the address at connect time. Participant events are signed (BIP-340); HTTP signatures are single-use. Source HTML is never rendered; text is handed to models as data, and hidden Unicode instructions are stripped at intake.',
  removal: 'Removal',
  aBoardCanAskTo: 'A board can ask to remove its source: it is disabled in the configuration and its posts are hidden by a moderator. A participant deletes their posts with a kind 4042 event. Questions: ',
  serviceStatus: 'Service status: ',
  apiDocs: 'API docs: ',
  whatOpenradarCollectsPublicPostings: 'What openradar collects (public postings only), what it never does, how it is secured, and how to get data removed.',
};

export const SEO_STRINGS: Record<SupportedLang, SeoStrings> = { ru: SEO_STRINGS_RU, en: SEO_STRINGS_EN };
