import type { SourceConfig, SourceKind } from '../core/types.ts';

export interface SourcePreset {
  id: string;
  kind: SourceKind;
  title: string;
  description: string;
  config: SourceConfig;
}

/** The node's source that came from this preset, if any. */
export function presetSource<T extends { title: string; kind: string; config: SourceConfig }>(preset: SourcePreset, sources: T[]): T | undefined {
  return sources.find(
    (source) =>
      source.title === preset.title ||
      (preset.config.url !== undefined && source.config.url === preset.config.url) ||
      (preset.config.channel !== undefined && source.config.channel === preset.config.channel) ||
      (preset.kind === 'ats' && source.kind === 'ats' && source.config.provider === preset.config.provider),
  );
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
    id: 'workspace-vacancies',
    kind: 'rss',
    title: 'Workspace — Вакансии IT и Digital',
    description: 'Официальный RSS-фид вакансий digital-агентств и студий: разработка, дизайн, маркетинг',
    config: {
      url: 'https://workspace.ru/vacancies/rss/',
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
    id: 'geekjob',
    kind: 'rss',
    title: 'GeekJob — IT-вакансии',
    description: 'Официальный RSS GeekJob: вакансии разработчиков, аналитиков, дизайнеров с грейдом и форматом работы',
    config: {
      url: 'https://geekjob.ru/vacancies/rss',
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
    id: 'freelancer',
    kind: 'rss',
    title: 'Freelancer.com — Все проекты и заказы',
    description: 'Официальный RSS-фид открытых проектов и задач международной биржи Freelancer.com',
    config: {
      url: 'https://www.freelancer.com/rss/all.xml',
    },
  },
  {
    id: 'nodesk',
    kind: 'rss',
    title: 'NoDesk — Remote IT Jobs',
    description: 'Официальный RSS-фид удалённых вакансий для разработчиков и IT-специалистов',
    config: {
      url: 'https://nodesk.co/remote-jobs/index.xml',
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
  {
    id: 'landing-jobs',
    kind: 'rss',
    title: 'Landing.jobs — Вакансии Европы',
    description: 'Atom-лента Landing.jobs: IT-вакансии Португалии и Европы, удалённые и в офисе',
    config: {
      url: 'https://landing.jobs/feed',
    },
  },
  {
    id: 'python-jobs',
    kind: 'rss',
    title: 'Python.org — Python Job Board',
    description: 'Официальная доска вакансий Python Software Foundation',
    config: {
      url: 'https://www.python.org/jobs/feed/rss/',
    },
  },
  {
    id: 'golang-projects',
    kind: 'rss',
    title: 'Golang Projects — Go-вакансии',
    description: 'RSS Golang Projects: вакансии для Go-разработчиков, много удалённых',
    config: {
      url: 'https://www.golangprojects.com/rss.xml',
    },
  },
  {
    id: 'larajobs',
    kind: 'rss',
    title: 'LaraJobs — Laravel и PHP',
    description: 'RSS LaraJobs: вакансии для Laravel- и PHP-разработчиков',
    config: {
      url: 'https://larajobs.com/feed',
    },
  },
  {
    id: 'rails-jobs',
    kind: 'rss',
    title: 'Ruby on Rails Jobs',
    description: 'Официальная доска вакансий Ruby on Rails',
    config: {
      url: 'https://jobs.rubyonrails.org/jobs.rss',
    },
  },
  {
    id: 'elixir-jobs',
    kind: 'rss',
    title: 'Elixir Jobs',
    description: 'RSS Elixir Jobs: вакансии для Elixir- и Erlang-разработчиков',
    config: {
      url: 'https://elixirjobs.net/rss',
    },
  },
  {
    id: 'hn-jobs',
    kind: 'rss',
    title: 'Hacker News — Вакансии стартапов YC',
    description: 'RSS hnrss.org: раздел вакансий Hacker News, в основном стартапы Y Combinator',
    config: {
      url: 'https://hnrss.org/jobs',
    },
  },
  {
    id: 'dribbble-jobs',
    kind: 'rss',
    title: 'Dribbble — Вакансии дизайнеров',
    description: 'RSS доски вакансий Dribbble: продуктовые, UI/UX и графические дизайнеры',
    config: {
      url: 'https://dribbble.com/jobs.rss',
    },
  },
  {
    id: 'cryptocurrencyjobs',
    kind: 'rss',
    title: 'Cryptocurrency Jobs — Web3 вакансии',
    description: 'RSS Cryptocurrency Jobs: вакансии криптовалютных и блокчейн-компаний',
    config: {
      url: 'https://cryptocurrencyjobs.co/index.xml',
    },
  },
  {
    id: 'realworkfromanywhere',
    kind: 'rss',
    title: 'Real Work From Anywhere — Удалённо из любой страны',
    description: 'RSS вакансий, открытых для кандидатов из любой страны',
    config: {
      url: 'https://www.realworkfromanywhere.com/rss.xml',
    },
  },
  {
    id: 'workingnomads',
    kind: 'workingnomads',
    title: 'Working Nomads — Удалённые вакансии',
    description: 'Открытый API Working Nomads: удалённые вакансии с компанией, категорией и тегами. Из российских сетей ответ обрывается, поэтому через прокси',
    config: {
      url: 'https://www.workingnomads.com/api/exposed_jobs/',
      proxy: true,
    },
  },
  {
    id: 'ats-greenhouse',
    kind: 'ats',
    title: 'Карьерные страницы компаний — Greenhouse',
    description: 'Публичный API системы найма Greenhouse: вакансии IT-компаний прямо с их карьерных страниц, без ключа',
    config: {
      provider: 'greenhouse',
      perPoll: 5,
      maxAgeDays: 30,
      companies: [
        'databricks',
        'stripe',
        'anthropic',
        'cloudflare',
        'elastic',
        'datadog',
        'okta',
        'okx',
        'nebius',
        'mongodb',
        'samsara',
        'canonical',
        'brex',
        'binance',
        'adyen',
        'affirm',
        'gitlab',
        'coinbase',
        'deliveroo',
        'wolt',
        'airbnb',
        'lyft',
        'scaleai',
        'reddit',
        'pinterest',
        'robinhood',
        'figma',
        'grafanalabs',
        'twilio',
        'mozilla',
        'asana',
        'ripple',
        'intercom',
        'instacart',
        'vercel',
        'gusto',
        'chime',
        'wrike',
        'jfrog',
        'monzo',
        'neo4j',
        'duolingo',
        'fastly',
        'tailscale',
        'jetbrains',
        'discord',
        'mixpanel',
        'bitwarden',
        'bitpanda',
        'gemini',
        'n26',
        'contentful',
        'coursera',
        'fireblocks',
        'wise',
        'dropbox',
        'wikimedia',
        'circleci',
        'cockroachlabs',
        'yugabyte',
        'veriff',
        'consensys',
        'lattice',
        'planetscale',
        'typeform',
        'descript',
        'calendly',
        'aptoslabs',
        'airtable',
        'netlify',
        'stabilityai',
        'udemy',
      ],
    },
  },
  {
    id: 'ats-ashby',
    kind: 'ats',
    title: 'Карьерные страницы компаний — Ashby',
    description: 'Публичный API системы найма Ashby: вакансии IT-компаний прямо с их карьерных страниц, без ключа',
    config: {
      provider: 'ashby',
      perPoll: 5,
      maxAgeDays: 30,
      companies: [
        'openai=OpenAI',
        'harvey=Harvey',
        'snowflake=Snowflake',
        'clickhouse=ClickHouse',
        'elevenlabs=ElevenLabs',
        'notion=Notion',
        'perplexity=Perplexity',
        'plaid=Plaid',
        'preply=Preply',
        'cohere=Cohere',
        '1password=1Password',
        'socure=Socure',
        'temporal=Temporal',
        'supabase=Supabase',
        'writer=Writer',
        'amplitude=Amplitude',
        'sentry=Sentry',
        'pleo=Pleo',
        'replit=Replit',
        'linear=Linear',
        'redis=Redis',
        'alchemy=Alchemy',
        'webflow=Webflow',
        'paddle=Paddle',
        'persona=Persona',
        'phantom=Phantom',
        'ledger=Ledger',
        'miro=Miro',
        'zapier=Zapier',
        'circle=Circle',
        'posthog=PostHog',
        'babbel=Babbel',
        'outschool=Outschool',
        'dune=Dune',
        'manychat=ManyChat',
        'dodo=Dodo Brands',
      ],
    },
  },
  {
    id: 'ats-lever',
    kind: 'ats',
    title: 'Карьерные страницы компаний — Lever',
    description: 'Публичный API системы найма Lever: вакансии IT-компаний прямо с их карьерных страниц, без ключа',
    config: {
      provider: 'lever',
      perPoll: 5,
      maxAgeDays: 30,
      companies: [
        'palantir=Palantir',
        'xsolla=Xsolla',
        'spotify=Spotify',
        'toptal=Toptal',
        'offchainlabs=Offchain Labs',
      ],
    },
  },
  {
    id: 'ats-workable',
    kind: 'ats',
    title: 'Карьерные страницы компаний — Workable',
    description: 'Публичный API системы найма Workable: вакансии компаний с их карьерных страниц, без ключа',
    config: {
      provider: 'workable',
      perPoll: 3,
      maxAgeDays: 30,
      companies: ['huggingface=Hugging Face', 'modash=Modash', 'blueground=Blueground'],
    },
  },
  {
    id: 'ats-recruitee',
    kind: 'ats',
    title: 'Карьерные страницы компаний — Recruitee',
    description: 'Публичный API системы найма Recruitee: вакансии компаний с их карьерных страниц, без ключа',
    config: {
      provider: 'recruitee',
      perPoll: 3,
      maxAgeDays: 30,
      companies: ['tether=Tether', 'bunq=bunq', 'centreon=Centreon'],
    },
  },
  {
    id: 'getmatch',
    kind: 'sitemap',
    title: 'getmatch — IT-вакансии',
    description: 'IT-вакансии getmatch.ru из карты сайта: разметка JobPosting и зарплата из описания страницы (API закрыт в robots.txt и не используется)',
    config: {
      url: 'https://getmatch.ru/sitemap.xml',
      pattern: String.raw`/vacancies/(\d+)-`,
      perPoll: 15,
      delayMs: 1500,
      maxAgeDays: 30,
    },
  },
  {
    id: 'foxford',
    kind: 'sitemap',
    title: 'Фоксфорд — Вакансии',
    description: 'Вакансии онлайн-школы «Фоксфорд» из карты сайта jobs.foxford.ru: страницы без разметки JobPosting, зарплата — текстом на странице',
    config: {
      url: 'https://jobs.foxford.ru/sitemap-0.xml',
      pattern: String.raw`/vacancies/([a-z0-9-]+)`,
      perPoll: 10,
      delayMs: 1500,
      maxAgeDays: 30,
    },
  },
  {
    id: 'adzuna-us',
    kind: 'adzuna',
    title: 'Adzuna — Вакансии США',
    description: 'Официальный API Adzuna: вакансии США всех отраслей. Требует ключи RADAR_ADZUNA_APP_ID и RADAR_ADZUNA_APP_KEY в переменных окружения.',
    config: {
      country: 'us',
      limit: 50,
    },
  },
  // --- RU-батч 1 (2026-11-04): hh по ролям через RSS (API за WAF), нишевые RSS, публичные TG-каналы ---
  {
    id: 'hh-product',
    kind: 'rss',
    title: 'HeadHunter — Продакт-менеджеры',
    description: 'RSS поиска hh.ru по роли «Менеджер продукта»: вакансии продукта всех отраслей',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?professional_role=73&order_by=publication_time',
    },
  },
  {
    id: 'hh-project',
    kind: 'rss',
    title: 'HeadHunter — Проджект-менеджеры',
    description: 'RSS поиска hh.ru по роли «Руководитель проектов»: управление проектами во всех отраслях',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?professional_role=107&order_by=publication_time',
    },
  },
  {
    id: 'hh-analytics',
    kind: 'rss',
    title: 'HeadHunter — Аналитики',
    description: 'RSS поиска hh.ru по аналитическим ролям: аналитик, системный, бизнес-, BI- и продуктовый аналитик',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?professional_role=10&professional_role=148&professional_role=150&professional_role=156&professional_role=164&order_by=publication_time',
    },
  },
  {
    id: 'hh-design',
    kind: 'rss',
    title: 'HeadHunter — Дизайнеры',
    description: 'RSS поиска hh.ru по ролям «Дизайнер, художник», «Гейм-дизайнер» и «Арт-директор»',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?professional_role=34&professional_role=25&professional_role=12&order_by=publication_time',
    },
  },
  {
    id: 'hh-qa',
    kind: 'rss',
    title: 'HeadHunter — Тестировщики (QA)',
    description: 'RSS поиска hh.ru по роли «Тестировщик»: ручное и автоматизированное тестирование',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?professional_role=124&order_by=publication_time',
    },
  },
  {
    id: 'hh-devops',
    kind: 'rss',
    title: 'HeadHunter — DevOps и администрирование',
    description: 'RSS поиска hh.ru по ролям DevOps-инженер, системный администратор, сетевой и системный инженер',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?professional_role=160&professional_role=113&professional_role=112&professional_role=114&order_by=publication_time',
    },
  },
  {
    id: 'hh-marketing',
    kind: 'rss',
    title: 'HeadHunter — Маркетинг и реклама',
    description: 'RSS поиска hh.ru по маркетинговым ролям: интернет-маркетолог, SMM, маркетолог-аналитик, маркетплейсы',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?professional_role=68&professional_role=3&professional_role=163&professional_role=170&professional_role=182&order_by=publication_time',
    },
  },
  {
    id: 'hh-support',
    kind: 'rss',
    title: 'HeadHunter — Техподдержка',
    description: 'RSS поиска hh.ru по роли «Специалист технической поддержки»',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?professional_role=121&order_by=publication_time',
    },
  },
  {
    id: 'hh-sales',
    kind: 'rss',
    title: 'HeadHunter — Продажи',
    description: 'RSS поиска hh.ru по ролям продаж: менеджер по продажам, руководитель и координатор отдела продаж',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?professional_role=70&professional_role=106&professional_role=54&order_by=publication_time',
    },
  },
  {
    id: 'hh-infosec',
    kind: 'rss',
    title: 'HeadHunter — Информационная безопасность',
    description: 'RSS поиска hh.ru по ролям ИБ: специалист по информационной безопасности и службы безопасности',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?professional_role=116&professional_role=120&order_by=publication_time',
    },
  },
  {
    id: 'hh-1c',
    kind: 'rss',
    title: 'HeadHunter — 1С',
    description: 'RSS поиска hh.ru по запросу «1С»: программисты, консультанты и аналитики 1С',
    config: {
      url: 'https://hh.ru/search/vacancy/rss?text=1%D0%A1&order_by=publication_time',
    },
  },
  {
    id: 'pawetta',
    kind: 'rss',
    title: 'Pawetta — Digital-вакансии',
    description: 'Официальный RSS pawetta.ru: вакансии digital, маркетинга и дизайна',
    config: {
      url: 'https://pawetta.ru/feed/',
    },
  },
  {
    id: 'tg-forproducts',
    kind: 'telegram',
    title: 'Telegram — @forproducts: вакансии продукта',
    description: 'Публичный TG-канал о вакансиях продакт-менеджеров и product owner-ов',
    config: {
      channel: 'forproducts',
    },
  },
  {
    id: 'tg-hireproproduct',
    kind: 'telegram',
    title: 'Telegram — @hireproproduct: продукт',
    description: 'Публичный TG-канал с вакансиями продуктовых менеджеров',
    config: {
      channel: 'hireproproduct',
    },
  },
  {
    id: 'tg-product-design-jobs',
    kind: 'telegram',
    title: 'Telegram — @product_design_jobs: продуктовый дизайн',
    description: 'Публичный TG-канал с вакансиями продуктовых и UX/UI-дизайнеров',
    config: {
      channel: 'product_design_jobs',
    },
  },
  {
    id: 'tg-motion-design-jobs',
    kind: 'telegram',
    title: 'Telegram — @motion_design_jobs: motion-дизайн',
    description: 'Публичный TG-канал с вакансиями motion-дизайнеров и аниматоров',
    config: {
      channel: 'motion_design_jobs',
    },
  },
  {
    id: 'tg-juno-jobs',
    kind: 'telegram',
    title: 'Telegram — @juno_jobs: джуны и стажировки',
    description: 'Публичный TG-канал с junior-вакансиями и стажировками для начинающих',
    config: {
      channel: 'juno_jobs',
    },
  },
  {
    id: 'tg-jobs-juniors-remote',
    kind: 'telegram',
    title: 'Telegram — @jobs_juniors_remote: удалёнка для джунов',
    description: 'Публичный TG-канал с удалёнными junior-вакансиями',
    config: {
      channel: 'jobs_juniors_remote',
    },
  },
  {
    id: 'tg-job4analyst-junior',
    kind: 'telegram',
    title: 'Telegram — @job4analyst_junior: аналитики без опыта',
    description: 'Публичный TG-канал с вакансиями и стажировками для начинающих аналитиков',
    config: {
      channel: 'job4analyst_junior',
    },
  },
  {
    id: 'tg-stagirovky',
    kind: 'telegram',
    title: 'Telegram — @stagirovky: стажировки',
    description: 'Публичный TG-канал со стажировками и программами для студентов',
    config: {
      channel: 'stagirovky',
    },
  },
  {
    id: 'tg-startup-job-russia',
    kind: 'telegram',
    title: 'Telegram — @startup_job_russia: стартапы',
    description: 'Публичный TG-канал с вакансиями в российских стартапах',
    config: {
      channel: 'startup_job_russia',
    },
  },
  {
    id: 'tg-vacancysmm',
    kind: 'telegram',
    title: 'Telegram — @vacancysmm: SMM и маркетинг',
    description: 'Публичный TG-канал с вакансиями в SMM, контенте и маркетинге',
    config: {
      channel: 'vacancysmm',
    },
  },
];
