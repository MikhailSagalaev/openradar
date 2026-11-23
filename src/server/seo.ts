import { classifyRole, isPhysicalNonItWork } from '../research/derive.ts';
import { escapeHtml, jsonForScript } from '../core/text.ts';
import type { Lead, LeadType } from '../core/types.ts';
import {
  isIndexable,
  isoWeekKey,
  leadLastmod,
  NODE_INDEX_POLICY,
  w3cDateTime,
  type TtlEnv,
} from '../core/indexable.ts';
import type { AccessPolicy } from '../core/access.ts';
import type { SitemapLeadRef } from '../core/store.ts';
import { layout, type AuthDisplay, formatBudget, salaryRange, safeHttpUrl, leadTitle, formatRelative, leadMetaLine } from './ui.ts';
import { formatLeadText } from './format.ts';
import { SEO_STRINGS, translateCity, translateSkill, translateSourceTitle, type SupportedLang } from './i18n.ts';
import type { SourceQuality, SourceQualityInput } from '../core/source-quality.ts';
import type { DecisionScore, FlagScore, ModelDecision } from '../core/decisions.ts';
import { renderOpenApi } from './openapi.ts';
import { renderAdminTabs } from './admin.ts';

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
    directions: ['backend', 'frontend', 'fullstack', 'web', 'bots', 'parsing', 'mobile', 'dev-other', 'embedded'],
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
    directions: ['backend', 'parsing', 'bots', 'ai', 'dev-other'],
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
    directions: ['marketplaces', 'design', 'marketing'],
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
    directions: ['web', 'dev-other'],
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
    directions: ['backend', 'web', 'dev-other'],
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
    directions: ['gamedev', 'mobile'],
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
    directions: ['qa'],
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
    directions: ['backend', 'data-engineer', 'ml', 'ai', 'qa', 'devops'],
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
    directions: ['frontend', 'fullstack'],
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
    directions: ['devops', 'sysadmin', 'security'],
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
    directions: ['analyst-system', 'analyst-business', 'analyst-data', 'data-engineer', 'product'],
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
    directions: ['qa'],
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
    directions: ['design'],
    type: 'job',
  },
];


const SEO_CATALOG_EN: Record<string, { h1: string; title: string; description: string; intro: string; about: string }> = {
  "zakazy-na-razrabotku": {
    h1: "Development gigs",
    title: "Development gigs — fresh freelance projects every hour",
    description: "Fresh software development gigs from open freelance boards and Telegram channels, deduplicated with direct links to the client.",
    intro: "Fresh development orders from open boards and channels. Every card links to the original post with duplicates removed.",
    about: "This section collects software development orders: backend, web apps, APIs, parsers and custom automation from freelance boards and Telegram channels.",
  },
  "razrabotka-saytov": {
    h1: "Website development gigs",
    title: "Website development gigs — landing pages, online stores, CMS",
    description: "Freelance orders for website creation and updates: landing pages, corporate sites, e-commerce stores and CMS integrations.",
    intro: "Website projects from landing pages to online stores, updated automatically every five minutes.",
    about: "Orders for turnkey websites, layout, redesigns and CMS setup from open freelance platforms and Telegram feeds.",
  },
  "python-zakazy": {
    h1: "Python gigs",
    title: "Python gigs — scrapers, backends, automation",
    description: "Freelance Python orders: web scraping, Django/FastAPI backends, Telegram bots, data scripts and automation.",
    intro: "Python tasks from open sources: backend services, scrapers and automation.",
    about: "Python projects covering backend APIs, data parsing, bots and workflow automation with stated client budgets.",
  },
  "boty-zakazy": {
    h1: "Telegram bot gigs",
    title: "Telegram bot and chatbot gigs",
    description: "Orders for building Telegram bots, chatbots, mini-apps, payment integrations and messenger automation.",
    intro: "Bot development and messenger automation — new orders every five minutes.",
    about: "Freelance tasks for Telegram bots, WebApps, customer support chatbots and CRM/payment integrations.",
  },
  "1s-zakazy": {
    h1: "1C gigs",
    title: "1C developer gigs — customization and integration",
    description: "Freelance orders for 1C:Enterprise configuration, reports, data exchange and CRM/ERP integration.",
    intro: "1C customization and rollout — orders updated automatically.",
    about: "Tasks for 1C programmers: configuration updates, external integrations, exchange setup and accounting automation.",
  },
  "dizayn-zakazy": {
    h1: "Design gigs",
    title: "Design gigs — logos, UI/UX interfaces, banners",
    description: "Freelance design orders: UI/UX in Figma, logos, brand identity, banners, presentations and illustrations.",
    intro: "Graphic and product design — fresh orders from open sources.",
    about: "Design projects across UI/UX, web and mobile interfaces, branding, social media graphics and marketplace cards.",
  },
  "mobilnaya-razrabotka": {
    h1: "Mobile app gigs",
    title: "Mobile app gigs — iOS, Android, Flutter, React Native",
    description: "Freelance mobile development projects for iOS, Android, Flutter and React Native.",
    intro: "Mobile apps and games — projects for iOS and Android developers.",
    about: "Orders for native and cross-platform mobile applications, MVP builds, store publishing and app updates.",
  },
  "kopirayting-zakazy": {
    h1: "Copywriting & content gigs",
    title: "Copywriting, editing and content gigs",
    description: "Freelance orders for copywriting, articles, technical writing, editing, scripts and social media posts.",
    intro: "Copywriting, editing and content marketing — new orders every hour.",
    about: "Writing tasks from blogs and landing page copy to technical documentation, scripts and editorial work.",
  },
  "vakansii-razrabotchikov": {
    h1: "Developer jobs",
    title: "Software developer vacancies — fresh IT job offers",
    description: "Software developer vacancies from official APIs, career pages and IT job boards with salary ranges and stack tags.",
    intro: "IT vacancies from official APIs and feeds: salary ranges, tech stack and workplace format.",
    about: "Full-time and contract developer roles aggregated from IT job boards, company ATS pages and specialized channels.",
  },
  "udalennye-vakansii": {
    h1: "Remote IT jobs",
    title: "Remote IT vacancies — work from anywhere",
    description: "Remote-friendly IT vacancies from Russian and international employers with stated salary ranges.",
    intro: "Remote only: IT vacancies from Russia and worldwide with salary ranges.",
    about: "Curated remote vacancies across engineering, data, QA, DevOps, design and product management.",
  },
  "videomontazh-zakazy": {
    h1: "Video editing gigs",
    title: "Video editing gigs — Reels, Shorts, YouTube, motion design",
    description: "Fresh video editing orders for YouTube, Reels, Shorts, motion graphics and 2D/3D animation.",
    intro: "Video editing, Reels, Shorts and motion design. Every card links to the original source.",
    about: "Projects for video editors and motion designers: short-form vertical video, YouTube cuts, explainers and color grading.",
  },
  "reklama-i-marketing": {
    h1: "Marketing & ads gigs",
    title: "Marketing & advertising gigs — PPC, targeted ads, SMM",
    description: "Freelance marketing orders: PPC campaigns, targeted ads, Yandex Direct, Avito promotion and SMM.",
    intro: "Targeted ads, PPC, Avito and social media: fresh orders with budgets and direct links.",
    about: "Orders for digital marketers, media buyers, traffic specialists and SMM managers.",
  },
  "perevody-zakazy": {
    h1: "Translation gigs",
    title: "Translation gigs — texts, websites, documents",
    description: "Fresh freelance orders for translating texts, websites, apps and documents.",
    intro: "Translation of texts, websites and documents: orders from freelance boards updated every five minutes.",
    about: "Localization and translation tasks across English, Russian and other languages.",
  },
  "marketpleysy-zakazy": {
    h1: "Marketplace gigs",
    title: "Marketplace gigs — product cards, infographics, Wildberries & Ozon",
    description: "Orders for marketplace product cards, infographics, SEO descriptions and store management on Wildberries and Ozon.",
    intro: "Product cards, infographics and store management on marketplaces — fresh orders from boards.",
    about: "Freelance tasks for e-commerce and marketplace specialists: card design, rich content, analytics and store operations.",
  },
  "wordpress-zakazy": {
    h1: "WordPress gigs",
    title: "WordPress gigs — websites, themes, plugins, fixes",
    description: "Fresh WordPress orders: turnkey sites, theme customization, plugins, WooCommerce and speed optimization.",
    intro: "Websites and customizations on WordPress and WooCommerce from boards and channels.",
    about: "Projects for WordPress developers covering Elementor, custom themes, WooCommerce stores and site migrations.",
  },
  "bitrix-zakazy": {
    h1: "Bitrix gigs",
    title: "1C-Bitrix and Bitrix24 gigs — customization and CRM",
    description: "Orders for 1C-Bitrix and Bitrix24: website development, 1C sync, CRM setup and business workflow automation.",
    intro: "Bitrix and Bitrix24: website updates, 1C integrations and CRM setup.",
    about: "Freelance tasks for 1C-Bitrix and Bitrix24 specialists: e-commerce catalogs, CRM pipelines and custom modules.",
  },
  "parsing-zakazy": {
    h1: "Web scraping gigs",
    title: "Web scraping and data extraction gigs",
    description: "Fresh orders for web scrapers: data collection from websites and marketplaces into Excel, CSV or databases.",
    intro: "Scrapers for websites, marketplaces and social networks — fresh orders with budgets.",
    about: "Data extraction, price monitoring and catalog parsing projects using Python, Node.js, Playwright and APIs.",
  },
  "neyroseti-zakazy": {
    h1: "AI & LLM gigs",
    title: "AI & neural network gigs — GPT bots, automation, content generation",
    description: "Orders for AI and LLMs: GPT chatbots, RAG pipelines, n8n/Make automation, and AI image/video generation.",
    intro: "AI in action: LLM assistants, workflow automation and generative media.",
    about: "Freelance projects involving OpenAI, Claude, LangChain, RAG agents, ComfyUI and AI-powered business automation.",
  },
  "seo-prodvizhenie": {
    h1: "SEO gigs",
    title: "SEO gigs — website promotion, technical audits, keyword research",
    description: "Fresh SEO orders: search engine optimization, technical audits, semantic core collection, SEO copy and link building.",
    intro: "SEO promotion, technical audits and keyword research from boards and channels.",
    about: "Tasks for SEO specialists: on-page optimization, site structure, audit reports and organic growth.",
  },
  "php-zakazy": {
    h1: "PHP gigs",
    title: "PHP gigs — Laravel, backend development, website fixes",
    description: "Fresh PHP orders: Laravel, Symfony, Yii, backend APIs, payment integrations and legacy site maintenance.",
    intro: "Backend and website development in PHP: Laravel, Yii and custom CMS.",
    about: "Freelance PHP tasks ranging from API integrations and bug fixes to full Laravel web applications.",
  },
  "igry-unity-zakazy": {
    h1: "Game development gigs",
    title: "Game development gigs — Unity, Unreal Engine, 3D & game art",
    description: "Orders for game development in Unity and Unreal Engine, 3D modeling, shaders and game design.",
    intro: "Gamedev: Unity and Unreal games, 3D assets and game art.",
    about: "Freelance projects for game programmers, Unity/Unreal developers, 3D artists and level designers.",
  },
  "testirovanie-zakazy": {
    h1: "QA & testing gigs",
    title: "QA & testing gigs — manual QA, automated tests, web & mobile",
    description: "Fresh orders for website and app testing: manual QA, Playwright/Selenium automation and pre-release audits.",
    intro: "Manual testing and test automation — gigs for QA engineers.",
    about: "Short-term and project-based QA tasks covering functional testing, regression suites and E2E test automation.",
  },
  "vakansii-python": {
    h1: "Python developer jobs",
    title: "Python developer vacancies — Django, FastAPI, data & ML",
    description: "Fresh Python developer vacancies: backend with Django and FastAPI, data engineering and ML with salary ranges.",
    intro: "Python jobs: backend, data and automation with salary ranges and workplace format.",
    about: "Full-time Python engineering positions across backend services, data pipelines and machine learning teams.",
  },
  "vakansii-frontend": {
    h1: "Frontend developer jobs",
    title: "Frontend developer vacancies — React, Vue, TypeScript",
    description: "Fresh frontend developer vacancies: React, Vue, Angular and TypeScript with salary ranges and remote options.",
    intro: "Frontend: React, Vue, TypeScript — fresh vacancies with salary ranges.",
    about: "Frontend and web engineering roles from product companies and international remote boards.",
  },
  "vakansii-devops": {
    h1: "DevOps engineer jobs",
    title: "DevOps & SRE vacancies — Kubernetes, CI/CD, cloud infrastructure",
    description: "Fresh DevOps and SRE vacancies: Kubernetes, Docker, Terraform, CI/CD and cloud platforms.",
    intro: "DevOps and SRE: Kubernetes, CI/CD, cloud — vacancies with salary ranges.",
    about: "Infrastructure, platform engineering, SRE and DevOps vacancies with direct links to employers.",
  },
  "vakansii-analitik": {
    h1: "Analyst jobs",
    title: "Analyst vacancies — systems, business, data & product analysts",
    description: "Fresh analyst vacancies: systems analyst, business analyst, data analyst and BI/product analyst roles.",
    intro: "Systems, business, product and data analysts.",
    about: "Vacancies for systems, business, product and data analysts across tech, fintech and e-commerce employers.",
  },
  "vakansii-testirovshchik": {
    h1: "QA engineer jobs",
    title: "QA & tester vacancies — manual and automation QA",
    description: "Fresh QA engineer vacancies: manual testing, SDET and test automation in Python, Java and TypeScript.",
    intro: "QA: manual testing and test automation — fresh vacancies.",
    about: "Quality assurance and SDET positions for web, mobile and backend systems.",
  },
  "vakansii-dizaynera": {
    h1: "Designer jobs",
    title: "Designer vacancies — UI/UX, product and graphic design",
    description: "Fresh designer vacancies: product design, UI/UX, graphic and motion design roles with salary ranges.",
    intro: "UI/UX, product and graphic designers — vacancies with salary ranges.",
    about: "Design vacancies at product companies, studios and agencies for UI/UX, product, brand and motion designers.",
  },
};

export function localizeCatalogEntry(entry: CatalogEntry, lang?: SupportedLang): CatalogEntry {
  if (lang !== "en") return entry;
  const en = SEO_CATALOG_EN[entry.slug];
  return en ? { ...entry, ...en } : entry;
}

/**
 * Post-filter for catalog pages: guards against legacy rows in the database whose stored
 * `direction` was derived before physical construction/furniture/HVAC noise rules existed.
 */
export function isCatalogLeadRelevant(lead: Lead, entry: CatalogEntry): boolean {
  if (isPhysicalNonItWork(lead.title, lead.text)) return false;
  if (entry.directions?.length && lead.direction === 'dev-other') {
    const liveRole = classifyRole(lead.type ?? entry.type ?? 'gig', lead.title, lead.text);
    if (liveRole === 'other') return false;
  }
  return true;
}

export function findCatalogEntry(slug: string): CatalogEntry | undefined {
  return SEO_CATALOG.find((entry) => entry.slug === slug);
}

function leadRow(lead: Lead, baseUrl: string, lang?: SupportedLang): string {
  // Rows open the lead page on the hub: it carries the details, the score and the link to the source.
  const href = `${baseUrl}/leads/${encodeURIComponent(lead.id)}`;
  // The same meta line as the feed: a salary the feed hides (salaryLooksWrong) is hidden here too.
  return `<a class="row" href="${escapeHtml(href)}">
        <div>
          <div class="row-title">${escapeHtml(lead.title)}</div>
          <div class="row-meta">${escapeHtml(leadMetaLine(lead, lang ?? 'ru'))}</div>
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
function catalogFaq(entry: CatalogEntry, lang?: SupportedLang): Array<[string, string]> {
  const ru = (lang ?? 'ru') !== 'en';
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const what = entry.type === 'job' ? str.vacancies : str.gigs;
  if (!ru) {
    return [
      [
        `Where do ${what} on this page come from?`,
        `From open sources: freelance boards, job portals, RSS feeds and Telegram channels, as well as participants who submit listings by link or via the browser extension. Sources are polled automatically, usually every few minutes.`,
      ],
      [
        `Do I need to pay to apply?`,
        `No. openradar charges no fees for access or replies: each card includes a link to the original source and direct contact info.`,
      ],
      [
        'How do I get notified about new posts in this category?',
        'Subscribe to the RSS feed of this page in any RSS reader or Telegram RSS bot. New listings will arrive without having to visit the site.',
      ],
      [
        'Why do listings have different scores?',
        'The score from 0 to 100 increases for clear task descriptions, stated budgets, relevant skills, and direct contacts. Closed and outdated listings are pruned from the feed.',
      ],
    ];
  }
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
  const { leads, baseUrl, version } = options;
  const entry = localizeCatalogEntry(options.entry, options.lang);
  const ru = (options.lang ?? 'ru') !== 'en';
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const canonical = `${baseUrl}/catalog/${entry.slug}`;
  const feedHref = feedHrefOf(entry);
  const list = leads.length
    ? leads.map((lead) => leadRow(lead, baseUrl, options.lang)).join('')
    : `<div class="empty"><h2>${str.noPostsYet}</h2><p>${str.newListingsWillAppearHere}</p></div>`;
  const faq = catalogFaq(entry, options.lang);
  // Same kind first, so a page on orders links to other orders before vacancies.
  const related = SEO_CATALOG.filter((other) => other.slug !== entry.slug)
    .sort((a, b) => Number(b.type === entry.type) - Number(a.type === entry.type))
    .slice(0, 10)
    .map((other) => localizeCatalogEntry(other, options.lang));

  const body = `
<nav class="crumbs" aria-label="${str.navigation}"><a href="/">openradar</a> / <a href="/catalog">${str.categories}</a> / ${escapeHtml(entry.h1)}</nav>
<div class="page-head">
  <div>
    <h1>${escapeHtml(entry.h1)}</h1>
    <p class="muted small">${escapeHtml(entry.intro)}</p>
  </div>
  <div class="actions">
    <a class="btn ghost" href="${escapeHtml(feedHref)}" rel="noopener">${str.rssFeed}</a>
    <a class="btn" href="/">${entry.type === 'job' ? str.allJobs : str.allGigs}</a>
  </div>
</div>
<div class="list">${list}</div>
<section class="prose">
  <h2>${str.overview}</h2>
  <p>${escapeHtml(entry.about)}</p>
  <p>${str.openradarIsAnOpenBase}</p>
  <h2>${str.questions}</h2>
  ${faqHtml(faq)}
  <h2>${str.relatedCategories}</h2>
  <div class="chip-links">${related.map((other) => `<a href="/catalog/${escapeHtml(other.slug)}">${escapeHtml(other.h1)}</a>`).join('')}<a href="/catalog">${str.allCategories}</a></div>
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
  breadcrumbsJsonLd(baseUrl, [['openradar', '/'], [str.categories, '/catalog'], [entry.h1, `/catalog/${entry.slug}`]]),
  ...(leads.length ? [itemList] : []),
  faqJsonLd(faq),
)}`,
  });
}

/** Index of every landing page, grouped into orders and vacancies. */
export function renderCatalogIndex(options: { baseUrl: string; version: string; auth?: AuthDisplay; lang?: SupportedLang }): string {
  const { baseUrl, version } = options;
  const ru = (options.lang ?? 'ru') !== 'en';
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const card = (rawEntry: CatalogEntry): string => {
    const entry = localizeCatalogEntry(rawEntry, options.lang);
    return `<a class="catalog-card" href="/catalog/${escapeHtml(entry.slug)}"><span class="catalog-card-title">${escapeHtml(entry.h1)}</span><span class="catalog-card-desc">${escapeHtml(entry.intro)}</span></a>`;
  };
  const gigs = SEO_CATALOG.filter((entry) => entry.type !== 'job');
  const jobs = SEO_CATALOG.filter((entry) => entry.type === 'job');
  const description = str.allOpenradarCategoriesFreelanceGigs;
  const body = `
<nav class="crumbs" aria-label="${str.navigation}"><a href="/">openradar</a> / ${str.categories}</nav>
<div class="page-head"><div>
  <h1>${str.categoriesOfOrdersAndVacancies}</h1>
  <p class="muted small">${escapeHtml(description)}</p>
</div></div>
<h2>${str.freelanceGigs}</h2>
<div class="catalog-grid">${gigs.map(card).join('')}</div>
<h2 style="margin-top:32px">${str.vacancies2}</h2>
<div class="catalog-grid">${jobs.map(card).join('')}</div>`;
  return layout({
    auth: options.auth,
    lang: options.lang,
    title: str.categoriesOfOrdersAndVacancies,
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/catalog">
${ldScripts(breadcrumbsJsonLd(baseUrl, [['openradar', '/'], [str.categories, '/catalog']]))}`,
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
    <li>Vacancies: hh.ru, Habr Career, the state portal Rabota Rossii (Work in Russia), company career pages on Greenhouse, Lever and Ashby, We Work Remotely, RemoteOK and other remote boards.</li>
    <li>Telegram channels with orders and vacancies, public and private.</li>
    <li>Participants: posts added by link, through the <a href="/extension">browser extension</a> and from their own nodes.</li>
  </ul>
  <p>The public list of connected boards is on the <a href="/sources">sources page</a>.</p>
  <p>The same post found in several places is shown as one card. Closed orders and stale vacancies leave the feed: the server rechecks source pages, and participants mark closed posts.</p>

  <h2>Scoring and moderation</h2>
  <p>Every post gets a score from 0 to 100 for a stated budget or pay range, a clear description, the skills needed and a direct contact. Participants vote: useful, spam, scam, closed. A vote from a participant with a high rating weighs more, so spam and scams leave the feed faster.</p>

  <h2>Why it is free</h2>
  <p>The participants fill the feed. Those who bring posts see the feed earlier: a guest with a delay, a member signed in with GitHub sooner, active participants almost at once. There is no paid plan and none is planned.</p>

  <h2>Open source</h2>
  <p>The code is open under AGPL-3.0. Anyone can run a node at home or on a server with their own sources, filters and Telegram notifications. Nodes can send posts to the shared base, each one signed with the participant's key.</p>
  <ul>
    <li><a href="${REPO_URL}" target="_blank" rel="noopener">Source code on GitHub</a></li>
    <li><a href="${REPO_URL}/blob/main/docs/GETTING_STARTED_EN.md" target="_blank" rel="noopener">How to run your own node</a></li>
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
  <p>Публичный список подключённых площадок — на <a href="/sources">странице источников</a>.</p>
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
  <p>Which boards openradar already reads: the <a href="/sources">sources page</a>.</p>
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
  <p>Какие площадки уже читает openradar — на <a href="/sources">странице источников</a>.</p>
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
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const handle = escapeHtml(options.handle);
  const rows = options.posts.map((lead) => leadRow(lead, options.baseUrl, options.lang)).join('\n');
  const body = `
<nav class="crumbs" aria-label="${str.navigation}"><a href="/network">${str.participants}</a> / @${handle}</nav>
<div class="page-head"><div>
  <h1>@${handle}</h1>
  <p class="muted small"><a href="https://github.com/${handle}" rel="noopener nofollow">GitHub</a> · ${str.onOpenradarSince} ${escapeHtml(options.since.slice(0, 10))}</p>
</div></div>
<section class="profile">
  <p>${str.postsBrought}: <strong>${options.total}</strong> · ${str.pointsOver30Days}: <strong>${Math.round(options.points * 10)}</strong> · ${str.tier}: <strong>${escapeHtml(options.tier)}</strong></p>
  <h2>${str.latestPosts}</h2>
  ${rows ? `<div class="list">${rows}</div>` : `<p class="muted">${str.noPublicPostsYet}</p>`}
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
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const percent = (value: number | undefined): string => (value === undefined ? '—' : `${Math.round(value * 100)}%`);
  const rows = options.rows.map(({ id, title, enabled, quality, input, issues }) => `<tr>
    <td><a href="/sources/${escapeHtml(encodeURIComponent(id))}">${escapeHtml(translateSourceTitle(title, options.lang))}</a>${enabled ? '' : ` <span class="muted small">${str.off}</span>`}</td>
    <td class="num"><strong>${quality.score ?? '—'}</strong></td>
    <td>${quality.grade === 'new' ? str.tooNew : quality.grade}</td>
    <td class="num">${percent(quality.parts.access)}</td>
    <td class="num">${input?.inserted ?? 0}</td>
    <td class="num">${percent(quality.parts.alive)}</td>
    <td class="num">${percent(quality.parts.complete)}</td>
    <td class="num">${percent(quality.parts.trust)}</td>
    <td class="num">${issues ?? 0}</td>
  </tr>`).join('\n');
  const body = `
<nav class="crumbs" aria-label="${str.navigation}"><a href="/sources">${str.sources}</a> / ${str.quality}</nav>
<div class="page-head"><div>
  <h1>${str.sourceQuality}</h1>
  <p class="muted small">${str.overDaysDoesASource(options.days)} <a href="https://github.com/MikhailSagalaev/openradar/blob/main/docs/QUALITY.md" rel="noopener">${str.howItIsCounted}</a></p>
</div></div>
<section class="profile">
  <table class="profile-table">
    <thead><tr><th>${str.source}</th><th>${str.score}</th><th>${str.grade}</th><th>${str.answers}</th><th>${str.new}</th><th>${str.alive}</th><th>${str.complete}</th><th>${str.readers}</th><th>${str.readingIssues}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
  return layout({ title: str.sourceQuality, version: options.version, active: 'sources', body, auth: options.auth, lang: options.lang });
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
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
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
  <h1>${str.checkingPostsByHand}</h1>
  <p class="muted small">${str.checkedOf300(total)}${counts}</p>
</div></div>
${renderAdminTabs('labels', !ru)}
<section class="profile">
  ${lead ? `
  <p class="muted small">${escapeHtml(options.sourceTitle ?? '')} · ${lead.type === 'job' ? str.vacancy : str.order}${lead.url ? ` · <a href="${escapeHtml(lead.url)}" target="_blank" rel="noopener noreferrer">${str.openTheOriginal}</a>` : ''}</p>
  <h2>${escapeHtml(lead.title)}</h2>
  <p style="white-space:pre-wrap">${escapeHtml(lead.text.slice(0, 1500))}</p>
  <form method="post" action="/admin/labels"><input type="hidden" name="id" value="${escapeHtml(lead.id)}">${buttons}</form>` : `<p class="muted">${str.nothingToCheck}</p>`}
</section>`;
  return layout({ title: str.handCheck, version: options.version, body, auth: options.auth, lang: options.lang, head: '<meta name="robots" content="noindex">' });
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
  const ru = options.lang !== 'en';
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const share = (part: number, whole: number): string => (whole ? `${Math.round((part / whole) * 100)}% (${part} ${str.of} ${whole})` : '—');
  const names: Record<string, string> = ru
    ? { closed: 'Похоже закрыт', scam: 'Похоже на мошенничество', other: 'Не работа', resume: 'Резюме', type: 'Другой тип' }
    : { closed: 'Likely closed', scam: 'Likely scam', other: 'Not work', resume: 'Resume', type: 'Different type' };
  const flags = ([
    [str.closed, score.closed],
    [str.junk, score.junk],
    [str.scam, score.scam],
    [str.postType, score.type],
  ] as Array<[string, FlagScore]>)
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
  <h1>${str.modelDecisions}</h1>
  <p class="muted small">${str.sureAnswersHidePostsAnd}</p>
</div></div>
${renderAdminTabs('decisions', !ru)}
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
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
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
      <input type="search" class="review-picker-search" placeholder="${str.search}" aria-label="${str.search}">
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
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const { lead, directions } = options;
  const signedIn = Boolean(options.auth?.handle || options.auth?.isAdmin);
  const shown = directions.find((item) => item.slug === lead?.direction)?.label ?? str.other;
  const typeName = lead?.type === 'job' ? str.job : str.gig2;
  const company = lead ? (lead.company ?? lead.author) : '';
  const salary = lead ? (salaryRange(lead, options.lang ?? 'ru') ?? (typeof lead.budget === 'number' ? formatBudget(lead.budget, lead.currency) : (lead.rawSalary ?? ''))) : '';
  const host = lead?.url ? safeHttpUrl(lead.url)?.replace(/^https?:\/\//, '')?.split('/')[0]?.replace(/^www\./, '') : '';
  const remote = lead?.isRemote ? str.remote : '';
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
    ${lead.url ? `<a class="btn review-original" href="${escapeHtml(lead.url)}" target="_blank" rel="noopener noreferrer">${str.openOriginal}</a>` : ''}
  </div>
</div>

<div class="detail-grid review-grid">
  <section class="review-lead-col">
    <h2>${lead.type === 'job' ? str.jobDescription : str.gigDescription}</h2>
    <div class="lead-text review-lead-scroll">${formatted.html}</div>
  </section>

  <aside class="review-actions-col">
    <form method="post" action="/review" class="review-form"${signedIn ? '' : ' data-guest="true"'}>
      <input type="hidden" name="id" value="${escapeHtml(lead.id)}">
      <input type="hidden" name="bucket" value="${escapeHtml(options.bucket ?? '')}">
      <input type="hidden" name="c" value="${escapeHtml(options.direction)}">

      <h2>${str.verdict}</h2>
      <div class="review-shown">
        <div class="review-shown-line">${str.shownAs} <strong>${typeName}</strong> · <strong>${escapeHtml(shown)}</strong></div>
        <details class="review-fix">
          <summary>${str.fixTypeOrDirection}</summary>
          <div class="review-fix-body">
            <div class="review-fix-row">
              <label class="review-fix-label">
                <input type="checkbox" name="type_fix" value="${lead.type === 'job' ? 'gig' : 'job'}">
                ${lead.type === 'job' ? str.thisIsAGig : str.thisIsAJob}
              </label>
              ${directionPicker('direction_fix', str.otherDirection, directions.filter((item) => item.slug), '', false, options.lang)}
            </div>
          </div>
        </details>
      </div>

      <div class="review-answers">
        <button class="review-ans-btn review-ans-btn-primary" name="verdict" value="ok" type="submit" title="${str.legitimateWorkBriefTextIs}">
          <span class="review-ans-num">1</span>
          <span class="review-ans-text">
            <strong>${str.looksGood}</strong>
            <small>${str.legitimateWorkCorrectTypeEnter}</small>
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
        <button class="review-ans-btn review-ans-btn-skip" name="verdict" value="unsure" type="submit" title="${str.skipThisPostWithoutGrading}">
          <span class="review-ans-num">5</span>
          <span class="review-ans-text">
            <strong>${str.skip}</strong>
            <small>${str.skipWithoutGrading}</small>
          </span>
        </button>
      </div>

      <h2 class="review-issues-title">${str.ingestionIssues}</h2>
      <div class="review-chips">
        ${Object.entries(issueNames).map(([key, name]) => `
        <label class="review-chip">
          <input type="checkbox" name="issues" value="${key}">
          <span>${escapeHtml(name)}</span>
        </label>`).join('')}
      </div>
      <input type="text" name="note" class="review-note" maxlength="300" placeholder="${str.optionalNoteAboutParsingIssues}" aria-label="${str.comment}">
    </form>
  </aside>
</div>` : `
<div class="empty review-empty">
  <h2>${str.nothingToReviewYet}</h2>
  <p>${str.allPostsInThisDirection}</p>
</div>`;

  const body = `
<div class="review-nav">
  <div class="review-nav-left">
    <a class="back" href="/">${str.allLeads}</a>
    <span class="review-nav-sep">·</span>
    ${directionPicker('c', str.allDirections, [{ slug: '', label: str.allDirections }, ...directions], options.direction, true, options.lang)}
  </div>
  <div class="review-nav-right">
    ${signedIn ? `<span class="review-counter">${str.youReviewed(options.mine)}</span>` : `<span class="review-counter">${str.postReview}</span>`}
    <button type="button" class="link-btn review-help-trigger" title="${str.reviewGuide}">${str.howToReview}</button>
    ${options.last ? `<form method="post" action="/review/undo" class="review-undo-inline"><input type="hidden" name="id" value="${escapeHtml(options.last)}"><button class="link-btn review-undo-btn" type="submit" title="${str.undoLastAnswerZ}">${str.undoAnswerZ}</button></form>` : ''}
  </div>
</div>
${content}
<div id="review-help-modal" class="review-modal" style="display:none">
  <div class="review-modal-backdrop"></div>
  <div class="review-modal-card">
    <div class="review-modal-head">
      <h3>${str.howToReview2}</h3>
      <button type="button" class="link-btn review-modal-close">${str.close}</button>
    </div>
    <ul class="review-help-list">
      <li>${str.evaluateTheJobGigItself}</li>
      <li>${str.ifTheDescriptionIsBrief}</li>
      <li>${str.ifTheOriginalIsLegitimate}</li>
      <li>${str.notWorkAdsCoursesResumes}</li>
      <li>${str.suspiciousUpfrontFeesHighPay}</li>
      <li>${str.alreadyClosedPositionFilledListing}</li>
      <li>${str.unsureClickSkipItIs}</li>
      <li>${str.keys15OrEnter}</li>
    </ul>
  </div>
</div>`;
  const pageTitle = lead ? `${leadTitle(lead)} · ${str.postReview}` : str.postReview;
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
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const rows = options.employers.map((e, index) => `<tr><td>${index + 1}</td><td><a href="${escapeHtml(employerPath(e.key))}">${escapeHtml(e.name)}</a></td><td class="num">${e.active}</td><td>${escapeHtml(e.lastAt.slice(0, 10))}</td></tr>`).join('\n');
  const description = str.companiesWithOpenVacanciesHow;
  const body = `
<div class="page-head"><div>
  <h1>${str.employers}</h1>
  <p class="muted small">${escapeHtml(description)}</p>
</div></div>
<section class="profile">
  <form method="get" action="/employers" class="form" role="search">
    <input type="search" name="q" value="${escapeHtml(options.query ?? '')}" placeholder="${str.companyName}" aria-label="${str.findACompany}">
  </form>
  ${rows ? `<table class="profile-table">
    <thead><tr><th>#</th><th>${str.company}</th><th>${str.open}</th><th>${str.latest}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>` : `<p class="muted">${str.noSuchCompaniesYet}</p>`}
</section>`;
  const head = options.query
    ? '<meta name="robots" content="noindex">'
    : `<link rel="canonical" href="${escapeHtml(`${options.baseUrl}/employers`)}">\n<meta name="description" content="${escapeHtml(description)}">`;
  return layout({ title: `${str.employers}`, version: options.version, active: 'employers', body, auth: options.auth, lang: options.lang, head });
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
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const name = escapeHtml(options.name);
  const url = `${options.baseUrl}${employerPath(options.employerKey)}`;
  const rows = options.posts.map((lead) => leadRow(lead, options.baseUrl, options.lang)).join('\n');
  const displaySkills = options.skills.map((s) => translateSkill(s, options.lang));
  const displayCities = options.cities.map((c) => translateCity(c, options.lang) ?? c);
  const hiring = displaySkills.slice(0, 3).join(', ');
  const description = options.active
    ? (str.openVacanciesAtNow(options.name, options.active, hiring ? `, чаще всего ${hiring}` : '', hiring ? `, mostly ${hiring}` : ''))
    : (str.hasNoOpenVacanciesNow(options.name));
  const tile = (value: string | number, label: string): string => `<div class="employer-stat"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
  const stats = options.active
    ? `<div class="employer-stats">
    ${tile(options.active, str.openNow)}
    ${tile(options.fresh, str.newIn7Days)}
    ${tile(`${options.remoteShare}%`, str.remote2)}
    ${tile(options.boards, str.sources2)}
  </div>`
    : '';
  const facts = [
    displaySkills.length ? `<div><dt>${str.mostlyHiringFor}</dt><dd>${escapeHtml(displaySkills.join(', '))}</dd></div>` : '',
    displayCities.length ? `<div><dt>${str.cities}</dt><dd>${escapeHtml(displayCities.join(', '))}</dd></div>` : '',
  ].filter(Boolean).join('\n');
  const later = options.later > 0
    ? `<p class="muted">${str.moreFreshVacancies(options.later)} ${options.signedIn ? str.theyOpenALittleLater : `<a href="/login?returnTo=${escapeHtml(encodeURIComponent(employerPath(options.employerKey)))}">${str.signInToSeeThem}</a>.`}</p>`
    : '';
  const empty = !options.active ? `<p class="muted">${str.noOpenVacanciesNow}</p>` : '';
  const body = `
<nav class="crumbs" aria-label="${str.navigation}"><a href="/employers">${str.employers}</a> / ${name}</nav>
<div class="page-head"><div>
  <h1>${str.vacanciesAt} ${name}</h1>
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
    name: `${str.vacanciesAt} ${options.name}`,
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
  return layout({ title: `${str.vacanciesAt} ${options.name}`, version: options.version, active: 'employers', body, auth: options.auth, lang: options.lang, head });
}

export function renderNetworkPage(options: {
  baseUrl: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
  participants: Array<{ shortPubkey: string; name?: string; about?: string; handle?: string; posts: number; points: number; tier: string }>;
  sources: Array<{ title: string; leads: number; href?: string }>;
  totalWeekLeads?: number;
  windowDays: number;
}): string {
  const { baseUrl, version } = options;
  const ru = options.lang !== 'en';
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const totalPoints = Math.round(options.participants.reduce((sum, p) => sum + p.points, 0) * 10);
  const totalLeads = options.totalWeekLeads ?? options.sources.reduce((sum, s) => sum + s.leads, 0);

  const participantRows = options.participants.map((p, index) => {
    const name = p.handle ? `@${escapeHtml(p.handle)}` : p.name ? escapeHtml(p.name) : `<code>${escapeHtml(p.shortPubkey)}</code>`;
    const label = p.handle ? `<a href="/u/${escapeHtml(encodeURIComponent(p.handle))}">${name}</a>` : name;
    return `<tr><td>${index + 1}</td><td>${label}${p.about ? `<div class="muted small">${escapeHtml(p.about.slice(0, 120))}</div>` : ''}</td><td class="num">${p.posts}</td><td class="num">${Math.round(p.points * 10)}</td><td>${escapeHtml(p.tier)}</td></tr>`;
  }).join('\n');

  const sourceRows = options.sources.map((s) => {
    const displayTitle = translateSourceTitle(s.title, options.lang);
    const title = s.href ? `<a href="${escapeHtml(s.href)}">${escapeHtml(displayTitle)}</a>` : escapeHtml(displayTitle);
    return `<tr><td>${title}</td><td class="num">${s.leads}</td></tr>`;
  }).join('\n');

  const body = `
<nav class="crumbs" aria-label="${str.navigation}"><a href="/">openradar</a> / ${str.network}</nav>
<div class="page-head"><div>
  <h1>${str.theOpenradarNetwork}</h1>
  <p class="muted small">${str.participantsContributeToTheShared(options.windowDays)}</p>
</div></div>

<div class="detail-grid" style="grid-template-columns: 1.4fr 1fr;">
  <section>
    <h2>${str.participants}</h2>
    ${options.participants.length ? `
    <table class="profile-table">
      <thead><tr><th>#</th><th>${str.participant}</th><th>${str.posts}</th><th>${str.points}</th><th>${str.tier2}</th></tr></thead>
      <tbody>${participantRows}</tbody>
    </table>
    <p class="muted small">${str.participantsWithALinkedGithub}</p>`
    : `<p class="muted">${str.nobodyHasEarnedPointsYet}</p>`}
  </section>
  <section>
    <h2>${str.sourcesOfTheWeek}</h2>
    ${options.sources.length ? `
    <table class="profile-table">
      <thead><tr><th>${str.source}</th><th>${str.leads}</th></tr></thead>
      <tbody>${sourceRows}</tbody>
    </table>
    <p class="muted small">${str.postsThisWeekAcrossAutomated(totalLeads.toLocaleString('ru-RU'), totalLeads.toLocaleString('en-US'))}</p>`
    : `<p class="muted">${str.noDataForTheWeek}</p>`}
    <details class="score-help"><summary>${str.howToGetOnThe}</summary>
      <p>${str.installTheBrowserExtensionSubmit(totalPoints, options.windowDays)}</p>
    </details>
  </section>
</div>`;

  const description = str.openradarParticipantsAndSourcesThe;

  return layout({
    auth: options.auth,
    lang: options.lang,
    title: str.network,
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
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const card = (icon: string, title: string, minutes: string, text: string, snippet: string, gain: string): string => `
  <div class="path">
    <div class="path-head"><span class="path-icon" aria-hidden="true">${icon}</span>${escapeHtml(title)}<span class="path-time">${escapeHtml(minutes)}</span></div>
    <p>${text}</p>
    <pre>${snippet}</pre>
    <div class="path-get">${gain}</div>
  </div>`;

  const body = `
<nav class="crumbs" aria-label="${str.navigation}"><a href="/">openradar</a> / ${str.contribute}</nav>
<div class="page-head"><div>
  <h1>${str.connectASourceIn10}</h1>
  <p class="muted small">${str.bringTheOrdersOnlyYou}</p>
</div></div>

<div class="paths">
  ${card('①', str.aTelegramChannel, str.t10Minutes,
    str.aPublicOrYourPrivate,
    str.radarTelegramLoginSaveSession,
    str.t15RatingForA)}
  ${card('②', str.yourOwnParser, str.t5Minutes,
    str.anyScriptInAnyLanguage,
    str.radarSourceAddKindWebhook,
    str.theScoreComesFromRules)}
  ${card('③', str.aFullNode, str.t15Minutes,
    str.aFeedOfYourOwn,
    str.gitCloneGitCdOpenradar(REPO_URL),
    str.theShareFlagSendsLeads)}
</div>

<div class="detail-grid" style="grid-template-columns: 1.2fr 1fr;">
  <section class="prose" style="margin-top:14px">
    <h2>${str.whatContributionGives}</h2>
    <ul>
      <li>${str.earlyAccessActiveSeesLeads}</li>
      <li>${str.rating10ForThe}</li>
      <li>${str.attributionSourcesOfTheWeek}</li>
      <li>${str.storyWall(REPO_URL)}</li>
    </ul>
    <p class="muted small">${str.notReadyToShareSubscribe}</p>
  </section>
  <section class="prose" style="margin-top:14px">
    <h2>${str.accessTiers}</h2>
    <table class="profile-table">
      <thead><tr><th>${str.tier2}</th><th>${str.how}</th><th>${str.delay}</th></tr></thead>
      <tbody>
        <tr><td>Guest</td><td>${str.notSignedIn}</td><td>12 ч</td></tr>
        <tr><td>Member</td><td>GitHub</td><td>3 ч</td></tr>
        <tr><td>Active</td><td>${str.rating10}</td><td>30 ${str.min}</td></tr>
        <tr><td>Core</td><td>${str.rating50}</td><td>—</td></tr>
      </tbody>
    </table>
    <p class="muted small">${str.protocolDetails}<a href="${REPO_URL}/blob/main/docs/PROTOCOL.md" target="_blank" rel="noopener">docs/PROTOCOL.md</a></p>
  </section>
</div>`;

  const description = str.connectYourTelegramChannelParser;

  return layout({
    auth: options.auth,
    lang: options.lang,
    title: str.contribute,
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/contribute">`,
  });
}

/** What we collect, what we never collect, how to get data removed. */
/** Human-readable public API docs generated from the OpenAPI 3.1 description. */
export function renderApiDocsPage(options: {
  baseUrl: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
}): string {
  const { baseUrl, version } = options;
  const ru = options.lang !== 'en';
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const spec = renderOpenApi(baseUrl) as {
    info: { title: string; description: string };
    paths: Record<string, Record<string, {
      summary?: string;
      description?: string;
      parameters?: Array<{ name: string; in: string; required?: boolean; description?: string; schema?: Record<string, unknown> }>;
      requestBody?: { description?: string };
      responses?: Record<string, { description?: string }>;
    }>>;
    components?: { schemas?: Record<string, { description?: string; properties?: Record<string, { type?: string; description?: string; enum?: unknown[]; format?: string }> }> };
  };

  const schemaType = (schema?: Record<string, unknown>): string => {
    if (!schema) return '';
    if (Array.isArray(schema.enum)) return `enum: ${(schema.enum as unknown[]).map(String).join(' | ')}`;
    const parts = [schema.type, schema.format].filter(Boolean).map(String);
    if (schema.minimum != null) parts.push(`min ${schema.minimum}`);
    if (schema.maximum != null) parts.push(`max ${schema.maximum}`);
    if (schema.default != null) parts.push(`default ${schema.default}`);
    return parts.join(', ');
  };

  const endpoints = Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => {
      const params = (op.parameters ?? [])
        .map((param) => {
          const req = param.required ? str.required : str.optional;
          const type = schemaType(param.schema);
          return `<tr><td><code>${escapeHtml(param.name)}</code></td><td>${escapeHtml(param.in)}</td><td>${escapeHtml(req)}</td><td>${escapeHtml(type)}</td><td>${escapeHtml(param.description ?? '')}</td></tr>`;
        })
        .join('');
      const responses = Object.entries(op.responses ?? {})
        .map(([code, response]) => `<li><code>${escapeHtml(code)}</code> — ${escapeHtml(response.description ?? '')}</li>`)
        .join('');
      const anchor = `${method}-${path.replace(/[^\w]+/g, '-')}`;
      return `
<article class="api-endpoint" id="${escapeHtml(anchor)}">
  <h2><code class="api-method">${escapeHtml(method.toUpperCase())}</code> <code>${escapeHtml(path)}</code></h2>
  <p>${escapeHtml(op.summary ?? '')}</p>
  ${op.description ? `<p class="muted">${escapeHtml(op.description)}</p>` : ''}
  ${params ? `<h3>${str.parameters}</h3>
  <div class="table-wrap"><table class="api-params">
    <thead><tr><th>${str.name}</th><th>${str.in}</th><th>${str.required2}</th><th>${str.type}</th><th>${str.description}</th></tr></thead>
    <tbody>${params}</tbody>
  </table></div>` : ''}
  ${op.requestBody?.description ? `<p><strong>${str.requestBody}</strong> ${escapeHtml(op.requestBody.description)}</p>` : ''}
  ${responses ? `<h3>${str.responses}</h3><ul>${responses}</ul>` : ''}
  <p class="muted small"><a href="${escapeHtml(baseUrl)}${escapeHtml(path.split('{')[0]!)}">${str.tryOnTheLiveSite}</a></p>
</article>`;
    }),
  ).join('\n');

  const leadProps = Object.entries(spec.components?.schemas?.Lead?.properties ?? {})
    .map(([name, prop]) => {
      const type = [prop.type, prop.format].filter(Boolean).join(', ');
      const enumText = Array.isArray(prop.enum) ? ` (${prop.enum.map(String).join(' | ')})` : '';
      return `<tr><td><code>${escapeHtml(name)}</code></td><td>${escapeHtml(type + enumText)}</td><td>${escapeHtml(prop.description ?? '')}</td></tr>`;
    })
    .join('');

  const title = str.httpApi;
  const description = str.openradarPublicRestApiEndpoints;
  const body = `
<nav class="crumbs" aria-label="${str.navigation}"><a href="/">openradar</a> / API</nav>
<div class="page-head"><div>
  <h1>${escapeHtml(spec.info.title)}</h1>
  <p class="muted small">${escapeHtml(spec.info.description)}</p>
</div></div>
<section class="prose" style="margin-top:0">
  <p>${str.noApiKeyGuestsSee}<a href="/openapi.json"><code>/openapi.json</code></a>${str.rfc9727Catalog}<a href="/.well-known/api-catalog"><code>/.well-known/api-catalog</code></a>; MCP: <a href="/mcp"><code>/mcp</code></a>.</p>
  <h2>${str.quickStart}</h2>
  <pre><code>curl "${escapeHtml(baseUrl)}/api/leads?q=python&amp;type=gig&amp;limit=5"
curl "${escapeHtml(baseUrl)}/api/market?title=python%20backend&amp;type=job"
curl "${escapeHtml(baseUrl)}/v2/feed?limit=20"</code></pre>
  <h2>${str.endpoints}</h2>
  ${endpoints}
  <h2>${str.leadSchema}</h2>
  <p>${escapeHtml(spec.components?.schemas?.Lead?.description ?? '')}</p>
  <div class="table-wrap"><table class="api-params">
    <thead><tr><th>${str.field}</th><th>${str.type}</th><th>${str.description}</th></tr></thead>
    <tbody>${leadProps}</tbody>
  </table></div>
</section>
<style>
.api-endpoint { margin: 28px 0; padding-top: 8px; border-top: 1px solid var(--line, #ddd); }
.api-method { display: inline-block; min-width: 3.5rem; font-weight: 700; }
.table-wrap { overflow-x: auto; }
.api-params { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
.api-params th, .api-params td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--line, #ddd); }
.api-params code { font-size: 0.9em; }
</style>`;

  return layout({
    auth: options.auth,
    lang: options.lang,
    title,
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(baseUrl)}/docs">`,
  });
}

export function renderTrustPage(options: {
  baseUrl: string;
  version: string;
  auth?: AuthDisplay;
  lang?: SupportedLang;
}): string {
  const { baseUrl, version } = options;
  const ru = options.lang !== 'en';
  const str = SEO_STRINGS[ru ? 'ru' : 'en'];
  const body = `
<nav class="crumbs" aria-label="${str.navigation}"><a href="/">openradar</a> / Trust</nav>
<div class="page-head"><div>
  <h1>Trust &amp; data</h1>
  <p class="muted small">${str.whatOpenradarCollectsWhatIt}</p>
</div></div>
<section class="prose" style="margin-top:0">
  <h2>${str.whatWeCollect}</h2>
  <p>${str.publicPostingsOnlyOpenBoard}</p>
  <h2>${str.whatIsNeverHere}</h2>
  <ul>
    <li>${str.resumesAndCandidateProfiles}</li>
    <li>${str.peopleContactDetailsBeyondThose}</li>
    <li>${str.loginCaptchaOrPaywallBypass}</li>
    <li>${str.paidAccessThereIsNo}</li>
  </ul>
  <h2>${str.security}</h2>
  <p>${str.secretsLiveInNodeEnvironment}</p>
  <h2>${str.removal}</h2>
  <p>${str.aBoardCanAskTo}${'<a href="' + REPO_URL + '/issues" target="_blank" rel="noopener">GitHub issues</a>.'}</p>
  <p class="muted small">${str.serviceStatus}<a href="/health">/health</a> · ${str.apiDocs}<a href="/docs">/docs</a> · <a href="/openapi.json">/openapi.json</a></p>
</section>`;

  const description = str.whatOpenradarCollectsPublicPostings;

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

export function renderLlmsTxt(baseUrl: string, lang: SupportedLang = 'ru'): string {
  if (lang === 'en') {
    const lineEn = (raw: CatalogEntry): string => {
      const entry = localizeCatalogEntry(raw, 'en');
      return `- [${entry.h1}](${baseUrl}/catalog/${entry.slug}): ${entry.description}`;
    };
    return `# openradar\n\n> Open-source aggregator of freelance gigs and IT vacancies. Collects listings from freelance boards (FL.ru, Kwork, Freelancehunt), job boards (hh.ru, Habr Career, Rabota Rossii, We Work Remotely, Jobicy, RemoteOK), company ATS pages and Telegram channels into one deduplicated feed. Free, no paid tiers, open source (AGPL-3.0).\n\n## Sections\n\n- [Gigs and jobs feed](${baseUrl}/?lang=en): search, filters by skills, budget, direction and remote work.\n- [Labour market research & econometrics](${baseUrl}/en/research): empirical study of salaries and freelance budgets — role x seniority heatmaps, programming language x seniority heatmaps, regional comparisons (Moscow, St. Petersburg, regions, all-Russia remote), Mincerian log-wage OLS regression (White HC1 robust SEs), ANOVA variance decomposition (eta-squared), Mann-Whitney U / Kruskal-Wallis H / Spearman rho hypothesis tests, Gini index, decile ratios, and employer HHI concentration. Open data (CC BY 4.0): [Dataset CSV](${baseUrl}/research/dataset.csv), [Report JSON](${baseUrl}/research/report.json), [Daily Panel Index JSON](${baseUrl}/research/index.json), [Index CSV](${baseUrl}/research/index.csv), [Methodology & Codebook](${baseUrl}/en/research/methodology). Standard academic citation (APA 7th): openradar Research. (2026). Russian IT & Freelance Labour Market Empirical Dataset and Econometric Report [Data set]. ${baseUrl}/en/research\n- [About](${baseUrl}/about?lang=en): how openradar works and where listings come from.\n- [Sources](${baseUrl}/sources?lang=en): public list of connected boards and channels.\n- [FAQ](${baseUrl}/faq?lang=en)\n- [Browser extension](${baseUrl}/extension?lang=en): submit vacancies from any site and estimate market pay.\n- [RSS feed](${baseUrl}/feed.rss): query parameters q (search) and type (gig or job).\n- [HTTP API](${baseUrl}/docs): endpoints, parameters and responses; OpenAPI 3.1 — ${baseUrl}/openapi.json; API catalog — ${baseUrl}/.well-known/api-catalog; MCP server — ${baseUrl}/mcp (tools: search_leads, get_lead_details, get_market_analytics, estimate_compensation).\n- [Agent skill pack](${baseUrl}/skill.md): install the ready-made skills (/orders, /market) and the MCP connection in one command — Claude Code: /plugin marketplace add MikhailSagalaev/openradar-plugin, others: npx skills add MikhailSagalaev/openradar-plugin.\n\n## Freelance Gigs\n\n${SEO_CATALOG.filter((entry) => entry.type !== 'job').map(lineEn).join('\n')}\n\n## Vacancies\n\n${SEO_CATALOG.filter((entry) => entry.type === 'job').map(lineEn).join('\n')}\n\n## Agent quickstart\n\nThe REST API answers without authentication. A guest reads the feed with a 12-hour delay and never sees contact details: every lead carries the URL of the original post — link users there, never republish contacts.\n\n    GET ${baseUrl}/api/leads?q=backend&limit=50      # search; without q it ranks by quality score; filters: type, direction, workplace, language, budget\n    GET ${baseUrl}/api/leads/{id}                    # one lead card\n    GET ${baseUrl}/api/market?title=backend+developer # pay percentiles from posted pay, last 90 days\n    GET ${baseUrl}/api/delta?since=2026-11-18T00:00:00Z # changed leads since a moment; keep a local index in sync with this instead of re-fetching the whole feed\n\nRules: honor the Cache-Control headers instead of polling; a 404 on /api/leads/{id} can mean "not visible to guests yet", not deleted — retry later or watch /api/delta; the full parameter reference is ${baseUrl}/openapi.json.\n\n## For Developers\n\n- [Source code](${REPO_URL})\n- [How to run your own node (EN)](${REPO_URL}/blob/main/docs/GETTING_STARTED_EN.md)\n- [Exchange protocol](${REPO_URL}/blob/main/docs/PROTOCOL.md)\n`;
  }
  const line = (entry: CatalogEntry): string => `- [${entry.h1}](${baseUrl}/catalog/${entry.slug}): ${entry.description}`;
  return `# openradar

> Открытая база заказов для фрилансеров и IT-вакансий. Собирает публикации с бирж (FL.ru, Kwork, Freelancehunt), сайтов вакансий (hh.ru, Хабр Карьера, «Работа России», We Work Remotely, Jobicy, RemoteOK) и Telegram-каналов в одну ленту. Бесплатно, без платных тарифов, код открыт (AGPL-3.0).

## Разделы

- [Лента заказов и вакансий](${baseUrl}/): поиск, фильтры по навыкам, бюджету и удалёнке.
- [Научные исследования рынка и эконометрика](${baseUrl}/research): эмпирическое исследование зарплат и бюджетов — тепловые карты «Направление × Грейд», «Язык × Грейд» и «Направление × Регион и удалёнка», оценка уравнения заработной платы Минсера (МНК с робастными ошибками Уайта HC1), декомпозиция дисперсии зарплат (ANOVA η²), проверка гипотез (критерии Манна — Уитни U, Краскела — Уоллиса H, корреляция Спирмена), индекс Джини, децильные коэффициенты и индекс концентрации нанимателей HHI. Открытые данные (CC BY 4.0): [Микроданные CSV](${baseUrl}/research/dataset.csv), [Полный отчёт JSON](${baseUrl}/research/report.json), [Панельный индекс JSON](${baseUrl}/research/index.json), [Индекс CSV](${baseUrl}/research/index.csv), [Методика и словарь переменных Codebook](${baseUrl}/research/methodology). Цитирование по ГОСТ Р 7.0.5–2008: Рынок труда в IT и фрилансе: эмпирическое исследование и открытый датасет // openradar. — URL: ${baseUrl}/research
- [О проекте](${baseUrl}/about): как устроен openradar и откуда публикации.
- [Источники](${baseUrl}/sources): публичный список площадок, с которых собираются заказы и вакансии.
- [Вопросы и ответы](${baseUrl}/faq)
- [Расширение для браузера](${baseUrl}/extension): отправка вакансии с любого сайта и оценка рыночной оплаты.
- [RSS-лента](${baseUrl}/feed.rss): параметры q (поиск) и type (gig — заказы, job — вакансии).
- [HTTP API](${baseUrl}/docs): эндпоинты, параметры и ответы; OpenAPI 3.1 — ${baseUrl}/openapi.json; каталог — ${baseUrl}/.well-known/api-catalog; MCP-сервер — ${baseUrl}/mcp (tools: search_leads, get_lead_details, estimate_compensation, submit_lead, vote_lead, get_market_analytics, save_search, list_saved_searches, xray_generate_dorks).
- [Пакет скиллов для агентов](${baseUrl}/skill.md): готовые скиллы (/orders, /market) и подключение к MCP одной командой — Claude Code: /plugin marketplace add MikhailSagalaev/openradar-plugin, остальные: npx skills add MikhailSagalaev/openradar-plugin.

## Заказы

${SEO_CATALOG.filter((entry) => entry.type !== 'job').map(line).join('\n')}

## Вакансии

${SEO_CATALOG.filter((entry) => entry.type === 'job').map(line).join('\n')}

## Быстрый старт для агента

REST API отвечает без аутентификации. Гость видит ленту с задержкой 12 часов и не видит контактов: у каждой публикации есть ссылка на исходный пост — ведите пользователя туда, не переиздавайте контакты.

    GET ${baseUrl}/api/leads?q=backend&limit=50      # поиск; без q — сортировка по качеству; фильтры: type, direction, workplace, language, budget
    GET ${baseUrl}/api/leads/{id}                    # карточка публикации
    GET ${baseUrl}/api/market?title=backend+developer # перцентили оплаты по опубликованным цифрам за 90 дней
    GET ${baseUrl}/api/delta?since=2026-11-18T00:00:00Z # изменения с момента; синхронизируйте свой индекс так, а не перечитыванием всей ленты

Правила: соблюдайте Cache-Control вместо опроса; 404 на /api/leads/{id} может значить «пока не виден гостю», а не «удалён» — повторите позже или следите за /api/delta; полный справочник параметров — ${baseUrl}/openapi.json.

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

/** sitemaps.org: one file stays under 50 000 URLs and 50 MiB. */
export const SITEMAP_MAX_URLS = 50_000;
export const SITEMAP_MAX_BYTES = 50 * 1024 * 1024;

/** Complete date, or date plus time and a timezone. Fractional seconds are allowed. */
export const W3C_LASTMOD = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;

interface SitemapUrl {
  loc: string;
  priority: string;
  lastmod?: string;
  changefreq?: string;
}

function renderUrlset(urls: SitemapUrl[]): string {
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

/** Static, indexable pages. Lead URLs live in the weekly files. /review is not one of them. */
export function renderSitemapXml(
  baseUrl: string,
  now: Date = new Date(),
  /** Pages that exist only while there is data behind them, such as research role pages. */
  extraPaths: string[] = [],
): string {
  const today = now.toISOString().slice(0, 10);
  return renderUrlset([
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
    // Public list only. Operator routes stay out: /sources/new, /sources/catalog, /sources/*/edit.
    { loc: `${baseUrl}/sources`, priority: '0.6', lastmod: today, changefreq: 'daily' },
    { loc: `${baseUrl}/about`, priority: '0.5' },
    { loc: `${baseUrl}/docs`, priority: '0.7' },
    { loc: `${baseUrl}/faq`, priority: '0.5' },
    { loc: `${baseUrl}/extension`, priority: '0.5' },
  ]);
}

export function renderSitemapIndexXml(entries: Array<{ loc: string; lastmod: string }>): string {
  const items = entries
    .map((item) => `  <sitemap><loc>${escapeHtml(item.loc)}</loc><lastmod>${item.lastmod}</lastmod></sitemap>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</sitemapindex>`;
}

export function renderLeadSitemapXml(
  baseUrl: string,
  leads: Array<{ id: string; createdAt: string }>,
): string {
  return renderUrlset(leads.map((lead) => ({
    loc: `${baseUrl}/leads/${encodeURIComponent(lead.id)}`,
    priority: '0.5',
    lastmod: leadLastmod(lead.createdAt),
  })));
}

function maxLastmod(values: string[]): string {
  return values.reduce((best, value) => (Date.parse(value) > Date.parse(best) ? value : best));
}

const URLSET_OVERHEAD = Buffer.byteLength(
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n\n</urlset>`,
  'utf8',
);

function leadUrlLine(baseUrl: string, lead: { id: string; createdAt: string }): string {
  const loc = escapeHtml(`${baseUrl}/leads/${encodeURIComponent(lead.id)}`);
  return `  <url><loc>${loc}</loc><lastmod>${leadLastmod(lead.createdAt)}</lastmod><priority>0.5</priority></url>`;
}

/** Problems against the sitemaps.org sitemap-index shape. Empty means the document matches. */
export function sitemapIndexIssues(xml: string): string[] {
  const issues: string[] = [];
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) issues.push('xml declaration');
  if (!/<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/.test(xml)) issues.push('sitemapindex root');
  if (/<urlset[\s>]/.test(xml)) issues.push('urlset inside an index');
  if (!xml.trimEnd().endsWith('</sitemapindex>')) issues.push('sitemapindex close');
  const blocks = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)];
  if (blocks.length === 0) issues.push('no sitemap entries');
  for (const block of blocks) {
    const body = block[1] ?? '';
    const loc = body.match(/<loc>([^<]*)<\/loc>/)?.[1];
    const lastmod = body.match(/<lastmod>([^<]*)<\/lastmod>/)?.[1];
    if (!loc || !/^https?:\/\/[^\s]+$/.test(loc)) issues.push(`loc ${loc ?? ''}`);
    if (!lastmod || !W3C_LASTMOD.test(lastmod)) issues.push(`lastmod ${lastmod ?? ''}`);
    if (/<url[\s>]/.test(body)) issues.push('url inside sitemap');
  }
  return issues;
}

export interface LeadSitemapFile {
  /** File name only, e.g. `leads-2026-W45.xml`. */
  file: string;
  xml: string;
  lastmod: string;
}

/**
 * One urlset per ISO week of `createdAt`. A week that would pass 50 000 URLs or 50 MiB
 * continues as `leads-2026-W45-2.xml`. `lastmod` of a file is the newest URL inside it.
 */
export function buildLeadSitemaps(
  baseUrl: string,
  leads: Array<{ id: string; createdAt: string; updatedAt?: string }>,
  limits: { maxUrls?: number; maxBytes?: number } = {},
): LeadSitemapFile[] {
  const maxUrls = limits.maxUrls ?? SITEMAP_MAX_URLS;
  const maxBytes = limits.maxBytes ?? SITEMAP_MAX_BYTES;
  const byWeek = new Map<string, Array<{ id: string; createdAt: string; updatedAt?: string }>>();
  for (const lead of leads) {
    const week = isoWeekKey(lead.createdAt);
    if (!week) continue;
    const list = byWeek.get(week) ?? [];
    list.push(lead);
    byWeek.set(week, list);
  }
  const files: LeadSitemapFile[] = [];
  for (const week of [...byWeek.keys()].sort().reverse()) {
    const lines = (byWeek.get(week) ?? []).map((lead) => ({ lead, line: leadUrlLine(baseUrl, lead) }));
    let batch: typeof lines = [];
    let bytes = URLSET_OVERHEAD;
    let part = 1;
    const flush = (): void => {
      if (batch.length === 0) return;
      const xml = renderLeadSitemapXml(baseUrl, batch.map((item) => item.lead));
      files.push({
        file: part === 1 ? `leads-${week}.xml` : `leads-${week}-${part}.xml`,
        xml,
        lastmod: maxLastmod(batch.map((item) => leadLastmod(item.lead.createdAt))),
      });
      part += 1;
      batch = [];
      bytes = URLSET_OVERHEAD;
    };
    for (const item of lines) {
      const size = Buffer.byteLength(item.line, 'utf8') + 1;
      if (batch.length > 0 && (batch.length >= maxUrls || bytes + size > maxBytes)) flush();
      batch.push(item);
      bytes += size;
    }
    flush();
  }
  return files;
}

export interface SitemapBundle {
  indexXml: string;
  staticXml: string;
  files: Map<string, string>;
}

/** Index plus the static urlset plus one urlset per week. Only `isIndexable` leads are listed. */
export function assembleSitemaps(input: {
  baseUrl: string;
  leads: SitemapLeadRef[];
  extraPaths?: string[];
  env: TtlEnv;
  policy?: AccessPolicy;
  now?: Date;
}): SitemapBundle {
  const now = input.now ?? new Date();
  const staticXml = renderSitemapXml(input.baseUrl, now, input.extraPaths ?? []);
  const staticLastmod = [...staticXml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1] ?? '');
  const indexable = input.leads.filter((lead) => isIndexable(lead, input.env, input.policy ?? NODE_INDEX_POLICY, now.getTime()));
  const leadFiles = buildLeadSitemaps(input.baseUrl, indexable);
  const files = new Map<string, string>([['static.xml', staticXml]]);
  const entries = [{
    loc: `${input.baseUrl}/sitemaps/static.xml`,
    lastmod: staticLastmod.length ? maxLastmod(staticLastmod) : w3cDateTime(now.getTime()),
  }];
  for (const file of leadFiles) {
    files.set(file.file, file.xml);
    entries.push({ loc: `${input.baseUrl}/sitemaps/${file.file}`, lastmod: file.lastmod });
  }
  return { indexXml: renderSitemapIndexXml(entries), staticXml, files };
}

/** The stable-URL skill for visiting agents (/skill.md): what the MCP server does and how to install it. */
export function renderSkillMd(baseUrl: string): string {
  return `# openradar: live job & freelance leads for your agent

Search a live, deduplicated feed of job posts and freelance gigs (Telegram channels,
ATS job boards, freelance platforms), benchmark pay from real priced leads, and cite
a daily market-research report. Free and keyless; contacts stay in the original post.

## Connect

- **MCP server**: ${baseUrl}/mcp — JSON-RPC 2.0 over Streamable HTTP, works without a
  token (guest tier: 12-hour feed delay, no contact details). Tools: search_leads,
  get_lead_details, estimate_compensation, get_market_analytics, xray_generate_dorks.
  Write tools (submit_lead, vote_lead, save_search) need a personal token from ${baseUrl}/me.
- **REST fallback**: ${baseUrl}/api/leads?q=…&limit=50, ${baseUrl}/api/market?title=…,
  ${baseUrl}/api/delta?since=… — the full reference is ${baseUrl}/openapi.json.

## Install the ready-made skill pack

    # Claude Code
    /plugin marketplace add MikhailSagalaev/openradar-plugin
    /plugin install openradar@openradar

    # other agent CLIs
    npx skills add MikhailSagalaev/openradar-plugin

The pack ships three skills (search-orders, market-research, submit-lead), the
/orders and /market commands, and the MCP connection above.

## Rules

- Link users to the original post URL; never store or republish contact details.
- Prefer /api/delta over re-fetching the whole feed; honor Cache-Control headers.
- A 404 on a lead id can mean "not visible to guests yet", not deleted.

Machine-readable index of these skills: ${baseUrl}/.well-known/skills/index.json
`;
}

/** The skills manifest agents discover from llms.txt: names, install commands, MCP endpoint. */
export function renderSkillsIndex(baseUrl: string): Record<string, unknown> {
  return {
    name: 'openradar',
    description: 'Live job and freelance leads: search, market pay benchmarks, and a citable research report.',
    url: `${baseUrl}/skill.md`,
    install: {
      claudeCode: '/plugin marketplace add MikhailSagalaev/openradar-plugin, then /plugin install openradar@openradar',
      generic: 'npx skills add MikhailSagalaev/openradar-plugin',
    },
    mcp: { url: `${baseUrl}/mcp`, auth: 'none (guest tier); personal mcp_ token for write tools' },
    skills: [
      { name: 'search-orders', description: 'Find orders and jobs: filters, compact results, paging' },
      { name: 'market-research', description: 'How much does X cost: pay percentiles from real priced leads' },
      { name: 'submit-lead', description: 'Contribute an observed lead to the network' },
    ],
    api: { openapi: `${baseUrl}/openapi.json`, guide: `${baseUrl}/llms.txt` },
  };
}
