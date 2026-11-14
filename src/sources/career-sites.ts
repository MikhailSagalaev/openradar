import type { SourcePreset } from './presets.ts';

/**
 * Company career sites and niche boards read page by page. One line per site: where its pages
 * are listed, which of those pages are vacancies, and whose they are. Before a line goes in,
 * check that robots.txt allows the pages and that a real page carries the vacancy in its HTML.
 */
interface CareerSite {
  id: string;
  name: string;
  /** Sitemap with the vacancy pages. */
  sitemap?: string;
  /** Page that links to the vacancies, for a site with no sitemap of them. */
  list?: string;
  /** Matches a vacancy page; the first group is its key. */
  pattern: string;
  /** Left out for a board: there every page names its own employer. */
  company?: boolean;
  /** Stop at this many newest pages, for a sitemap that keeps closed vacancies. */
  maxPages?: number;
}

const SITES: CareerSite[] = [
  { id: 'career-glovo', name: 'Glovo', sitemap: 'https://careers.glovoapp.com/sitemap-job1.xml', pattern: String.raw`/job/.+-jid-(\d+)`, company: true },
  { id: 'career-2gis', name: '2ГИС', sitemap: 'https://job.2gis.ru/sitemap.xml', pattern: String.raw`/vacancies/[a-z_]+/(\d+)`, company: true },
  { id: 'career-ibs', name: 'IBS', sitemap: 'https://ibs.ru/sitemap-career.xml', pattern: String.raw`/career/jobs/([a-z0-9-]+)`, company: true },
  { id: 'career-yadro', name: 'YADRO', sitemap: 'https://careers.yadro.com/sitemap.xml', pattern: String.raw`/vacancy/(\d+)`, company: true },
  { id: 'career-alfabank', name: 'Альфа-Банк', sitemap: 'https://job.alfabank.ru/sitemap.xml', pattern: String.raw`/vacancies/[^/]+/(?:central-office|remote-job)/([^/]+)`, company: true },
  { id: 'career-mts', name: 'МТС', sitemap: 'https://job.mts.ru/sitemap.xml', pattern: String.raw`/vacancy/(\d+)`, company: true, maxPages: 300 },
  { id: 'career-bell', name: 'Bell Integrator', sitemap: 'https://bellintegrator.ru/sitemap.xml', pattern: String.raw`/vacancy/(\d+)`, company: true },
  { id: 'career-vk', name: 'VK', sitemap: 'https://team.vk.company/sitemap.xml', pattern: String.raw`/vacancy/(\d+)`, company: true },
  { id: 'career-replika', name: 'Replika', sitemap: 'https://careers.replika.com/sitemap.xml', pattern: String.raw`/jobs/(\d+)-`, company: true },
  { id: 'career-snappymob', name: 'Snappymob', sitemap: 'https://careers.snappymob.com/sitemap.xml', pattern: String.raw`/jobs/(\d+)-`, company: true },
  { id: 'career-bonapolia', name: 'Bonapolia', sitemap: 'https://jobs.bonapolia.com/sitemap.xml', pattern: String.raw`/jobs/(\d+)-`, company: true },
  { id: 'career-hhhub', name: 'HHHUB', sitemap: 'https://careers.hhhub.eu/sitemap.xml', pattern: String.raw`/jobs/(\d+)-`, company: true },
  { id: 'career-simple', name: 'Simple Life', sitemap: 'https://jobs.simple.life/sitemap.xml', pattern: String.raw`/jobs/(\d+)-`, company: true },
  { id: 'career-novakid', name: 'Novakid', sitemap: 'https://hr.novakidschool.com/sitemap.xml', pattern: String.raw`/o/([a-z0-9-]+)`, company: true },
  { id: 'career-karta', name: 'Karta', sitemap: 'https://karta.huntflow.io/sitemap.xml', pattern: String.raw`/vacancy/((?!talent-pool)[a-z0-9-]+)`, company: true },
  { id: 'career-huntflow', name: 'Хантфлоу', sitemap: 'https://huntflow.ru/career/sitemap.xml', pattern: String.raw`/career/vacancy/([a-z0-9-]+)`, company: true },
  { id: 'career-artworkout', name: 'ArtWorkout', sitemap: 'https://artworkout.app/sitemap.xml', pattern: String.raw`/career/([a-z0-9-]+)/?$`, company: true },
  { id: 'career-mojam', name: 'MOJAM', sitemap: 'https://mojam.co/careers-sitemap.xml', pattern: String.raw`/careers/([a-z0-9-]+)`, company: true },
  { id: 'career-muse', name: 'Muse Group', sitemap: 'https://www.mu.se/sitemap.xml', pattern: String.raw`/positions/(position-[a-z0-9_-]+)`, company: true },
  { id: 'career-nobrakes', name: 'No Brakes Games', sitemap: 'https://nobrakesgames.com/job-sitemap.xml', pattern: String.raw`/jobs/([a-z0-9-]+)`, company: true },
  { id: 'career-onde', name: 'Onde', sitemap: 'https://onde.app/sitemap-dynamic.xml', pattern: String.raw`/careers/([a-z0-9-]+)`, company: true },
  { id: 'career-qbitech', name: 'Qbitech', sitemap: 'https://www.qbitech.io/sitemap.xml', pattern: String.raw`/position/([a-z0-9-]+)`, company: true },
  { id: 'career-room8', name: 'Room 8 Studio', sitemap: 'https://room8studio.com/talent-sitemap.xml', pattern: String.raw`/talent/([a-z0-9-]+)`, company: true },
  { id: 'career-stepico', name: 'Stepico', sitemap: 'https://stepico.com/careers-sitemap.xml', pattern: String.raw`/careers/((?!didnt-find)[a-z0-9-]+)`, company: true },
  { id: 'career-wisewolves', name: 'WiseWolves', sitemap: 'https://wise-wolves.com/wp-sitemap-posts-vacancy-1.xml', pattern: String.raw`/vacancies/([a-z0-9-]+)`, company: true },
  { id: 'career-findev', name: 'findev', sitemap: 'https://fin.dev/sitemap.xml', pattern: String.raw`/career/open-positions/((?:junior|middle|senior|lead)-[a-z0-9-]+)`, company: true },
  { id: 'career-smbc', name: 'SMBC', sitemap: 'https://careersemea.smbcgroup.com/sitemap.xml', pattern: String.raw`/job/[^/]+/(\d+)`, company: true },
  { id: 'career-crowdstrike', name: 'CrowdStrike', sitemap: 'https://crowdstrike.wd5.myworkdayjobs.com/crowdstrikecareers/siteMap.xml', pattern: String.raw`/job/[^/]+/([^/]+)`, company: true },
  { id: 'career-intapp', name: 'Intapp', sitemap: 'https://intapp.wd1.myworkdayjobs.com/Intapp/siteMap.xml', pattern: String.raw`/job/[^/]+/([^/]+)`, company: true },
  { id: 'career-abbott', name: 'Abbott', sitemap: 'https://abbott.wd5.myworkdayjobs.com/abbottcareers/siteMap.xml', pattern: String.raw`/job/[^/]+/([^/]+)`, company: true },
  { id: 'career-elevance', name: 'Elevance Health', sitemap: 'https://elevancehealth.wd1.myworkdayjobs.com/ANT/siteMap.xml', pattern: String.raw`/job/[^/]+/([^/]+)`, company: true },
  { id: 'career-damate', name: 'Дамате', sitemap: 'https://www.acdamate.com/sitemap_000.xml', pattern: String.raw`/job/[^/]+/[^/]+/([a-z0-9-]+)`, company: true },
  { id: 'career-cdek', name: 'СДЭК', list: 'https://rabota.cdek.ru/vacancies/', pattern: String.raw`/vacancies/item/(\d+)`, company: true },
  { id: 'career-azur', name: 'Azur Games', list: 'https://azurgames.com/ru/jobs/', pattern: String.raw`/ru/jobs/([a-z0-9-]+)/?$`, company: true },
  { id: 'career-kaspersky', name: 'Лаборатория Касперского', list: 'https://careers.kaspersky.ru/vacancy/', pattern: String.raw`/vacancy/(\d+)`, company: true },
  { id: 'career-aviasales', name: 'Aviasales', list: 'https://www.aviasales.ru/about/vacancies/', pattern: String.raw`/about/vacancies/(\d+)`, company: true },
  { id: 'career-yandex', name: 'Яндекс', list: 'https://yandex.ru/jobs/vacancies', pattern: String.raw`/jobs/vacancies/([a-z0-9_-]+-\d+)`, company: true },
  { id: 'board-justjoin', name: 'Just Join IT', sitemap: 'https://justjoin.it/sitemaps/active-jobs/part0.xml', pattern: String.raw`/job-offer/([a-z0-9-]+)` },
  { id: 'board-workwithindies', name: 'Work With Indies', list: 'https://www.workwithindies.com/', pattern: String.raw`/careers/([a-z0-9-]+)$` },
  { id: 'board-agilefluent', name: 'AgileFluent', sitemap: 'https://jobboard.agilefluent.ru/sitemap.xml', pattern: String.raw`/jobs/(\d+)-` },
  { id: 'board-choicy', name: 'Choicy', sitemap: 'https://choicy.work/sitemap-job.xml', pattern: String.raw`/job/([0-9a-z]+)` },
  { id: 'board-spawnparty', name: 'SpawnParty', sitemap: 'https://spawnparty.dev/sitemap.xml', pattern: String.raw`/jobs/([a-z0-9-]+-[0-9a-f]{8})$` },
  { id: 'board-nobordersabroad', name: 'No Borders Abroad', sitemap: 'https://nobordersabroad.com/sitemap.xml', pattern: String.raw`/en/jobs/([a-z0-9-]+)` },
];

export const CAREER_SITE_PRESETS: SourcePreset[] = SITES.map((site) => ({
  id: site.id,
  kind: 'sitemap',
  title: `${site.name} — Вакансии`,
  description: `Вакансии с сайта ${new URL(site.sitemap ?? site.list!).hostname.replace(/^www\./, '')}`,
  config: {
    ...(site.sitemap ? { url: site.sitemap } : { listUrl: site.list }),
    pattern: site.pattern,
    ...(site.company ? { company: site.name } : {}),
    ...(site.maxPages ? { maxPages: site.maxPages } : {}),
    perPoll: 10,
    delayMs: 1500,
    maxAgeDays: 30,
  },
}));

/**
 * Companies whose own site is closed to us, read through their page on hh.ru: the feed the
 * employer publishes there, the same one anyone can subscribe to. It holds the newest 20.
 */
const HH_EMPLOYERS: Array<[id: string, name: string, employer: number]> = [
  ['hh-ozon', 'Ozon', 2180],
  ['hh-tbank', 'Т-Банк', 78638],
  ['hh-x5', 'X5', 4233],
  ['hh-rostelecom', 'Ростелеком', 2748],
  ['hh-skyeng', 'Skyeng', 1122462],
  ['hh-kontur', 'Контур', 41862],
  ['hh-beeline', 'билайн', 4934],
  ['hh-tutu', 'Туту', 5325],
  ['hh-goldapple', 'Золотое Яблоко', 776314],
  ['hh-t1', 'Т1', 4649269],
  ['hh-12storeez', '12 STOREEZ', 2458132],
  ['hh-tochka', 'Точка Банк', 2324020],
  ['hh-selectel', 'Selectel', 633069],
  ['hh-pt', 'Positive Technologies', 26624],
  ['hh-cian', 'Циан', 1429999],
  ['hh-tensor', 'Тензор', 67611],
  ['hh-diasoft', 'Диасофт', 1057],
];

export const HH_EMPLOYER_PRESETS: SourcePreset[] = HH_EMPLOYERS.map(([id, name, employer]) => ({
  id,
  kind: 'rss',
  title: `${name} — вакансии на hh.ru`,
  description: `Лента вакансий компании ${name} на hh.ru`,
  config: { url: `https://hh.ru/search/vacancy/rss?employer_id=${employer}&order_by=publication_time`, company: name },
}));
