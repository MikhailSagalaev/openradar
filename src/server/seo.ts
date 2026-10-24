import { escapeHtml } from '../core/text.ts';
import type { Lead, LeadType } from '../core/types.ts';
import { layout } from './ui.ts';

export interface CatalogEntry {
  slug: string;
  h1: string;
  title: string;
  description: string;
  intro: string;
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
    type: 'job',
  },
];

export function findCatalogEntry(slug: string): CatalogEntry | undefined {
  return SEO_CATALOG.find((entry) => entry.slug === slug);
}

function leadRow(lead: Lead, baseUrl: string): string {
  const href = lead.url || `${baseUrl}/leads/${escapeHtml(lead.id)}`;
  const meta = [
    lead.city,
    typeof lead.budget === 'number'
      ? `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(lead.budget)} ₽`
      : undefined,
    lead.type === 'job' ? 'вакансия' : 'заказ',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<a class="row" href="${escapeHtml(href)}" rel="nofollow noopener" target="_blank">
        <div>
          <div class="row-title">${escapeHtml(lead.title)}</div>
          <div class="row-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="row-side">${escapeHtml(String(lead.score))}</div>
      </a>`;
}

export function renderCatalogPage(options: {
  entry: CatalogEntry;
  leads: Lead[];
  baseUrl: string;
  version: string;
}): string {
  const { entry, leads, baseUrl, version } = options;
  const canonical = `${baseUrl}/catalog/${entry.slug}`;
  const searchHref = `/catalog/${entry.slug}`; // canonical stays on the landing
  const feedHref = `/feed.rss?${new URLSearchParams({
    ...(entry.q ? { q: entry.q } : {}),
    ...(entry.type ? { type: entry.type } : {}),
  }).toString()}`;
  const list = leads.length
    ? leads.map((lead) => leadRow(lead, baseUrl)).join('')
    : `<div class="empty"><h2>Пока пусто</h2><p>Новые заказы появятся здесь в течение пяти минут — источники опрашиваются автоматически.</p></div>`;

  const body = `
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
<p class="muted small" style="margin-top:20px">Открытая база <b>OpenRadar</b> собирает заказы и вакансии из открытых источников и сообщества. <a href="${escapeHtml(searchHref)}">Подписка на обновления</a> — через RSS-ленту этой страницы.</p>`;

  return layout({
    title: entry.title,
    version,
    body,
    head: `<meta name="description" content="${escapeHtml(entry.description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="alternate" type="application/rss+xml" title="${escapeHtml(entry.h1)} — RSS" href="${escapeHtml(feedHref)}">`,
  });
}

export function renderRobotsTxt(baseUrl: string): string {
  return `User-agent: *
Allow: /
Disallow: /sources
Disallow: /api
Disallow: /leads/

Sitemap: ${baseUrl}/sitemap.xml
`;
}

export function renderSitemapXml(baseUrl: string): string {
  const urls = [
    { loc: `${baseUrl}/`, priority: '1.0' },
    ...SEO_CATALOG.map((entry) => ({
      loc: `${baseUrl}/catalog/${entry.slug}`,
      priority: '0.8',
    })),
  ];
  const items = urls
    .map(
      (item) => `  <url><loc>${escapeHtml(item.loc)}</loc><priority>${item.priority}</priority></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>`;
}
