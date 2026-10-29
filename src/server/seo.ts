import { escapeHtml, jsonForScript } from '../core/text.ts';
import type { Lead, LeadType } from '../core/types.ts';
import { layout, type AuthDisplay } from './ui.ts';
import type { SupportedLang } from './i18n.ts';

export interface CatalogEntry {
  slug: string;
  h1: string;
  title: string;
  description: string;
  intro: string;
  /** A paragraph under the list: what the page collects and who it is for. */
  about: string;
  q?: string;
  type?: LeadType;
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
    q: 'бот',
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
      ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(lead.budget)} ₽`
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
  return `User-agent: *
Allow: /
Disallow: /sources
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
