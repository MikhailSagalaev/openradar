import { escapeHtml, jsonForScript } from '../core/text.ts';
import type { Lead, LeadType } from '../core/types.ts';
import { layout, type AuthDisplay, formatBudget, salaryRange, safeHttpUrl, leadTitle, formatRelative } from './ui.ts';
import { formatLeadText } from './format.ts';
import type { SupportedLang } from './i18n.ts';
import type { SourceQuality, SourceQualityInput } from '../core/source-quality.ts';
import type { DecisionScore, FlagScore, ModelDecision } from '../core/decisions.ts';

export interface CatalogEntry {
  slug: string;
  h1: string;
  title: string;
  description: string;
  intro: string;
  /** A paragraph under the list: what the page collects and who it is for. */
  about: string;
  q?: string;
  /** Exact skill instead of a word search: «бот» is also inside «работа». */
  skill?: string;
  type?: LeadType;
  /** The research directions this page collects: a structural filter, not a word search. */
  directions?: string[];
  /** Vacancy pages pinned to remote: the IT feed must not leak office posts. */
  remote?: boolean;
}

/**
 * Search-driven landing pages ("заказы на разработку" and friends). Each page
 * is server-rendered, indexable, and shows the freshest leads for its query
 * plus a feed link — every catalog page doubles as a public RSS subscription.
 */
export const SEO_CATALOG: CatalogEntry[] = [
  {
    slug: 'zakazy-na-razrabotku',
    h1: 'Заказы на разработку',
    title: 'Заказы на разработку — свежие проекты каждый час',
    description:
      'Актуальные заказы на разработку сайтов, ботов и приложений с бирж и из Telegram-каналов. Бюджеты, стек и ссылки на первоисточник.',
    intro:
      'Свежие заказы на разработку, собранные из открытых бирж и каналов. Каждая карточка — ссылка на первоисточник, дубликаторы уже убраны.',
    about:
      'Здесь собраны заказы на программирование из FL.ru, Kwork, Freelancehunt и Telegram-каналов: сайты, боты, парсеры, интеграции, доработки. Один и тот же заказ, опубликованный на двух биржах, показывается одной карточкой, а у каждой карточки есть оценка от 0 до 100: за бюджет, понятное ТЗ и прямой контакт заказчика.',
    q: 'разработка',
    directions: ['backend', 'frontend', 'fullstack', 'web', 'mobile', 'dev-other', 'embedded'],
    type: 'gig',
  },
  {
    slug: 'razrabotka-saytov',
    h1: 'Заказы на разработку сайтов',
    title: 'Заказы на разработку сайтов — лендинги, интернет-магазины, CMS',
    description:
      'Заказы на сайты: лендинги, интернет-магазины, WordPress и Tilda. Свежие проекты с бюджетами и прямыми ссылками.',
    intro:
      'Проекты на сайты: от лендингов до интернет-магазинов. Обновляется автоматически каждые пять минут.',
    about:
      'Лендинги, корпоративные сайты, интернет-магазины, доработка готовых сайтов на WordPress, Tilda и Битриксе. Подходит веб-разработчикам и студиям, которым нужен поток небольших проектов без абонентской платы за доступ к бирже.',
    q: 'сайт',
    directions: ['web'],
    type: 'gig',
  },
  {
    slug: 'python-zakazy',
    h1: 'Заказы на Python',
    title: 'Заказы на Python — парсеры, бэкенды, автоматизация',
    description:
      'Свежие заказы на Python: парсинг данных, API, автоматизация, скрипты. Бюджеты в рублях и долларах, ссылка на заказчика.',
    intro: 'Задачи на Python из открытых источников: бэкенд, парсеры, автоматизация.',
    about:
      'Чаще всего на Python заказывают парсеры, Telegram-ботов, обработку таблиц, интеграции по API и бэкенд на Django или FastAPI. Небольшие задачи на день-два здесь соседствуют с проектами на несколько недель, бюджет указан в карточке, если заказчик его назвал.',
    q: 'python',
    type: 'gig',
  },
  {
    slug: 'boty-zakazy',
    h1: 'Заказы на Telegram-ботов',
    title: 'Заказы на Telegram-ботов и чат-ботов',
    description:
      'Актуальные заказы на ботов: Telegram, WhatsApp, чат-боты для бизнеса. Свежая лента с бюджетами.',
    intro: 'Разработка ботов и автоматизация мессенджеров — новые заказы каждые пять минут.',
    about:
      'Боты для записи клиентов, приёма оплат, рассылок, воронок продаж и поддержки, мини-приложения в Telegram, боты для VK и WhatsApp. Многие такие заказы публикуются только в Telegram-каналах, поэтому openradar читает и биржи, и каналы.',
    skill: 'Telegram Bot',
    directions: ['bots'],
    type: 'gig',
  },
  {
    slug: '1s-zakazy',
    h1: 'Заказы 1С',
    title: 'Заказы на программиста 1С — доработка и внедрение',
    description:
      'Заказы на 1С: доработка конфигураций, обмены, внедрение. Свежая лента из бирж и каналов.',
    intro: 'Доработка и внедрение 1С — заказы обновляются автоматически.',
    about:
      'Доработка конфигураций, обмены с сайтом и маркетплейсами, отчёты, перенос данных, консультации по 1С:Бухгалтерии и УТ. Работы для программистов 1С много и на биржах, и в профильных каналах, здесь она собрана в одну ленту.',
    q: '1с',
    directions: ['1c'],
    type: 'gig',
  },
  {
    slug: 'dizayn-zakazy',
    h1: 'Заказы на дизайн',
    title: 'Заказы на дизайн — логотипы, интерфейсы, баннеры',
    description:
      'Свежие заказы для дизайнеров: логотипы, UI/UX, баннеры, презентации. С бюджетами и ссылками на заказчика.',
    intro: 'Графический и продуктовый дизайн — свежие заказы из открытых источников.',
    about:
      'Логотипы и фирменный стиль, макеты сайтов в Figma, интерфейсы приложений, баннеры, презентации, оформление соцсетей. Чтобы найти задачи под свой инструмент, используйте поиск по ленте: «Figma», «презентация», «логотип».',
    q: 'дизайн',
    directions: ['design'],
    type: 'gig',
  },
  {
    slug: 'mobilnaya-razrabotka',
    h1: 'Заказы на мобильную разработку',
    title: 'Заказы на мобильные приложения — iOS и Android',
    description:
      'Заказы на мобильные приложения: iOS, Android, Flutter, React Native. Обновляется каждые пять минут.',
    intro: 'Мобильные приложения и игры — проекты для iOS и Android разработчиков.',
    about:
      'Приложения под iOS и Android с нуля, доработка готовых, кроссплатформенные проекты на Flutter и React Native, публикация в сторах. Заказы на мобильную разработку редкие и крупные, поэтому их удобнее ловить через RSS этой страницы, а не заходить вручную.',
    q: 'приложени',
    directions: ['mobile'],
    type: 'gig',
  },
  {
    slug: 'kopirayting-zakazy',
    h1: 'Заказы на тексты и копирайтинг',
    title: 'Заказы на копирайтинг и тексты',
    description:
      'Свежие заказы на тексты: статьи, карточки товаров, SEO-тексты, сценарии. С бюджетами и ссылками.',
    intro: 'Копирайтинг, редактура и контент-маркетинг — новые заказы каждый час.',
    about:
      'Статьи для блогов, тексты для сайтов и лендингов, описания товаров, посты для соцсетей, сценарии роликов, редактура. Заказы приходят с бирж и из каналов для авторов.',
    q: 'текст',
    directions: ['content'],
    type: 'gig',
  },
  {
    slug: 'vakansii-razrabotchikov',
    h1: 'Вакансии для разработчиков',
    title: 'Вакансии для разработчиков — свежие предложения',
    description:
      'Свежие вакансии в IT: бэкенд, фронтенд, DevOps. Вилки зарплат, стек, удалёнка и офис.',
    intro: 'IT-вакансии из официальных API и фидов: зарплатные вилки, стек и формат работы.',
    about:
      'Вакансии приходят из hh.ru, Хабр Карьеры, портала «Работа России» и зарубежных досок для удалёнки. В карточке есть вилка, город, формат работы и навыки, а для вакансий без вилки расширение openradar показывает, сколько обычно платят за похожую работу.',
    q: 'разработчик',
    directions: ['backend', 'frontend', 'fullstack', 'web', 'mobile', 'dev-other'],
    type: 'job',
  },
  {
    slug: 'udalennye-vakansii',
    h1: 'Удалённые вакансии в IT',
    title: 'Удалённые IT-вакансии — работа из любой точки',
    description:
      'Удалённые вакансии для программистов, дизайнеров и аналитиков. Зарплатные вилки в USD и рублях.',
    intro: 'Только удалёнка: вакансии из России и мира с указанием вилки.',
    about:
      'Российские работодатели с удалённым форматом и международные доски We Work Remotely, Jobicy и RemoteOK. Зарплаты в долларах показаны с примерным пересчётом в рубли.',
    directions: ['backend', 'frontend', 'fullstack', 'mobile', 'web', 'dev-other', 'data-engineer', 'ml', 'qa', 'devops', 'architect', 'sysadmin', 'analyst-system', 'analyst-business', 'analyst-data', 'product', 'gamedev', 'embedded', 'security', 'ai', '1c'],
    remote: true,
    type: 'job',
  },
  {
    slug: 'videomontazh-zakazy',
    h1: 'Заказы на видеомонтаж',
    title: 'Заказы на видеомонтаж — ролики, Reels, YouTube',
    description: 'Свежие заказы на монтаж видео, Reels и Shorts, моушн-дизайн и анимацию с бирж и из Telegram-каналов.',
    intro: 'Заказы на монтаж роликов, Reels и Shorts, моушн-дизайн. Каждая карточка — ссылка на первоисточник.',
    about:
      'Монтаж роликов для YouTube, вертикальные видео для Reels, Shorts и TikTok, рекламные креативы, моушн-дизайн и анимация. Значительная часть таких заказов публикуется в Telegram-каналах для монтажёров.',
    q: 'видео',
    directions: ['video'],
    type: 'gig',
  },
  {
    slug: 'reklama-i-marketing',
    h1: 'Заказы на рекламу и маркетинг',
    title: 'Заказы на рекламу и маркетинг — таргет, Директ, Авито, SMM',
    description: 'Заказы на настройку рекламы, таргет, Яндекс Директ, Авито и продвижение в соцсетях.',
    intro: 'Таргет, контекстная реклама, Авито и соцсети: свежие заказы с бюджетами и ссылками на первоисточник.',
    about:
      'Настройка Яндекс Директа и таргета VK, продвижение на Авито, ведение соцсетей, посевы в Telegram, маркетинговая аналитика. Подходит специалистам по трафику и SMM, которые ищут клиентов без агентств.',
    q: 'реклама',
    directions: ['marketing'],
    type: 'gig',
  },
  {
    slug: 'perevody-zakazy',
    h1: 'Заказы на переводы',
    title: 'Заказы на переводы — тексты, сайты, документы',
    description: 'Свежие заказы на перевод текстов, сайтов и документов с английского и других языков.',
    intro: 'Переводы текстов, сайтов и документов: заказы с бирж, обновляются каждые пять минут.',
    about:
      'Переводы статей, сайтов, документации, субтитров и деловой переписки, чаще всего с английского и на английский. Срочные заказы на переводы быстро разбирают, поэтому удобнее подписаться на RSS.',
    q: 'перевод',
    directions: ['translation'],
    type: 'gig',
  },
  {
    slug: 'marketpleysy-zakazy',
    h1: 'Заказы для маркетплейсов',
    title: 'Заказы для маркетплейсов — карточки, инфографика, Wildberries и Ozon',
    description: 'Заказы на карточки товаров, инфографику и ведение магазинов на Wildberries и Ozon.',
    intro: 'Карточки товаров, инфографика и ведение магазинов на маркетплейсах — свежие заказы с бирж.',
    about:
      'Инфографика и фото для карточек, SEO-описания, заливка товаров, аналитика продаж и ведение магазинов на Wildberries, Ozon и Яндекс Маркете. Работы много у дизайнеров и менеджеров маркетплейсов.',
    q: 'маркетплейс',
    type: 'gig',
  },
  {
    slug: 'wordpress-zakazy',
    h1: 'Заказы на WordPress',
    title: 'Заказы на WordPress — сайты, темы, плагины, доработки',
    description: 'Свежие заказы на WordPress: сайты под ключ, доработка тем, плагины, WooCommerce, перенос и ускорение.',
    intro: 'Сайты и доработки на WordPress и WooCommerce — заказы из бирж и каналов.',
    about:
      'Сайты под ключ на WordPress, правки тем, настройка WooCommerce, плагины, перенос на другой хостинг, ускорение и исправление ошибок. Небольшие доработки на WordPress — один из самых частых типов заказа на биржах.',
    q: 'wordpress',
    type: 'gig',
  },
  {
    slug: 'bitrix-zakazy',
    h1: 'Заказы на Битрикс',
    title: 'Заказы на 1С-Битрикс и Битрикс24 — доработка и интеграции',
    description: 'Заказы на 1С-Битрикс и Битрикс24: доработка сайтов, интеграции, настройка CRM и бизнес-процессов.',
    intro: 'Битрикс и Битрикс24: доработки сайтов, интеграции с 1С, настройка CRM.',
    about:
      'Доработка сайтов на 1С-Битрикс, обмен с 1С, настройка Битрикс24, роботы и бизнес-процессы, интеграции с телефонией и мессенджерами. Подходит битрикс-разработчикам и интеграторам CRM.',
    q: 'битрикс',
    type: 'gig',
  },
  {
    slug: 'parsing-zakazy',
    h1: 'Заказы на парсинг',
    title: 'Заказы на парсинг сайтов и сбор данных',
    description: 'Свежие заказы на парсеры: сбор данных с сайтов и маркетплейсов, выгрузки в Excel и Google Таблицы.',
    intro: 'Парсеры сайтов, маркетплейсов и соцсетей — свежие заказы с бюджетами.',
    about:
      'Сбор цен и остатков с маркетплейсов, выгрузка каталогов, мониторинг конкурентов, парсинг объявлений и соцсетей, сохранение в Excel, Google Таблицы или базу. Обычно такие заказы делают на Python, иногда на Node.js или в готовых сервисах.',
    q: 'парс',
    directions: ['parsing'],
    type: 'gig',
  },
  {
    slug: 'neyroseti-zakazy',
    h1: 'Заказы на нейросети и ИИ',
    title: 'Заказы на нейросети — ИИ-боты, автоматизация, генерация контента',
    description: 'Заказы на нейросети и ИИ: чат-боты на GPT, автоматизация, генерация изображений и текстов, интеграции.',
    intro: 'Нейросети в работе: ИИ-ассистенты, автоматизация и генерация контента.',
    about:
      'Чат-боты и ассистенты на языковых моделях, автоматизация процессов через n8n и Make, генерация изображений и видео, обработка документов. Категория быстро растёт: заказчики ищут исполнителей и среди разработчиков, и среди дизайнеров.',
    q: 'нейросет',
    directions: ['ai'],
    type: 'gig',
  },
  {
    slug: 'seo-prodvizhenie',
    h1: 'Заказы на SEO-продвижение',
    title: 'Заказы на SEO — продвижение сайтов, аудит, семантика',
    description: 'Свежие заказы на SEO: продвижение сайтов, технический аудит, сбор семантики, SEO-тексты и ссылки.',
    intro: 'SEO-продвижение, аудит и семантика — заказы из бирж и каналов.',
    about:
      'Продвижение сайтов в Яндексе и Google, технический аудит, сбор семантического ядра, внутренняя оптимизация, SEO-тексты для сайтов и маркетплейсов. Подходит SEO-специалистам и копирайтерам.',
    q: 'seo',
    directions: ['marketing'],
    type: 'gig',
  },
  {
    slug: 'php-zakazy',
    h1: 'Заказы на PHP',
    title: 'Заказы на PHP — Laravel, доработка сайтов, бэкенд',
    description: 'Свежие заказы на PHP: Laravel, Yii, доработка сайтов, API и интеграции. Бюджеты и ссылки на заказчика.',
    intro: 'Бэкенд и доработка сайтов на PHP: Laravel, Yii, самописные CMS.',
    about:
      'Доработка и поддержка сайтов на PHP, проекты на Laravel и Yii, интеграции по API, исправление ошибок и перенос на новую версию PHP. Большая часть заказов — поддержка уже работающих проектов.',
    q: 'php',
    type: 'gig',
  },
  {
    slug: 'igry-unity-zakazy',
    h1: 'Заказы на разработку игр',
    title: 'Заказы на разработку игр — Unity, Unreal, игровая графика',
    description: 'Заказы на разработку игр на Unity и Unreal, игровую графику, 3D-модели и геймдизайн.',
    intro: 'Геймдев: игры на Unity и Unreal, 3D, игровая графика.',
    about:
      'Мобильные и браузерные игры, прототипы на Unity и Unreal Engine, 3D-модели, анимация и игровая графика. Заказы приходят с бирж и из каналов для геймдев-фрилансеров.',
    q: 'unity',
    type: 'gig',
  },
  {
    slug: 'testirovanie-zakazy',
    h1: 'Заказы на тестирование',
    title: 'Заказы на тестирование — QA, автотесты, проверка сайтов и приложений',
    description: 'Свежие заказы на тестирование сайтов и приложений: ручное тестирование, автотесты, проверка перед релизом.',
    intro: 'Ручное тестирование и автотесты — заказы для QA-специалистов.',
    about:
      'Проверка сайтов и приложений перед запуском, тест-кейсы, автотесты на Selenium и Playwright, нагрузочное тестирование. Хороший вход во фриланс для начинающих QA.',
    q: 'тестир',
    type: 'gig',
  },
  {
    slug: 'vakansii-python',
    h1: 'Вакансии Python-разработчика',
    title: 'Вакансии Python-разработчика — Django, FastAPI, данные',
    description: 'Свежие вакансии Python-разработчика: бэкенд на Django и FastAPI, данные, автоматизация. Вилки зарплат и формат работы.',
    intro: 'Работа на Python: бэкенд, данные, автоматизация. Вилки и формат работы в каждой карточке.',
    about:
      'Вакансии бэкенд-разработчиков на Django и FastAPI, инженеров данных, специалистов по автоматизации и ML. В карточке видно вилку, город или удалёнку и стек, который ждёт работодатель.',
    q: 'python',
    type: 'job',
  },
  {
    slug: 'vakansii-frontend',
    h1: 'Вакансии фронтенд-разработчика',
    title: 'Вакансии frontend-разработчика — React, Vue, TypeScript',
    description: 'Свежие вакансии фронтенд-разработчика: React, Vue, TypeScript. Зарплатные вилки, удалёнка и офис.',
    intro: 'Фронтенд: React, Vue, TypeScript — свежие вакансии с вилками.',
    about:
      'Вакансии фронтенд-разработчиков на React, Vue и Angular, верстальщиков и fullstack-разработчиков с упором на клиентскую часть. Отфильтровать удалёнку можно на главной ленте.',
    q: 'frontend',
    type: 'job',
  },
  {
    slug: 'vakansii-devops',
    h1: 'Вакансии DevOps-инженера',
    title: 'Вакансии DevOps — Kubernetes, CI/CD, облака',
    description: 'Свежие вакансии DevOps и SRE: Kubernetes, CI/CD, облака, мониторинг. Вилки зарплат и формат работы.',
    intro: 'DevOps и SRE: Kubernetes, CI/CD, облака — вакансии с вилками.',
    about:
      'Вакансии DevOps-инженеров, SRE и системных администраторов: Kubernetes, Docker, CI/CD, Terraform, мониторинг, облака. Часть вакансий полностью удалённая.',
    q: 'devops',
    type: 'job',
  },
  {
    slug: 'vakansii-analitik',
    h1: 'Вакансии аналитика',
    title: 'Вакансии аналитика — системный, бизнес- и аналитик данных',
    description: 'Свежие вакансии аналитиков: системный и бизнес-аналитик, аналитик данных, продуктовый аналитик. Вилки и формат работы.',
    intro: 'Системные, бизнес- и продуктовые аналитики, аналитики данных.',
    about:
      'Вакансии системных и бизнес-аналитиков, аналитиков данных и продуктовых аналитиков: SQL, BI, требования, A/B-тесты. Вилка и формат работы указаны в карточке.',
    q: 'аналитик',
    type: 'job',
  },
  {
    slug: 'vakansii-testirovshchik',
    h1: 'Вакансии тестировщика',
    title: 'Вакансии тестировщика — QA, ручное и автоматизированное тестирование',
    description: 'Свежие вакансии тестировщиков: ручное тестирование, автотесты, QA-инженеры. Вилки зарплат, удалёнка и офис.',
    intro: 'QA: ручное тестирование и автоматизация — свежие вакансии.',
    about:
      'Вакансии QA-инженеров и тестировщиков: ручное тестирование, автотесты на Java, Python и JavaScript, нагрузочное тестирование. Есть вакансии для начинающих.',
    q: 'тестир',
    type: 'job',
  },
  {
    slug: 'vakansii-dizaynera',
    h1: 'Вакансии дизайнера',
    title: 'Вакансии дизайнера — UI/UX, продуктовый и графический дизайн',
    description: 'Свежие вакансии дизайнеров: UI/UX, продуктовый, графический и моушн-дизайн. Вилки зарплат и формат работы.',
    intro: 'UI/UX, продуктовые и графические дизайнеры — вакансии с вилками.',
    about:
      'Вакансии продуктовых и UI/UX-дизайнеров, графических дизайнеров и моушн-дизайнеров в студиях, агентствах и продуктовых компаниях. Заказы для дизайнеров на фрилансе собраны в разделе «Заказы на дизайн».',
    q: 'дизайнер',
    type: 'job',
  },
];

export function findCatalogEntry(slug: string): CatalogEntry | undefined {
  return SEO_CATALOG.find((entry) => entry.slug === slug);
}

function leadRow(lead: Lead, baseUrl: string): string {
  // Rows open the lead page on the hub: it carries the details, the score and the link to the source.
  const href = `${baseUrl}/leads/${encodeURIComponent(lead.id)}`;
  const meta = [
    lead.city,
    typeof lead.budget === 'number'
      ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(lead.budget)} ${!lead.currency || lead.currency === 'RUB' ? '₽' : lead.currency}`
      : undefined,
    lead.type === 'job' ? 'вакансия' : 'заказ',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<a class="row" href="${escapeHtml(href)}">
        <div>
          <div class="row-title">${escapeHtml(lead.title)}</div>
          <div class="row-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="row-side">${escapeHtml(String(lead.score))}</div>
      </a>`;
}

function feedHrefOf(entry: CatalogEntry): string {
  return `/feed.rss?${new URLSearchParams({
    ...(entry.q ? { q: entry.q } : {}),
    ...(entry.skill ? { skill: entry.skill } : {}),
    ...(entry.type ? { type: entry.type } : {}),
  }).toString()}`;
}

/** Questions every catalog page answers; the FAQ page adds the project-wide ones. */
function catalogFaq(entry: CatalogEntry): Array<[string, string]> {
  const what = entry.type === 'job' ? 'вакансии' : 'заказы';
  return [
    [
      `Откуда берутся ${what} на этой странице?`,
      `Из открытых источников: бирж фриланса, сайтов вакансий, RSS-лент и Telegram-каналов, а также от участников, которые добавляют публикации по ссылке или через расширение. Источники опрашиваются автоматически, обычно раз в несколько минут.`,
    ],
    [
      `Нужно ли платить, чтобы откликнуться?`,
      `Нет. openradar не берёт денег за доступ и отклики: в карточке есть ссылка на первоисточник и контакты автора, вы пишете заказчику напрямую.`,
    ],
    [
      'Как получать новые публикации по этой теме?',
      'Подпишитесь на RSS-ленту этой страницы в любом RSS-ридере или в Telegram-боте для RSS. Новые публикации появятся там без захода на сайт.',
    ],
    [
      'Почему у публикаций разная оценка?',
      'Оценка от 0 до 100 растёт за указанный бюджет, понятное описание задачи, нужные навыки и прямой контакт. Закрытые и устаревшие публикации из ленты убираются.',
    ],
  ];
}

function faqHtml(items: Array<[string, string]>): string {
  return `<div class="faq">${items
    .map(([q, a]) => `<details><summary>${escapeHtml(q)}</summary><p>${escapeHtml(a)}</p></details>`)
    .join('')}</div>`;
}

function faqJsonLd(items: Array<[string, string]>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

function breadcrumbsJsonLd(baseUrl: string, items: Array<[string, string]>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item: `${baseUrl}${path}`,
    })),
  };
}

function ldScripts(...blocks: Array<Record<string, unknown>>): string {
  return blocks.map((block) => `<script type="application/ld+json">\n${jsonForScript(block)}\n</script>`).join('\n');
}

export function renderCatalogPage(options: {
  entry: CatalogEntry;
  leads: Lead[];
  baseUrl: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
}): string {
  const { entry, leads, baseUrl, version } = options;
  const canonical = `${baseUrl}/catalog/${entry.slug}`;
  const feedHref = feedHrefOf(entry);
  const list = leads.length
    ? leads.map((lead) => leadRow(lead, baseUrl)).join('')
    : `<div class="empty"><h2>Пока пусто</h2><p>Новые публикации появятся здесь в течение нескольких минут — источники опрашиваются автоматически.</p></div>`;
  const faq = catalogFaq(entry);
  // Same kind first, so a page on orders links to other orders before vacancies.
  const related = SEO_CATALOG.filter((other) => other.slug !== entry.slug)
    .sort((a, b) => Number(b.type === entry.type) - Number(a.type === entry.type))
    .slice(0, 10);

  const body = `
<nav class="crumbs" aria-label="Навигация"><a href="/">openradar</a> / <a href="/catalog">Категории</a> / ${escapeHtml(entry.h1)}</nav>
<div class="page-head">
  <div>
    <h1>${escapeHtml(entry.h1)}</h1>
    <p class="muted small">${escapeHtml(entry.intro)}</p>
  </div>
  <div class="actions">
    <a class="btn ghost" href="${escapeHtml(feedHref)}" rel="noopener">RSS-лента</a>
    <a class="btn" href="/">Все заказы</a>
  </div>
</div>
<div class="list">${list}</div>
<section class="prose">
  <h2>Что здесь</h2>
  <p>${escapeHtml(entry.about)}</p>
  <p>openradar — открытая база заказов и вакансий без платных тарифов. Код проекта открыт, любой может запустить свой узел и подключить свои источники. <a href="/about">Подробнее о проекте</a>.</p>
  <h2>Вопросы</h2>
  ${faqHtml(faq)}
  <h2>Похожие разделы</h2>
  <div class="chip-links">${related.map((other) => `<a href="/catalog/${escapeHtml(other.slug)}">${escapeHtml(other.h1)}</a>`).join('')}<a href="/catalog">Все категории</a></div>
</section>`;

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: entry.h1,
    itemListElement: leads.slice(0, 20).map((lead, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${baseUrl}/leads/${lead.id}`,
      name: lead.title,
    })),
  };

  return layout({
    auth: options.auth,
    lang: options.lang,
    title: entry.title,
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(entry.description)}">
<meta property="og:description" content="${escapeHtml(entry.description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(entry.h1)} — RSS" href="${escapeHtml(feedHref)}">
${ldScripts(
  breadcrumbsJsonLd(baseUrl, [['openradar', '/'], ['Категории', '/catalog'], [entry.h1, `/catalog/${entry.slug}`]]),
  ...(leads.length ? [itemList] : []),
  faqJsonLd(faq),
)}`,
  });
}

/** Index of every landing page, grouped into orders and vacancies. */
export function renderCatalogIndex(options: { baseUrl: string; version: string; auth?: AuthDisplay; lang?: SupportedLang }): string {
  const { baseUrl, version } = options;
  const card = (entry: CatalogEntry): string =>
    `<a class="catalog-card" href="/catalog/${escapeHtml(entry.slug)}"><b>${escapeHtml(entry.h1)}</b><span>${escapeHtml(entry.intro)}</span></a>`;
  const gigs = SEO_CATALOG.filter((entry) => entry.type !== 'job');
  const jobs = SEO_CATALOG.filter((entry) => entry.type === 'job');
  const description =
    'Все разделы openradar: заказы для фрилансеров по направлениям и IT-вакансии по специальностям. У каждого раздела своя RSS-лента.';
  const body = `
<nav class="crumbs" aria-label="Навигация"><a href="/">openradar</a> / Категории</nav>
<div class="page-head"><div>
  <h1>Категории заказов и вакансий</h1>
  <p class="muted small">${escapeHtml(description)}</p>
</div></div>
<h2>Заказы для фрилансеров</h2>
<div class="catalog-grid">${gigs.map(card).join('')}</div>
<h2 style="margin-top:32px">Вакансии</h2>
<div class="catalog-grid">${jobs.map(card).join('')}</div>`;
  return layout({
    auth: options.auth,
    lang: options.lang,
    title: 'Категории заказов и вакансий',
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/catalog">
${ldScripts(breadcrumbsJsonLd(baseUrl, [['openradar', '/'], ['Категории', '/catalog']]))}`,
  });
}

const REPO_URL = 'https://github.com/MikhailSagalaev/openradar';

const ABOUT_EN = `
<nav class="crumbs" aria-label="Breadcrumbs"><a href="/">openradar</a> / About</nav>
<div class="page-head"><div>
  <h1>About openradar</h1>
  <p class="muted small">An open base of freelance orders and vacancies, gathered by parsers, nodes and people.</p>
</div></div>
<section class="prose" style="margin-top:0">
  <p>Finding an order or a job today means keeping five boards and a dozen Telegram channels open, and paying a subscription for fast access to replies. openradar gathers these posts into one feed and charges nothing for access or replies: the contacts are in the post, and you write to the client directly.</p>

  <h2>Where the posts come from</h2>
  <ul>
    <li>Freelance boards: FL.ru, Kwork, Freelancehunt.</li>
    <li>Vacancies: hh.ru, Habr Career, the state portal «Работа России», company career pages on Greenhouse, Lever and Ashby, We Work Remotely, RemoteOK and other remote boards.</li>
    <li>Telegram channels with orders and vacancies, public and private.</li>
    <li>Participants: posts added by link, through the <a href="/extension">browser extension</a> and from their own nodes.</li>
  </ul>
  <p>The same post found in several places is shown as one card. Closed orders and stale vacancies leave the feed: the server rechecks source pages, and participants mark closed posts.</p>

  <h2>Scoring and moderation</h2>
  <p>Every post gets a score from 0 to 100 for a stated budget or pay range, a clear description, the skills needed and a direct contact. Participants vote: useful, spam, scam, closed. A vote from a participant with a high rating weighs more, so spam and scams leave the feed faster.</p>

  <h2>Why it is free</h2>
  <p>The participants fill the feed. Those who bring posts see the feed earlier: a guest with a delay, a member signed in with GitHub sooner, active participants almost at once. There is no paid plan and none is planned.</p>

  <h2>Open source</h2>
  <p>The code is open under AGPL-3.0. Anyone can run a node at home or on a server with their own sources, filters and Telegram notifications. Nodes can send posts to the shared base, each one signed with the participant's key.</p>
  <ul>
    <li><a href="${REPO_URL}" target="_blank" rel="noopener">Source code on GitHub</a></li>
    <li><a href="${REPO_URL}/blob/main/docs/GETTING_STARTED.md" target="_blank" rel="noopener">How to run your own node</a></li>
    <li><a href="${REPO_URL}/blob/main/docs/PROTOCOL.md" target="_blank" rel="noopener">The protocol between nodes</a></li>
  </ul>

  <h2>How to use it</h2>
  <ul>
    <li>Search the feed and filter by skills, budget and remote work on the <a href="/">home page</a>.</li>
    <li>Subscribe to the RSS of any search or <a href="/catalog">category</a>.</li>
    <li>Add orders you find by link or with the <a href="/extension">extension</a>.</li>
    <li>Connect the feed to your tools through the HTTP API and the MCP server.</li>
    <li>Read the <a href="/en/research">research on the Russian IT and freelance market</a>.</li>
  </ul>
  <p>Questions left? See the <a href="/faq">FAQ</a> or <a href="${REPO_URL}/issues" target="_blank" rel="noopener">write on GitHub</a>.</p>
</section>`;

export function renderAboutPage(options: { baseUrl: string; version: string; auth?: AuthDisplay; lang?: SupportedLang }): string {
  const { baseUrl, version } = options;
  if (options.lang === 'en') {
    const descriptionEn = 'openradar is an open base of freelance orders and vacancies: posts from boards, job sites and Telegram channels in one feed, with no paid plans. Open source, your own node, RSS and API.';
    return layout({
      auth: options.auth,
      lang: 'en',
      title: 'About',
      version,
      body: ABOUT_EN,
      head: `<meta name="description" content="${escapeHtml(descriptionEn)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/about">`,
    });
  }
  const description =
    'openradar — открытая база заказов и вакансий: собирает публикации с бирж, сайтов вакансий и Telegram-каналов в одну ленту без платных тарифов. Открытый код, свой узел, RSS и API.';
  const body = `
<nav class="crumbs" aria-label="Навигация"><a href="/">openradar</a> / О проекте</nav>
<div class="page-head"><div>
  <h1>О проекте openradar</h1>
  <p class="muted small">Открытая база заказов и вакансий, которую собирают парсеры, узлы и люди.</p>
</div></div>
<section class="prose" style="margin-top:0">
  <p>Чтобы найти заказ или работу, сегодня приходится держать открытыми пять бирж и десяток Telegram-каналов, а за быстрый доступ к откликам платить подписку. openradar собирает эти публикации в одну ленту и не берёт денег ни за доступ, ни за отклики: контакты есть в публикации, заказчику вы пишете напрямую.</p>

  <h2>Откуда публикации</h2>
  <ul>
    <li>Биржи фриланса: FL.ru, Kwork, Freelancehunt.</li>
    <li>Вакансии: hh.ru, Хабр Карьера, портал «Работа России», We Work Remotely, Jobicy, RemoteOK.</li>
    <li>Telegram-каналы с заказами и вакансиями, публичные и закрытые.</li>
    <li>Участники: публикации по ссылке, через <a href="/extension">расширение для браузера</a> и от своих узлов.</li>
  </ul>
  <p>Одна и та же публикация, найденная в разных местах, показывается одной карточкой. Закрытые заказы и устаревшие вакансии убираются из ленты: сервер проверяет страницы источников, а участники отмечают закрытые публикации.</p>

  <h2>Оценка и модерация</h2>
  <p>Каждая публикация получает оценку от 0 до 100: за указанный бюджет или вилку, понятное описание, нужные навыки и прямой контакт. Участники голосуют: «полезно», «мусор», «мошенники», «закрыто». Голос участника с высоким рейтингом весит больше, поэтому мусор и мошеннические заказы уходят из ленты быстрее.</p>

  <h2>Почему бесплатно</h2>
  <p>Ленту наполняют сами участники. Кто приносит публикации, видит ленту раньше: гость — с задержкой, вошедший через GitHub — быстрее, активные участники — почти сразу. Платного тарифа нет и не планируется.</p>

  <h2>Открытый код</h2>
  <p>Код openradar открыт под лицензией AGPL-3.0. Любой может запустить свой узел дома или на сервере, подключить свои источники, фильтры и уведомления в Telegram. Узлы могут отправлять публикации в общую базу, каждая публикация подписана ключом участника.</p>
  <ul>
    <li><a href="${REPO_URL}" target="_blank" rel="noopener">Исходный код на GitHub</a></li>
    <li><a href="${REPO_URL}/blob/main/docs/GETTING_STARTED.md" target="_blank" rel="noopener">Как запустить свой узел</a></li>
    <li><a href="${REPO_URL}/blob/main/docs/PROTOCOL.md" target="_blank" rel="noopener">Протокол обмена между узлами</a></li>
  </ul>

  <h2>Как пользоваться</h2>
  <ul>
    <li>Ищите по ленте и фильтруйте по навыкам, бюджету и удалёнке на <a href="/">главной</a>.</li>
    <li>Подпишитесь на RSS любого поиска или <a href="/catalog">раздела</a>.</li>
    <li>Добавляйте найденные заказы по ссылке или через <a href="/extension">расширение</a>.</li>
    <li>Подключайте ленту к своим сервисам через HTTP API и MCP-сервер.</li>
  </ul>
  <p>Остались вопросы — загляните в <a href="/faq">вопросы и ответы</a> или <a href="${REPO_URL}/issues" target="_blank" rel="noopener">напишите на GitHub</a>.</p>
</section>`;
  const organization = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'openradar',
    url: `${baseUrl}/`,
    description,
    sameAs: [REPO_URL],
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
  return layout({
    auth: options.auth,
    title: 'О проекте',
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(description)}">
<meta property="og:description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/about">
${ldScripts(organization, breadcrumbsJsonLd(baseUrl, [['openradar', '/'], ['О проекте', '/about']]))}`,
  });
}

export const SITE_FAQ: Array<[string, string]> = [
  [
    'Что такое openradar?',
    'Открытая база заказов для фрилансеров и вакансий. Публикации с бирж, сайтов вакансий и Telegram-каналов собираются в одну ленту, дубликаты склеиваются, мусор отсеивается голосами участников.',
  ],
  [
    'Это бесплатно?',
    'Да. Платного тарифа нет: ни за доступ к ленте, ни за отклики. Контакты заказчика есть в публикации или по ссылке на первоисточник.',
  ],
  [
    'Почему я вижу публикации с задержкой?',
    'Гости видят ленту с задержкой в несколько часов и без контактов. После входа через GitHub задержка меньше и контакты открыты, а участники, которые сами добавляют публикации, видят ленту почти сразу.',
  ],
  [
    'Как добавить заказ или вакансию?',
    'Войдите через GitHub и нажмите «Добавить по ссылке» или установите расширение для браузера: оно отправляет страницу или выделенный текст в один клик.',
  ],
  [
    'Как получать уведомления о новых заказах?',
    'У любого поиска и раздела есть RSS-лента: подключите её в RSS-ридере или в Telegram-боте для RSS. Владельцы своего узла могут настроить уведомления прямо в Telegram.',
  ],
  [
    'Что значит оценка у публикации?',
    'Число от 0 до 100. Оно растёт за указанный бюджет или вилку, понятное описание задачи, нужные навыки и прямой контакт заказчика.',
  ],
  [
    'Что делать с мошенническим заказом?',
    'Нажмите «Мошенники» на странице публикации. Голоса участников с рейтингом убирают такие публикации из ленты.',
  ],
  [
    'Почему заказ уже закрыт?',
    'Сервер периодически проверяет страницы источников, а участники отмечают закрытые публикации. Закрытые и устаревшие публикации уходят из ленты, но остаются доступны по прямой ссылке с пометкой.',
  ],
  [
    'Можно ли подключить свой Telegram-канал или чат?',
    'Публичные каналы подключаются как источник напрямую. Закрытые каналы и чаты владелец узла подключает через свой Telegram-аккаунт. Предложить источник для общей базы можно на GitHub.',
  ],
  [
    'Можно ли запустить openradar у себя?',
    'Да, код открыт под лицензией AGPL-3.0. Узел запускается на компьютере или сервере, хранит данные у вас и по желанию делится публикациями с общей базой.',
  ],
];

export const SITE_FAQ_EN: Array<[string, string]> = [
  ['What is openradar?', 'An open base of freelance orders and vacancies. Posts from boards, job sites and Telegram channels are gathered into one feed, duplicates are merged and spam is weeded out by participants\' votes.'],
  ['Is it free?', 'Yes. There is no paid plan, neither for the feed nor for replies. The client\'s contacts are in the post or behind the link to the original.'],
  ['Why do I see posts with a delay?', 'Guests see the feed a few hours late and without contacts. Signed in with GitHub, the delay is shorter and contacts are open; participants who add posts themselves see the feed almost at once.'],
  ['How do I add an order or a vacancy?', 'Sign in with GitHub and press «Submit by URL», or install the browser extension: it sends a page or the selected text in one click.'],
  ['How do I get notified of new orders?', 'Every search and category has an RSS feed: add it to an RSS reader or an RSS bot in Telegram. Node owners can set up notifications straight to Telegram.'],
  ['What does the score of a post mean?', 'A number from 0 to 100. It grows for a stated budget or pay range, a clear task, the skills needed and a direct contact.'],
  ['What do I do with a scam?', 'Press «Scam» on the post page. Votes of participants with a rating take such posts out of the feed.'],
  ['Why is an order already closed?', 'The server rechecks source pages and participants mark closed posts. Closed and stale posts leave the feed but stay available by direct link with a mark.'],
  ['Can I connect my Telegram channel or chat?', 'Public channels are added as a source directly. A node owner connects private channels and chats through their own Telegram account. You can suggest a source for the shared base on GitHub.'],
  ['Can I run openradar myself?', 'Yes, the code is open under AGPL-3.0. A node runs on a computer or a server, keeps your data with you and, if you wish, shares posts with the shared base.'],
];

export function renderFaqPage(options: { baseUrl: string; version: string; auth?: AuthDisplay; lang?: SupportedLang }): string {
  const { baseUrl, version } = options;
  if (options.lang === 'en') {
    const descriptionEn = 'Answers about openradar: where the orders and vacancies come from, why it is free, how to add posts and get notified.';
    return layout({
      auth: options.auth,
      lang: 'en',
      title: 'FAQ',
      version,
      body: `
<nav class="crumbs" aria-label="Breadcrumbs"><a href="/">openradar</a> / FAQ</nav>
<div class="page-head"><div>
  <h1>Questions and answers</h1>
  <p class="muted small">${escapeHtml(descriptionEn)}</p>
</div></div>
<section class="prose" style="margin-top:0">
  ${faqHtml(SITE_FAQ_EN)}
  <p style="margin-top:20px">No answer here? Read <a href="/about">about the project</a> or <a href="${REPO_URL}/issues" target="_blank" rel="noopener">ask on GitHub</a>.</p>
</section>`,
      head: `<meta name="description" content="${escapeHtml(descriptionEn)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/faq">`,
    });
  }
  const description = 'Ответы на частые вопросы об openradar: откуда заказы и вакансии, почему бесплатно, как добавлять публикации и получать уведомления.';
  const body = `
<nav class="crumbs" aria-label="Навигация"><a href="/">openradar</a> / Вопросы и ответы</nav>
<div class="page-head"><div>
  <h1>Вопросы и ответы</h1>
  <p class="muted small">${escapeHtml(description)}</p>
</div></div>
<section class="prose" style="margin-top:0">
  ${faqHtml(SITE_FAQ)}
  <p style="margin-top:20px">Не нашли ответ? Прочитайте <a href="/about">о проекте</a> или <a href="${REPO_URL}/issues" target="_blank" rel="noopener">задайте вопрос на GitHub</a>.</p>
</section>`;
  return layout({
    auth: options.auth,
    title: 'Вопросы и ответы',
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/faq">
${ldScripts(faqJsonLd(SITE_FAQ), breadcrumbsJsonLd(baseUrl, [['openradar', '/'], ['Вопросы и ответы', '/faq']]))}`,
  });
}

/** A plain-text map of the site for AI assistants (llmstxt.org). */
/** Participants and sources of the last 30 days: the network made visible. */
/** A participant's public page: the rating, the number of posts and the latest of them. */
export function renderParticipantPage(options: {
  baseUrl: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  handle: string;
  since: string;
  points: number;
  total: number;
  tier: string;
  posts: Lead[];
}): string {
  const ru = options.lang !== 'en';
  const handle = escapeHtml(options.handle);
  const rows = options.posts.map((lead) => leadRow(lead, options.baseUrl)).join('\n');
  const body = `
<nav class="crumbs" aria-label="${ru ? 'Навигация' : 'Navigation'}"><a href="/network">${ru ? 'Участники' : 'Participants'}</a> / @${handle}</nav>
<div class="page-head"><div>
  <h1>@${handle}</h1>
  <p class="muted small"><a href="https://github.com/${handle}" rel="noopener nofollow">GitHub</a> · ${ru ? 'в openradar с' : 'on openradar since'} ${escapeHtml(options.since.slice(0, 10))}</p>
</div></div>
<section class="profile">
  <p>${ru ? 'Постов принесено' : 'Posts brought'}: <strong>${options.total}</strong> · ${ru ? 'очков за 30 дней' : 'points over 30 days'}: <strong>${Math.round(options.points * 10)}</strong> · ${ru ? 'уровень' : 'tier'}: <strong>${escapeHtml(options.tier)}</strong></p>
  <h2>${ru ? 'Последние публикации' : 'Latest posts'}</h2>
  ${rows ? `<div class="list">${rows}</div>` : `<p class="muted">${ru ? 'Пока нет публикаций, открытых всем.' : 'No public posts yet.'}</p>`}
</section>`;
  return layout({ title: `@${options.handle}`, version: options.version, body, auth: options.auth, lang: options.lang });
}

export function renderSourceQualityPage(options: {
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  days: number;
  rows: Array<{ id: string; title: string; enabled: boolean; quality: SourceQuality; input?: SourceQualityInput; issues?: number }>;
}): string {
  const ru = options.lang !== 'en';
  const percent = (value: number | undefined): string => (value === undefined ? '—' : `${Math.round(value * 100)}%`);
  const rows = options.rows.map(({ id, title, enabled, quality, input, issues }) => `<tr>
    <td><a href="/sources/${escapeHtml(encodeURIComponent(id))}">${escapeHtml(title)}</a>${enabled ? '' : ` <span class="muted small">${ru ? 'выключен' : 'off'}</span>`}</td>
    <td class="num"><strong>${quality.score ?? '—'}</strong></td>
    <td>${quality.grade === 'new' ? (ru ? 'мало данных' : 'too new') : quality.grade}</td>
    <td class="num">${percent(quality.parts.access)}</td>
    <td class="num">${input?.inserted ?? 0}</td>
    <td class="num">${percent(quality.parts.alive)}</td>
    <td class="num">${percent(quality.parts.complete)}</td>
    <td class="num">${percent(quality.parts.trust)}</td>
    <td class="num">${issues ?? 0}</td>
  </tr>`).join('\n');
  const body = `
<nav class="crumbs" aria-label="${ru ? 'Навигация' : 'Navigation'}"><a href="/sources">${ru ? 'Источники' : 'Sources'}</a> / ${ru ? 'Качество' : 'Quality'}</nav>
<div class="page-head"><div>
  <h1>${ru ? 'Качество источников' : 'Source quality'}</h1>
  <p class="muted small">${ru
    ? `За ${options.days} дней: отвечает ли источник, приносит ли новое, живы ли посты, полны ли они и что сказали читатели.`
    : `Over ${options.days} days: does a source answer, bring new posts, stay alive, carry full posts, and what readers said.`} <a href="https://github.com/MikhailSagalaev/openradar/blob/main/docs/QUALITY.md" rel="noopener">${ru ? 'Как считается' : 'How it is counted'}</a></p>
</div></div>
<section class="profile">
  <table class="profile-table">
    <thead><tr><th>${ru ? 'Источник' : 'Source'}</th><th>${ru ? 'Оценка' : 'Score'}</th><th>${ru ? 'Класс' : 'Grade'}</th><th>${ru ? 'Отвечает' : 'Answers'}</th><th>${ru ? 'Новых' : 'New'}</th><th>${ru ? 'Живых' : 'Alive'}</th><th>${ru ? 'Полнота' : 'Complete'}</th><th>${ru ? 'Читатели' : 'Readers'}</th><th>${ru ? 'Жалобы на сбор' : 'Reading issues'}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
  return layout({ title: ru ? 'Качество источников' : 'Source quality', version: options.version, active: 'sources', body, auth: options.auth, lang: options.lang });
}

export function renderLabelPage(options: {
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  lead?: Lead;
  sourceTitle?: string;
  stats: Record<string, number>;
}): string {
  const ru = options.lang !== 'en';
  const names: Array<[string, string]> = ru
    ? [['good', 'Хороший пост'], ['closed', 'Уже закрыт'], ['wrong_type', 'Не тот тип'], ['junk', 'Мусор']]
    : [['good', 'Good post'], ['closed', 'Already closed'], ['wrong_type', 'Wrong type'], ['junk', 'Junk']];
  const total = Object.values(options.stats).reduce((sum, count) => sum + count, 0);
  const counts = names.map(([key, name]) => `${escapeHtml(name)}: ${options.stats[key] ?? 0}`).join(' · ');
  const lead = options.lead;
  const buttons = lead
    ? names.map(([key, name]) => `<button class="btn" name="verdict" value="${key}" type="submit">${escapeHtml(name)}</button>`).join(' ')
    : '';
  const body = `
<div class="page-head"><div>
  <h1>${ru ? 'Ручная проверка постов' : 'Checking posts by hand'}</h1>
  <p class="muted small">${ru ? `Проверено: ${total} из 300. ` : `Checked: ${total} of 300. `}${counts}</p>
</div></div>
<section class="profile">
  ${lead ? `
  <p class="muted small">${escapeHtml(options.sourceTitle ?? '')} · ${lead.type === 'job' ? (ru ? 'вакансия' : 'vacancy') : (ru ? 'заказ' : 'order')}${lead.url ? ` · <a href="${escapeHtml(lead.url)}" target="_blank" rel="noopener noreferrer">${ru ? 'Открыть оригинал' : 'Open the original'}</a>` : ''}</p>
  <h2>${escapeHtml(lead.title)}</h2>
  <p style="white-space:pre-wrap">${escapeHtml(lead.text.slice(0, 1500))}</p>
  <form method="post" action="/admin/labels"><input type="hidden" name="id" value="${escapeHtml(lead.id)}">${buttons}</form>` : `<p class="muted">${ru ? 'Постов для проверки нет.' : 'Nothing to check.'}</p>`}
</section>`;
  return layout({ title: ru ? 'Ручная проверка' : 'Hand check', version: options.version, body, auth: options.auth, lang: options.lang, head: '<meta name="robots" content="noindex">' });
}

export function renderDecisionsPage(options: {
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  stats: { total: number; tokens: number; byKind: Record<string, number>; closed: number; scam: number; lastAt?: string };
  score: DecisionScore;
  rows: Array<{ lead: Lead; decision: ModelDecision; reason: string }>;
  applied: Array<{ lead: Lead; decision: ModelDecision }>;
  reviews: { total: number; reviewers: number };
  queue: Array<{ lead: Lead; verdict: string }>;
  notes: Array<{ leadId: string; title: string; source: string; issues: string[]; note?: string }>;
}): string {
  const { stats, score } = options;
  const share = (part: number, whole: number): string => (whole ? `${Math.round((part / whole) * 100)}% (${part} из ${whole})` : '—');
  const names: Record<string, string> = { closed: 'Похоже закрыт', scam: 'Похоже на мошенничество', other: 'Не работа', resume: 'Резюме', type: 'Другой тип' };
  const flags = ([['Закрытые', score.closed], ['Мусор', score.junk], ['Мошенничество', score.scam], ['Тип поста', score.type]] as Array<[string, FlagScore]>)
    .map(([name, flag]) => `<tr><td>${name}</td><td class="num">${share(flag.right, flag.flagged)}</td><td class="num">${share(flag.caught, flag.actual)}</td></tr>`).join('\n');
  const rows = options.rows.map(({ lead, decision, reason }) => `<tr>
    <td><a href="/leads/${escapeHtml(encodeURIComponent(lead.id))}">${escapeHtml(lead.title.slice(0, 90))}</a></td>
    <td>${escapeHtml(names[reason] ?? reason)}</td>
    <td class="num">${decision.kindConfidence.toFixed(2)}</td>
    <td class="num">${decision.closed.toFixed(2)}</td>
    <td class="num">${decision.scam.toFixed(2)}</td>
  </tr>`).join('\n');
  const cost = (stats.tokens * 0.04) / 1_000_000;
  const body = `
<div class="page-head"><div>
  <h1>Решения модели</h1>
  <p class="muted small">Уверенные ответы убирают посты и меняют оценку. Любое действие можно вернуть. <a href="/admin/labels">Проверить посты вручную</a></p>
</div></div>
<section class="profile">
  <p>Отвечено постов: <strong>${stats.total}</strong> · токенов: ${stats.tokens} · примерно $${cost.toFixed(3)} · закрытых: ${stats.closed} · мошенничество: ${stats.scam}</p>
  <p class="muted small">${Object.entries(stats.byKind).map(([kind, total]) => `${escapeHtml(kind)}: ${total}`).join(' · ')}</p>
  <h2>Сверка с ручными метками: ${score.n}</h2>
  ${score.n ? `<table class="profile-table"><thead><tr><th>Флаг</th><th>Модель права</th><th>Находит</th></tr></thead><tbody>${flags}</tbody></table>
  <p class="muted small">Ошибка вероятности закрытия (Brier): ${score.closedBrier?.toFixed(3) ?? '—'}. Ниже лучше, 0,25 это монетка.</p>` : '<p class="muted">Пока нет ручных меток на постах с ответом модели.</p>'}
  <h2>Что модель убрала из ленты: ${options.applied.length}</h2>
  ${options.applied.length ? `<table class="profile-table"><thead><tr><th>Пост</th><th>Действие</th><th>Мошенн.</th><th>Закрыт</th><th></th></tr></thead><tbody>${options.applied.map(({ lead, decision }) => `<tr>
    <td><a href="/leads/${escapeHtml(encodeURIComponent(lead.id))}">${escapeHtml(lead.title.slice(0, 80))}</a></td>
    <td>${escapeHtml(decision.applied ?? '')}</td><td class="num">${decision.scam.toFixed(2)}</td><td class="num">${decision.closed.toFixed(2)}</td>
    <td><form method="post" action="/admin/decisions/overrule"><input type="hidden" name="id" value="${escapeHtml(lead.id)}"><button class="btn" type="submit">Вернуть</button></form></td>
  </tr>`).join('\n')}</tbody></table>` : '<p class="muted">Пока ничего.</p>'}
  <p class="muted small">Оценок читателей: ${options.reviews.total}, читателей: ${options.reviews.reviewers}.</p>
  <h2>Читатели считают проблемным: ${options.queue.length}</h2>
  ${options.queue.length ? `<table class="profile-table"><thead><tr><th>Пост</th><th>Решение читателей</th></tr></thead><tbody>${options.queue.map(({ lead, verdict }) => `<tr><td><a href="/leads/${escapeHtml(encodeURIComponent(lead.id))}">${escapeHtml(lead.title.slice(0, 90))}</a></td><td>${escapeHtml(verdict)}</td></tr>`).join('\n')}</tbody></table>` : '<p class="muted">Пока нет.</p>'}
  <h2>Что не так со сбором: ${options.notes.length}</h2>
  ${options.notes.length ? `<table class="profile-table"><thead><tr><th>Источник</th><th>Пост</th><th>Проблема</th></tr></thead><tbody>${options.notes.map((n) => `<tr><td>${escapeHtml(n.source.slice(0, 40))}</td><td><a href="/leads/${escapeHtml(encodeURIComponent(n.leadId))}">${escapeHtml(n.title.slice(0, 70))}</a></td><td>${escapeHtml([...n.issues.map((i) => ISSUE_NAMES[i] ?? i), n.note].filter(Boolean).join(', '))}</td></tr>`).join('\n')}</tbody></table>` : '<p class="muted">Пока нет.</p>'}
  <h2>Где модель спорит с лентой</h2>
  ${rows ? `<table class="profile-table"><thead><tr><th>Пост</th><th>Причина</th><th>Уверенность</th><th>Закрыт</th><th>Мошенн.</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">Расхождений нет.</p>'}
</section>`;
  return layout({ title: 'Решения модели', version: options.version, body, auth: options.auth, lang: options.lang, head: '<meta name="robots" content="noindex">' });
}

const REVIEW_ANSWERS_RU: Array<[string, string, string]> = [
  ['not_work', 'Не работа', 'Реклама, курс, резюме, новость, текст без предложения работы'],
  ['suspicious', 'Подозрительно', 'Деньги вперёд, большой заработок без навыков, накрутки, подделка документов'],
  ['closed', 'Уже закрыта', 'На оригинале вакансия снята, заказ занят или страница не открывается'],
];

const REVIEW_ANSWERS_EN: Array<[string, string, string]> = [
  ['not_work', 'Not work', 'Ad, course, resume, news, or post with no job offer'],
  ['suspicious', 'Suspicious', 'Upfront fee, high pay with no skills, fake reviews, scam'],
  ['closed', 'Closed', 'Listing expired, gig assigned, or page not found'],
];

const REVIEW_ANSWERS = REVIEW_ANSWERS_RU;

const ISSUE_NAMES_RU: Record<string, string> = { text_cut: 'Обрезан текст', no_pay: 'Нет оплаты, хотя она есть', no_company: 'Нет компании', format: 'Плохое форматирование', duplicate: 'Дубль' };
const ISSUE_NAMES_EN: Record<string, string> = { text_cut: 'Text truncated', no_pay: 'Pay missing', no_company: 'Company missing', format: 'Bad formatting', duplicate: 'Duplicate' };
const ISSUE_NAMES = ISSUE_NAMES_RU;

interface DirectionItem { slug: string; label: string; total?: number }

/** The site's own dropdown, with a search box: long lists are read by typing. */
function directionPicker(name: string, label: string, items: DirectionItem[], selected: string, asLink: boolean, lang?: SupportedLang): string {
  const ru = (lang ?? 'ru') !== 'en';
  const current = items.find((item) => item.slug === selected);
  const rows = items.map((item) => {
    const text = `<span class="custom-dropdown-item-text">${escapeHtml(item.label)}</span>${item.total !== undefined ? `<span class="custom-dropdown-count">${item.total}</span>` : ''}`;
    const cls = `custom-dropdown-item${item.slug === selected ? ' selected' : ''}`;
    return asLink
      ? `<a class="${cls}" role="option" href="/review${item.slug ? `?c=${escapeHtml(encodeURIComponent(item.slug))}` : ''}" data-label="${escapeHtml(item.label.toLowerCase())}">${text}</a>`
      : `<button type="button" class="${cls}" role="option" data-value="${escapeHtml(item.slug)}" data-label="${escapeHtml(item.label.toLowerCase())}">${text}</button>`;
  }).join('\n');
  return `<div class="custom-dropdown review-picker">
    ${asLink ? '' : `<input type="hidden" name="${escapeHtml(name)}" value="">`}
    <button type="button" class="custom-dropdown-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="${escapeHtml(label)}"><span class="custom-dropdown-label">${escapeHtml(current?.label ?? label)}</span></button>
    <div class="custom-dropdown-menu" role="listbox" style="display:none">
      <input type="search" class="review-picker-search" placeholder="${ru ? 'Найти' : 'Search'}" aria-label="${ru ? 'Найти' : 'Search'}">
      ${rows}
    </div>
  </div>`;
}

const REVIEW_SCRIPT = `<script>
(() => {
  document.body.classList.add('page-review');
  const closeAll = () => {
    document.querySelectorAll('.review-picker .custom-dropdown-menu').forEach((m) => { m.style.display = 'none'; });
    document.querySelectorAll('.review-picker .custom-dropdown-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  };
  const closeHelp = () => {
    const modal = document.getElementById('review-help-modal');
    if (modal) modal.style.display = 'none';
  };
  const toggleHelp = () => {
    const modal = document.getElementById('review-help-modal');
    if (!modal) return;
    modal.style.display = modal.style.display === 'none' ? 'flex' : 'none';
  };
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.review-help-trigger')) {
      toggleHelp();
      return;
    }
    if (target?.closest('.review-modal-close') || target?.classList.contains('review-modal-backdrop')) {
      closeHelp();
      return;
    }
    const trigger = target?.closest('.review-picker .custom-dropdown-btn');
    if (trigger) {
      const menu = trigger.parentElement.querySelector('.custom-dropdown-menu');
      const open = menu.style.display !== 'none';
      closeAll();
      if (!open) {
        menu.style.display = 'block';
        trigger.setAttribute('aria-expanded', 'true');
        menu.querySelector('input')?.focus();
      }
      return;
    }
    const item = target?.closest('.review-picker button.custom-dropdown-item');
    if (item) {
      const wrap = item.closest('.review-picker');
      wrap.querySelector('input[type=hidden]').value = item.dataset.value;
      wrap.querySelector('.custom-dropdown-label').textContent = item.querySelector('.custom-dropdown-item-text').textContent;
      closeAll();
      return;
    }
    if (!target?.closest('.review-picker')) closeAll();
  });
  document.addEventListener('input', (event) => {
    if (!(event.target instanceof HTMLInputElement) || !event.target.classList.contains('review-picker-search')) return;
    const query = event.target.value.trim().toLowerCase();
    event.target.parentElement.querySelectorAll('.custom-dropdown-item').forEach((row) => {
      row.style.display = row.dataset.label.includes(query) ? '' : 'none';
    });
  });
  const form = document.querySelector('.review-form');
  const isGuest = Boolean(form && form.dataset.guest === 'true');

  const triggerGuestAuth = () => {
    const leadId = form ? form.querySelector('input[name="id"]')?.value : null;
    const direction = form ? form.querySelector('input[name="c"]')?.value : '';
    const query = new URLSearchParams();
    if (leadId) query.set('show', leadId);
    if (direction) query.set('c', direction);
    const qs = query.toString();
    const returnTo = '/review' + (qs ? ('?' + qs) : '');
    if (typeof openLoginModal === 'function') {
      openLoginModal(returnTo);
    } else {
      window.location.href = '/login?returnTo=' + encodeURIComponent(returnTo);
    }
  };

  if (isGuest && form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      triggerGuestAuth();
    });
    document.querySelectorAll('.review-answers button[name="verdict"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerGuestAuth();
      });
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAll();
      closeHelp();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const isEditing = /INPUT|TEXTAREA|SELECT/.test(event.target.tagName);
    const buttons = document.querySelectorAll('.review-answers button[name="verdict"]');

    if (event.key === 'Enter') {
      if (event.target.classList.contains('review-picker-search')) return;
      event.preventDefault();
      if (isGuest) {
        triggerGuestAuth();
        return;
      }
      const focused = document.activeElement && document.activeElement.matches('.review-ans-btn') ? document.activeElement : buttons[0];
      focused?.click();
      return;
    }

    if (isEditing) return;

    const numMatch = event.key.match(/^[1-5]$/) || (event.code && event.code.match(/^(?:Digit|Numpad)([1-5])$/));
    if (numMatch) {
      event.preventDefault();
      if (isGuest) {
        triggerGuestAuth();
        return;
      }
      const idx = Number(numMatch[1] || event.key) - 1;
      buttons[idx]?.click();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const currentIdx = Array.from(buttons).indexOf(document.activeElement);
      const nextIdx = event.key === 'ArrowDown'
        ? (currentIdx + 1) % buttons.length
        : (currentIdx <= 0 ? buttons.length - 1 : currentIdx - 1);
      buttons[nextIdx]?.focus();
      return;
    }

    if (/^[oOоО]$/.test(event.key)) {
      event.preventDefault();
      document.querySelector('.review-original')?.click();
      return;
    }

    if (/^[zZяЯ]$/.test(event.key)) {
      event.preventDefault();
      document.querySelector('.review-undo-btn')?.click();
      return;
    }

    if (event.key === '?') {
      event.preventDefault();
      toggleHelp();
    }
  });
})();
</script>`;

export function renderReviewPage(options: {
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  lead?: Lead;
  bucket?: string;
  directions: DirectionItem[];
  direction: string;
  mine: number;
  /** The post just answered, for taking the answer back. */
  last?: string;
}): string {
  const ru = (options.lang ?? 'ru') !== 'en';
  const { lead, directions } = options;
  const signedIn = Boolean(options.auth?.handle || options.auth?.isAdmin);
  const shown = directions.find((item) => item.slug === lead?.direction)?.label ?? (ru ? 'Другое' : 'Other');
  const typeName = lead?.type === 'job' ? (ru ? 'Вакансия' : 'Job') : (ru ? 'Заказ' : 'Gig');
  const company = lead ? (lead.company ?? lead.author) : '';
  const salary = lead ? (salaryRange(lead, options.lang ?? 'ru') ?? (typeof lead.budget === 'number' ? formatBudget(lead.budget, lead.currency) : (lead.rawSalary ?? ''))) : '';
  const host = lead?.url ? safeHttpUrl(lead.url)?.replace(/^https?:\/\//, '')?.split('/')[0]?.replace(/^www\./, '') : '';
  const remote = lead?.isRemote ? (ru ? 'Удалённо' : 'Remote') : '';
  const location = [lead?.city, remote].filter(Boolean).join(' · ');
  const relativeDate = lead ? formatRelative(lead.createdAt, options.lang ?? 'ru') : '';
  const metaLine = [host, salary, location, relativeDate].filter(Boolean).join(' · ');
  const formatted = lead ? formatLeadText(lead.text) : { html: '', tags: [] };
  const reviewAnswers = ru ? REVIEW_ANSWERS_RU : REVIEW_ANSWERS_EN;
  const issueNames = ru ? ISSUE_NAMES_RU : ISSUE_NAMES_EN;

  const content = lead ? `
<div class="page-head review-head">
  <div>
    <h1>${escapeHtml(leadTitle(lead))}</h1>
    ${company ? `<p class="lead-company">${escapeHtml(company)}</p>` : ''}
    ${metaLine ? `<p class="muted small">${escapeHtml(metaLine)}</p>` : ''}
  </div>
  <div class="actions lead-actions">
    ${lead.url ? `<a class="btn review-original" href="${escapeHtml(lead.url)}" target="_blank" rel="noopener noreferrer">${ru ? 'Открыть оригинал ↗' : 'Open original ↗'}</a>` : ''}
  </div>
</div>

<div class="detail-grid review-grid">
  <section class="review-lead-col">
    <h2>${lead.type === 'job' ? (ru ? 'Текст вакансии' : 'Job description') : (ru ? 'Текст заказа' : 'Gig description')}</h2>
    <div class="lead-text review-lead-scroll">${formatted.html}</div>
  </section>

  <aside class="review-actions-col">
    <form method="post" action="/review" class="review-form"${signedIn ? '' : ' data-guest="true"'}>
      <input type="hidden" name="id" value="${escapeHtml(lead.id)}">
      <input type="hidden" name="bucket" value="${escapeHtml(options.bucket ?? '')}">
      <input type="hidden" name="c" value="${escapeHtml(options.direction)}">

      <h2>${ru ? 'Решение' : 'Verdict'}</h2>
      <div class="review-shown">
        <div class="review-shown-line">${ru ? 'Мы показали это как:' : 'Shown as:'} <strong>${typeName}</strong> · <strong>${escapeHtml(shown)}</strong></div>
        <details class="review-fix">
          <summary>${ru ? 'Исправить тип или направление' : 'Fix type or direction'}</summary>
          <div class="review-fix-body">
            <div class="review-fix-row">
              <label class="review-fix-label">
                <input type="checkbox" name="type_fix" value="${lead.type === 'job' ? 'gig' : 'job'}">
                ${ru ? (lead.type === 'job' ? 'Это заказ' : 'Это вакансия') : (lead.type === 'job' ? 'This is a gig' : 'This is a job')}
              </label>
              ${directionPicker('direction_fix', ru ? 'Другое направление' : 'Other direction', directions.filter((item) => item.slug), '', false, options.lang)}
            </div>
          </div>
        </details>
      </div>

      <div class="review-answers">
        <button class="review-ans-btn review-ans-btn-primary" name="verdict" value="ok" type="submit" title="${ru ? 'Реальная работа. Мало текста не беда, если оригинал в порядке.' : 'Legitimate work. Brief text is fine if the original is valid.'}">
          <span class="review-ans-num">1</span>
          <span class="review-ans-text">
            <strong>${ru ? 'Всё верно' : 'Looks good'}</strong>
            <small>${ru ? 'Реальная работа, верный тип · Enter' : 'Legitimate work, correct type · Enter'}</small>
          </span>
        </button>
        ${reviewAnswers.map(([key, name, hint], index) => `
        <button class="review-ans-btn" name="verdict" value="${key}" type="submit" title="${escapeHtml(hint)}">
          <span class="review-ans-num">${index + 2}</span>
          <span class="review-ans-text">
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(hint.slice(0, 38))}</small>
          </span>
        </button>`).join('')}
        <button class="review-ans-btn review-ans-btn-skip" name="verdict" value="unsure" type="submit" title="${ru ? 'Пост пропускается, ответ не считается' : 'Skip this post without grading'}">
          <span class="review-ans-num">5</span>
          <span class="review-ans-text">
            <strong>${ru ? 'Не знаю' : 'Skip'}</strong>
            <small>${ru ? 'Пропустить без оценки' : 'Skip without grading'}</small>
          </span>
        </button>
      </div>

      <h2 class="review-issues-title">${ru ? 'Что не так со сбором' : 'Ingestion issues'}</h2>
      <div class="review-chips">
        ${Object.entries(issueNames).map(([key, name]) => `
        <label class="review-chip">
          <input type="checkbox" name="issues" value="${key}">
          <span>${escapeHtml(name)}</span>
        </label>`).join('')}
      </div>
      <input type="text" name="note" class="review-note" maxlength="300" placeholder="${ru ? 'Комментарий к сбору, если нужно' : 'Optional note about parsing issues'}" aria-label="${ru ? 'Комментарий' : 'Comment'}">
    </form>
  </aside>
</div>` : `
<div class="empty review-empty">
  <h2>${ru ? 'Пока нечего разбирать' : 'Nothing to review yet'}</h2>
  <p>${ru ? 'В этом направлении все посты разобраны. Выберите другое направление выше или загляните позже.' : 'All posts in this direction have been reviewed. Choose another direction above or check back later.'}</p>
</div>`;

  const body = `
<div class="review-nav">
  <div class="review-nav-left">
    <a class="back" href="/">${ru ? '← Все заказы' : '← All leads'}</a>
    <span class="review-nav-sep">·</span>
    ${directionPicker('c', ru ? 'Все направления' : 'All directions', [{ slug: '', label: ru ? 'Все направления' : 'All directions' }, ...directions], options.direction, true, options.lang)}
  </div>
  <div class="review-nav-right">
    ${signedIn ? `<span class="review-counter">${ru ? `Вы разобрали: <strong>${options.mine}</strong>` : `You reviewed: <strong>${options.mine}</strong>`}</span>` : `<span class="review-counter">${ru ? 'Разбор постов' : 'Post review'}</span>`}
    <button type="button" class="link-btn review-help-trigger" title="${ru ? 'Справка по оценке (?)' : 'Review guide (?)}'}">${ru ? 'Как оценивать (?)' : 'How to review (?)'}</button>
    ${options.last ? `<form method="post" action="/review/undo" class="review-undo-inline"><input type="hidden" name="id" value="${escapeHtml(options.last)}"><button class="link-btn review-undo-btn" type="submit" title="${ru ? 'Отменить последний ответ (Z)' : 'Undo last answer (Z)'}">${ru ? 'Отменить ответ (Z)' : 'Undo answer (Z)'}</button></form>` : ''}
  </div>
</div>
${content}
<div id="review-help-modal" class="review-modal" style="display:none">
  <div class="review-modal-backdrop"></div>
  <div class="review-modal-card">
    <div class="review-modal-head">
      <h3>${ru ? 'Как оценивать' : 'How to review'}</h3>
      <button type="button" class="link-btn review-modal-close">${ru ? 'Закрыть' : 'Close'}</button>
    </div>
    <ul class="review-help-list">
      <li>${ru ? 'Оценивайте саму работу, а не то, как мы её показали.' : 'Evaluate the job/gig itself, not how openradar rendered it.'}</li>
      <li>${ru ? 'Если текста мало, сначала откройте оригинал.' : 'If the description is brief, check the original link first.'}</li>
      <li>${ru ? 'Оригинал хороший, а у нас плохо считалось: это «Всё верно», а что не так, отметьте в проблемах сбора.' : 'If the original is legitimate but openradar parsed it poorly, select "Looks good" and mark parsing issues below.'}</li>
      <li>${ru ? '<strong>Не работа:</strong> реклама, курс, резюме, новость.' : '<strong>Not work:</strong> ads, courses, resumes, news, promos.'}</li>
      <li>${ru ? '<strong>Подозрительно:</strong> деньги вперёд, большой заработок без навыков, накрутки, подделка документов.' : '<strong>Suspicious:</strong> upfront fees, high pay with no skills, fake reviews, scam.'}</li>
      <li>${ru ? '<strong>Уже закрыта:</strong> на оригинале снята, заказ занят или страница не открывается.' : '<strong>Already closed:</strong> position filled, listing archived, or link dead.'}</li>
      <li>${ru ? 'Сомневаетесь? Нажмите «Не знаю»: это честнее, чем угадывать.' : 'Unsure? Click "Skip": it is better than guessing.'}</li>
      <li>${ru ? 'Клавиши 1–5 или Enter выбирают ответ, стрелки ↑↓ переключают, О открывает оригинал, Z отменяет, ? открывает эту справку.' : 'Keys 1–5 or Enter choose an answer, ↑↓ arrows switch, O opens original, Z undoes, ? toggles this help.'}</li>
    </ul>
  </div>
</div>`;
  const pageTitle = lead ? `${leadTitle(lead)} · ${ru ? 'Разбор постов' : 'Post review'}` : (ru ? 'Разбор постов' : 'Post review');
  return layout({ title: pageTitle, version: options.version, body, auth: options.auth, lang: options.lang, head: '<meta name="robots" content="noindex">', script: REVIEW_SCRIPT, bodyClass: 'page-review' });
}

/** Where an employer's page lives. */
export function employerPath(key: string): string {
  return `/employers/${encodeURIComponent(key)}`;
}

export function renderEmployersPage(options: {
  baseUrl: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  employers: Array<{ key: string; name: string; active: number; lastAt: string }>;
  query?: string;
}): string {
  const ru = options.lang !== 'en';
  const rows = options.employers.map((e, index) => `<tr><td>${index + 1}</td><td><a href="${escapeHtml(employerPath(e.key))}">${escapeHtml(e.name)}</a></td><td class="num">${e.active}</td><td>${escapeHtml(e.lastAt.slice(0, 10))}</td></tr>`).join('\n');
  const description = ru
    ? 'Компании с открытыми вакансиями: сколько позиций открыто сейчас и когда появилась последняя. Каждая страница собирает вакансии компании с разных площадок.'
    : 'Companies with open vacancies: how many roles are open now and when the latest appeared. Each page gathers the company\'s vacancies from every board.';
  const body = `
<div class="page-head"><div>
  <h1>${ru ? 'Работодатели' : 'Employers'}</h1>
  <p class="muted small">${escapeHtml(description)}</p>
</div></div>
<section class="profile">
  <form method="get" action="/employers" class="form" role="search">
    <input type="search" name="q" value="${escapeHtml(options.query ?? '')}" placeholder="${ru ? 'Название компании' : 'Company name'}" aria-label="${ru ? 'Поиск компании' : 'Find a company'}">
  </form>
  ${rows ? `<table class="profile-table">
    <thead><tr><th>#</th><th>${ru ? 'Компания' : 'Company'}</th><th>${ru ? 'Открыто' : 'Open'}</th><th>${ru ? 'Последняя' : 'Latest'}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>` : `<p class="muted">${ru ? 'Таких компаний пока нет.' : 'No such companies yet.'}</p>`}
</section>`;
  const head = options.query
    ? '<meta name="robots" content="noindex">'
    : `<link rel="canonical" href="${escapeHtml(`${options.baseUrl}/employers`)}">\n<meta name="description" content="${escapeHtml(description)}">`;
  return layout({ title: `${ru ? 'Работодатели' : 'Employers'}`, version: options.version, active: 'employers', body, auth: options.auth, lang: options.lang, head });
}

export function renderEmployerPage(options: {
  baseUrl: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  employerKey: string;
  name: string;
  active: number;
  /** New in the last seven days. */
  fresh: number;
  remoteShare: number;
  boards: number;
  skills: string[];
  cities: string[];
  /** What this reader may open now. */
  posts: Lead[];
  /** Open vacancies this reader sees later: fresh ones reach guests with a delay. */
  later: number;
  signedIn: boolean;
}): string {
  const ru = options.lang !== 'en';
  const name = escapeHtml(options.name);
  const url = `${options.baseUrl}${employerPath(options.employerKey)}`;
  const rows = options.posts.map((lead) => leadRow(lead, options.baseUrl)).join('\n');
  const hiring = options.skills.slice(0, 3).join(', ');
  const description = options.active
    ? (ru
        ? `Открытые вакансии ${options.name}: ${options.active} сейчас${hiring ? `, чаще всего ${hiring}` : ''}.`
        : `Open vacancies at ${options.name}: ${options.active} now${hiring ? `, mostly ${hiring}` : ''}.`)
    : (ru ? `Сейчас у ${options.name} нет открытых вакансий.` : `${options.name} has no open vacancies now.`);
  const tile = (value: string | number, label: string): string => `<div class="employer-stat"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
  const stats = options.active
    ? `<div class="employer-stats">
    ${tile(options.active, ru ? 'открыто сейчас' : 'open now')}
    ${tile(options.fresh, ru ? 'новых за 7 дней' : 'new in 7 days')}
    ${tile(`${options.remoteShare}%`, ru ? 'удалённо' : 'remote')}
    ${tile(options.boards, ru ? 'источников' : 'sources')}
  </div>`
    : '';
  const facts = [
    options.skills.length ? `<div><dt>${ru ? 'Чаще всего ищут' : 'Mostly hiring for'}</dt><dd>${escapeHtml(options.skills.join(', '))}</dd></div>` : '',
    options.cities.length ? `<div><dt>${ru ? 'Города' : 'Cities'}</dt><dd>${escapeHtml(options.cities.join(', '))}</dd></div>` : '',
  ].filter(Boolean).join('\n');
  const later = options.later > 0
    ? `<p class="muted">${ru ? `Ещё свежих вакансий: ${options.later}.` : `${options.later} more fresh vacancies.`} ${options.signedIn ? (ru ? 'Они откроются чуть позже.' : 'They open a little later.') : `<a href="/login?returnTo=${escapeHtml(encodeURIComponent(employerPath(options.employerKey)))}">${ru ? 'Войдите, чтобы видеть их раньше' : 'Sign in to see them sooner'}</a>.`}</p>`
    : '';
  const empty = !options.active ? `<p class="muted">${ru ? 'Сейчас открытых вакансий нет.' : 'No open vacancies now.'}</p>` : '';
  const body = `
<nav class="crumbs" aria-label="${ru ? 'Навигация' : 'Navigation'}"><a href="/employers">${ru ? 'Работодатели' : 'Employers'}</a> / ${name}</nav>
<div class="page-head"><div>
  <h1>${ru ? 'Вакансии' : 'Vacancies at'} ${name}</h1>
</div></div>
<section class="profile">
  ${stats}
  ${facts ? `<dl class="employer-facts">${facts}</dl>` : ''}
  ${later}
  ${empty}
  ${rows ? `<div class="list">${rows}</div>` : ''}
</section>`;
  const list = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${ru ? 'Вакансии' : 'Vacancies at'} ${options.name}`,
    itemListElement: options.posts.slice(0, 20).map((lead, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${options.baseUrl}/leads/${encodeURIComponent(lead.id)}`,
      name: lead.title,
    })),
  };
  const head = options.posts.length
    ? `<link rel="canonical" href="${escapeHtml(url)}">
<meta name="description" content="${escapeHtml(description)}">
<script type="application/ld+json">
${jsonForScript(list)}
</script>`
    : '<meta name="robots" content="noindex">';
  return layout({ title: `${ru ? 'Вакансии' : 'Vacancies at'} ${options.name}`, version: options.version, active: 'employers', body, auth: options.auth, lang: options.lang, head });
}

export function renderNetworkPage(options: {
  baseUrl: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  participants: Array<{ shortPubkey: string; name?: string; about?: string; handle?: string; posts: number; points: number; tier: string }>;
  sources: Array<{ title: string; leads: number; href?: string }>;
  windowDays: number;
}): string {
  const { baseUrl, version } = options;
  const ru = options.lang !== 'en';
  const totalPoints = Math.round(options.participants.reduce((sum, p) => sum + p.points, 0) * 10);
  const totalLeads = options.sources.reduce((sum, s) => sum + s.leads, 0);

  const participantRows = options.participants.map((p, index) => {
    const name = p.handle ? `@${escapeHtml(p.handle)}` : p.name ? escapeHtml(p.name) : `<code>${escapeHtml(p.shortPubkey)}</code>`;
    const label = p.handle ? `<a href="/u/${escapeHtml(encodeURIComponent(p.handle))}">${name}</a>` : name;
    return `<tr><td>${index + 1}</td><td>${label}${p.about ? `<div class="muted small">${escapeHtml(p.about.slice(0, 120))}</div>` : ''}</td><td class="num">${p.posts}</td><td class="num">${Math.round(p.points * 10)}</td><td>${escapeHtml(p.tier)}</td></tr>`;
  }).join('\n');

  const sourceRows = options.sources.map((s) => {
    const title = s.href ? `<a href="${escapeHtml(s.href)}">${escapeHtml(s.title)}</a>` : escapeHtml(s.title);
    return `<tr><td>${title}</td><td class="num">${s.leads}</td></tr>`;
  }).join('\n');

  const body = `
<nav class="crumbs" aria-label="${ru ? 'Навигация' : 'Navigation'}"><a href="/">openradar</a> / ${ru ? 'Сеть' : 'Network'}</nav>
<div class="page-head"><div>
  <h1>${ru ? 'Сеть openradar' : 'The openradar network'}</h1>
  <p class="muted small">${ru
    ? `Участники приносят публикации в общую базу. Очки — рейтинг за ${options.windowDays} дней: кто первый увидел подтверждённый заказ, кто подтвердил, чей сигнал совпал с исходом.`
    : `Participants bring posts into the shared base. Points are the ${options.windowDays}-day rating: who saw a confirmed lead first, who confirmed it, whose signal matched the outcome.`}</p>
</div></div>

<div class="detail-grid" style="grid-template-columns: 1.4fr 1fr;">
  <section>
    <h2>${ru ? 'Участники' : 'Participants'}</h2>
    ${options.participants.length ? `
    <table class="profile-table">
      <thead><tr><th>#</th><th>${ru ? 'Участник' : 'Participant'}</th><th>${ru ? 'Постов' : 'Posts'}</th><th>${ru ? 'Очки' : 'Points'}</th><th>${ru ? 'Уровень' : 'Tier'}</th></tr></thead>
      <tbody>${participantRows}</tbody>
    </table>
    <p class="muted small">${ru
      ? 'Ключ участника — hex-подпись; имя появляется, только если участник сам опубликовал профиль (событие kind 30440). Закрытые каналы здесь не раскрываются.'
      : 'A participant is a signing key; a name appears only when the participant published a profile (kind 30440). Private channels are never listed here.'}</p>`
    : `<p class="muted">${ru ? 'Пока никто не получал очков — самые первые подтверждения появятся здесь.' : 'Nobody has earned points yet — the first confirmations will show up here.'}</p>`}
  </section>
  <section>
    <h2>${ru ? 'Источники недели' : 'Sources of the week'}</h2>
    ${options.sources.length ? `
    <table class="profile-table">
      <thead><tr><th>${ru ? 'Источник' : 'Source'}</th><th>${ru ? 'Лидов' : 'Leads'}</th></tr></thead>
      <tbody>${sourceRows}</tbody>
    </table>
    <p class="muted small">${ru ? `Всего за неделю: ${totalLeads} публикаций. Полный список с состояниями — на <a href="/sources">странице источников</a>.` : `${totalLeads} posts in total this week. The full list with states lives on the <a href="/sources">sources page</a>.`}</p>`
    : `<p class="muted">${ru ? 'Пока нет данных за неделю.' : 'No data for the week yet.'}</p>`}
    <details class="score-help"><summary>${ru ? 'Как попасть в таблицу' : 'How to get on this table'}</summary>
      <p>${ru
        ? `Подключите источник: публичный канал, RSS или свой узел с флагом share. Суммарно участники сети набрали ${totalPoints} очков за ${options.windowDays} дней.`
        : `Connect a source: a public channel, an RSS feed or your own node with the share flag. The network has earned ${totalPoints} points in ${options.windowDays} days.`}</p>
    </details>
  </section>
</div>`;

  const description = ru
    ? 'Участники и источники openradar: рейтинг за 30 дней, источники недели, как подключить свой.'
    : 'openradar participants and sources: the 30-day rating, sources of the week, how to connect yours.';

  return layout({
    auth: options.auth,
    lang: options.lang,
    title: ru ? 'Сеть' : 'Network',
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/network">`,
  });
}

/** Three ways to bring posts into the network, on one page. */
export function renderContributePage(options: {
  baseUrl: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
}): string {
  const { baseUrl, version } = options;
  const ru = options.lang !== 'en';
  const card = (icon: string, title: string, minutes: string, text: string, snippet: string, gain: string): string => `
  <div class="path">
    <div class="path-head"><span class="path-icon" aria-hidden="true">${icon}</span>${escapeHtml(title)}<span class="path-time">${escapeHtml(minutes)}</span></div>
    <p>${text}</p>
    <pre>${snippet}</pre>
    <div class="path-get">${gain}</div>
  </div>`;

  const body = `
<nav class="crumbs" aria-label="${ru ? 'Навигация' : 'Navigation'}"><a href="/">openradar</a> / ${ru ? 'Участвовать' : 'Contribute'}</nav>
<div class="page-head"><div>
  <h1>${ru ? 'Подключите источник за 10 минут' : 'Connect a source in 10 minutes'}</h1>
  <p class="muted small">${ru
    ? 'Приведите заказы, которые видите только вы. Кто делится — тот видит ленту первым: без задержки и с контактами. Рейтинг привязан к вашему ключу, атрибуция — к вашему каналу.'
    : 'Bring the orders only you can see. Those who share see the feed first: no delay, contacts included. The rating belongs to your key, the attribution to your channel.'}</p>
</div></div>

<div class="paths">
  ${card('①', ru ? 'Telegram-канал' : 'A Telegram channel', ru ? '10 минут' : '10 minutes',
    ru ? 'Публичный или ваш закрытый канал — через ваш аккаунт (MTProto), сессия живёт у вас.'
       : 'A public or your private channel — through your own account (MTProto); the session stays with you.',
    ru ? `radar telegram login --save ./session\nradar telegram scan\nradar source add --kind telegram-account --folder "Заказы"`
       : `radar telegram login --save ./session\nradar telegram scan\nradar source add --kind telegram-account --folder "Orders"`,
    ru ? '<b>×1.5 к рейтингу</b> за закрытый канал' : '<b>×1.5 rating</b> for a private channel')}
  ${card('②', ru ? 'Свой парсер' : 'Your own parser', ru ? '5 минут' : '5 minutes',
    ru ? 'Любой скрипт на любом языке: NDJSON-наблюдения в webhook-источник.'
       : 'Any script in any language: NDJSON observations into a webhook source.',
    ru ? `radar source add --kind webhook --title "Мой парсер"\npython parser.py | radar push --source <id>`
       : `radar source add --kind webhook --title "My parser"\npython parser.py | radar push --source <id>`,
    ru ? '<b>Скор лида</b> считают правила; LLM опционален' : '<b>The score</b> comes from rules; LLM optional')}
  ${card('③', ru ? 'Готовый узел' : 'A full node', ru ? '15 минут' : '15 minutes',
    ru ? 'Своя лента целиком: Docker, PostgreSQL, свои источники и уведомления.'
       : 'A feed of your own: Docker, PostgreSQL, your sources and notifications.',
    ru ? `git clone ${REPO_URL}.git && cd openradar\ndocker compose run --rm radar migrate\ndocker compose up -d`
       : `git clone ${REPO_URL}.git && cd openradar\ndocker compose run --rm radar migrate\ndocker compose up -d`,
    ru ? '<b>share</b>-флаг отправляет лиды в сеть' : 'the <b>share</b> flag sends leads to the network')}
</div>

<div class="detail-grid" style="grid-template-columns: 1.2fr 1fr;">
  <section class="prose" style="margin-top:14px">
    <h2>${ru ? 'Что даёт вклад' : 'What contribution gives'}</h2>
    <ul>
      <li>${ru ? '<b>Ранний доступ:</b> Active видит лиды через 30 минут, Core — сразу же.' : '<b>Early access:</b> Active sees leads after 30 minutes, Core instantly.'}</li>
      <li>${ru ? '<b>Рейтинг:</b> +1.0 за первого, ×1.5 закрытый канал, ×1.5 эксклюзив за 6 часов.' : '<b>Rating:</b> +1.0 for the first sighting, ×1.5 private channel, ×1.5 for a 6-hour exclusive.'}</li>
      <li>${ru ? '<b>Атрибуция:</b> источники недели — на странице <a href="/network">Сети</a>.' : '<b>Attribution:</b> sources of the week live on the <a href="/network">Network</a> page.'}</li>
      <li>${ru ? '<b>Стена историй:</b> нашли заказ — <a href="' + REPO_URL + '/issues/new?template=i-found-work.yml" target="_blank" rel="noopener">расскажите</a>, ваша история появится в README.' : '<b>Story wall:</b> found work through openradar? <a href="' + REPO_URL + '/issues/new?template=i-found-work.yml" target="_blank" rel="noopener">Tell the story</a> — it lands in the README.'}</li>
    </ul>
    <p class="muted small">${ru
      ? 'Не готовы делиться? Подпишитесь на RSS любого запроса — это тоже участие. Правила приёма источников: <a href="/sources">что уже подключено</a>.'
      : 'Not ready to share? Subscribe to the RSS of any query — that counts too. What is already connected: <a href="/sources">the sources page</a>.'}</p>
  </section>
  <section class="prose" style="margin-top:14px">
    <h2>${ru ? 'Уровни доступа' : 'Access tiers'}</h2>
    <table class="profile-table">
      <thead><tr><th>${ru ? 'Уровень' : 'Tier'}</th><th>${ru ? 'Как получить' : 'How'}</th><th>${ru ? 'Задержка' : 'Delay'}</th></tr></thead>
      <tbody>
        <tr><td>Guest</td><td>${ru ? 'без входа' : 'not signed in'}</td><td>12 ч</td></tr>
        <tr><td>Member</td><td>GitHub</td><td>3 ч</td></tr>
        <tr><td>Active</td><td>${ru ? 'рейтинг ≥ 10' : 'rating ≥ 10'}</td><td>30 ${ru ? 'мин' : 'min'}</td></tr>
        <tr><td>Core</td><td>${ru ? 'рейтинг ≥ 50' : 'rating ≥ 50'}</td><td>—</td></tr>
      </tbody>
    </table>
    <p class="muted small">${ru ? 'Подробности протокола: ' : 'Protocol details: '}<a href="${REPO_URL}/blob/main/docs/PROTOCOL.md" target="_blank" rel="noopener">docs/PROTOCOL.md</a></p>
  </section>
</div>`;

  const description = ru
    ? 'Подключите свой Telegram-канал, парсер или узел к openradar: без задержки, с контактами и рейтингом участника.'
    : 'Connect your Telegram channel, parser or node to openradar: no delay, contacts, participant rating.';

  return layout({
    auth: options.auth,
    lang: options.lang,
    title: ru ? 'Участвовать' : 'Contribute',
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/contribute">`,
  });
}

/** What we collect, what we never collect, how to get data removed. */
export function renderTrustPage(options: {
  baseUrl: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
}): string {
  const { baseUrl, version } = options;
  const ru = options.lang !== 'en';
  const body = `
<nav class="crumbs" aria-label="${ru ? 'Навигация' : 'Navigation'}"><a href="/">openradar</a> / Trust</nav>
<div class="page-head"><div>
  <h1>Trust &amp; data</h1>
  <p class="muted small">${ru ? 'Что собирает openradar, чего не собирает никогда и как удалить данные.' : 'What openradar collects, what it never does, and how to get data removed.'}</p>
</div></div>
<section class="prose" style="margin-top:0">
  <h2>${ru ? 'Что собирается' : 'What we collect'}</h2>
  <p>${ru
    ? 'Только публичные постинги: открытые ленты бирж, официальные API, публичные страницы Telegram и письма-оповещения, которые оператор узла получил сам. Каждый источник объявляет уровень доступа и риски — это часть кода адаптера.'
    : 'Public postings only: open board feeds, official APIs, public Telegram pages and job-alert mail the node operator received themselves. Every source declares its access level and risks — it is part of the adapter code.'}</p>
  <h2>${ru ? 'Чего здесь нет и не будет' : 'What is never here'}</h2>
  <ul>
    <li>${ru ? 'Резюме и профилей кандидатов.' : 'Resumes and candidate profiles.'}</li>
    <li>${ru ? 'Контактных данных людей, кроме тех, что написаны в самом посте; гостям они скрыты.' : 'People contact details beyond those written in the post itself; guests never see them.'}</li>
    <li>${ru ? 'Обхода входа, капчи или платного доступа — это правило адаптеров, закреплённое в тестах.' : 'Login, CAPTCHA or paywall bypass — an adapter rule enforced in tests.'}</li>
    <li>${ru ? 'Платного доступа: тарифов нет и не планируется.' : 'Paid access: there is no paid tier and none is planned.'}</li>
  </ul>
  <h2>${ru ? 'Безопасность' : 'Security'}</h2>
  <p>${ru
    ? 'Секреты только в переменных окружения узла. Запросы к источникам идут через SSRF-guard с проверкой адреса в момент соединения. События участников подписаны (BIP-340), HTTP-подписи одноразовые. HTML источников не рендерится, текст передаётся моделям как данные, скрытые Unicode-инструкции вырезаются на приёме.'
    : 'Secrets live in node environment variables only. Outbound requests go through an SSRF guard that checks the address at connect time. Participant events are signed (BIP-340); HTTP signatures are single-use. Source HTML is never rendered; text is handed to models as data, and hidden Unicode instructions are stripped at intake.'}</p>
  <h2>${ru ? 'Удаление' : 'Removal'}</h2>
  <p>${ru
    ? 'Площадка может потребовать убрать свой источник — он отключается из конфигурации, посты канала скрываются модератором. Участник удаляет свои посты событием kind 4042. По вопросам: '
    : 'A board can ask to remove its source: it is disabled in the configuration and its posts are hidden by a moderator. A participant deletes their posts with a kind 4042 event. Questions: '}${'<a href="' + REPO_URL + '/issues" target="_blank" rel="noopener">GitHub issues</a>.'}</p>
  <p class="muted small">${ru ? 'Статус сервиса: ' : 'Service status: '}<a href="/health">/health</a> · ${ru ? 'Описание API: ' : 'API description: '}<a href="/openapi.json">/openapi.json</a></p>
</section>`;

  const description = ru
    ? 'Что собирает openradar (только публичные постинги), чего не собирает никогда, как обеспечивается безопасность и как удалить данные.'
    : 'What openradar collects (public postings only), what it never does, how it is secured, and how to get data removed.';

  return layout({
    auth: options.auth,
    lang: options.lang,
    title: 'Trust & data',
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/trust">`,
  });
}

export function renderLlmsTxt(baseUrl: string): string {
  const line = (entry: CatalogEntry): string => `- [${entry.h1}](${baseUrl}/catalog/${entry.slug}): ${entry.description}`;
  return `# openradar

> Открытая база заказов для фрилансеров и IT-вакансий. Собирает публикации с бирж (FL.ru, Kwork, Freelancehunt), сайтов вакансий (hh.ru, Хабр Карьера, «Работа России», We Work Remotely, Jobicy, RemoteOK) и Telegram-каналов в одну ленту. Бесплатно, без платных тарифов, код открыт (AGPL-3.0).

## Разделы

- [Лента заказов и вакансий](${baseUrl}/): поиск, фильтры по навыкам, бюджету и удалёнке.
- [Исследования рынка](${baseUrl}/research): зарплаты в вакансиях и бюджеты заказов — медианы и квартили по направлениям, уровням, языкам, городам и навыкам. Данные открыты (CC BY 4.0): [CSV](${baseUrl}/research/dataset.csv), [JSON](${baseUrl}/research/report.json), [методика](${baseUrl}/research/methodology).
- [О проекте](${baseUrl}/about): как устроен openradar и откуда публикации.
- [Вопросы и ответы](${baseUrl}/faq)
- [Расширение для браузера](${baseUrl}/extension): отправка вакансии с любого сайта и оценка рыночной оплаты.
- [RSS-лента](${baseUrl}/feed.rss): параметры q (поиск) и type (gig — заказы, job — вакансии).
- [HTTP API и MCP](${baseUrl}/openapi.json): OpenAPI-схема публичного API; каталог — ${baseUrl}/.well-known/api-catalog; MCP-сервер — ${baseUrl}/mcp (tools: search_leads, get_lead_details, get_market_stats).

## Заказы

${SEO_CATALOG.filter((entry) => entry.type !== 'job').map(line).join('\n')}

## Вакансии

${SEO_CATALOG.filter((entry) => entry.type === 'job').map(line).join('\n')}

## Для разработчиков

- [Исходный код](${REPO_URL})
- [Как запустить свой узел](${REPO_URL}/blob/main/docs/GETTING_STARTED.md)
- [Протокол обмена](${REPO_URL}/blob/main/docs/PROTOCOL.md)
`;
}

export function renderRobotsTxt(baseUrl: string): string {
  // The sources list and source pages are public (the index of boards with daily counts);
  // operator-only routes stay out of the index.
  return `User-agent: *
Allow: /
Disallow: /sources/new
Disallow: /sources/catalog
Disallow: /sources/*/edit
Disallow: /api
Disallow: /admin
Disallow: /me
Disallow: /login
Disallow: /submit

Sitemap: ${baseUrl}/sitemap.xml
`;
}

/** Leads are the public lead pages a guest can open; pass none for a private node. */
export function renderSitemapXml(
  baseUrl: string,
  leads: Array<{ id: string; createdAt: string }> = [],
  now: Date = new Date(),
  /** Pages that exist only while there is data behind them, such as research role pages. */
  extraPaths: string[] = [],
): string {
  const today = now.toISOString().slice(0, 10);
  const urls: Array<{ loc: string; priority: string; lastmod?: string; changefreq?: string }> = [
    { loc: `${baseUrl}/`, priority: '1.0', lastmod: today, changefreq: 'hourly' },
    { loc: `${baseUrl}/catalog`, priority: '0.7' },
    ...SEO_CATALOG.map((entry) => ({
      loc: `${baseUrl}/catalog/${entry.slug}`,
      priority: '0.8',
      lastmod: today,
      changefreq: 'hourly',
    })),
    { loc: `${baseUrl}/research`, priority: '0.9', lastmod: today, changefreq: 'daily' },
    { loc: `${baseUrl}/research/methodology`, priority: '0.5' },
    ...extraPaths.map((path) => ({ loc: `${baseUrl}${path}`, priority: '0.6', lastmod: today })),
    { loc: `${baseUrl}/about`, priority: '0.5' },
    { loc: `${baseUrl}/faq`, priority: '0.5' },
    { loc: `${baseUrl}/extension`, priority: '0.5' },
    ...leads.map((lead) => ({
      loc: `${baseUrl}/leads/${encodeURIComponent(lead.id)}`,
      priority: '0.5',
      lastmod: lead.createdAt.slice(0, 10),
    })),
  ];
  const items = urls
    .map(
      (item) =>
        `  <url><loc>${escapeHtml(item.loc)}</loc>${item.lastmod ? `<lastmod>${item.lastmod}</lastmod>` : ''}${item.changefreq ? `<changefreq>${item.changefreq}</changefreq>` : ''}<priority>${item.priority}</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
}
