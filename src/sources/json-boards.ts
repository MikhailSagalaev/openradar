import type { SourcePreset } from './presets.ts';
import type { JsonBoardConfig } from './json-board.ts';

/**
 * Career sites read through their own open JSON. Before a line goes in, check that the address
 * opens without signing in and that robots.txt allows it.
 */
const BOARDS: Array<{ id: string; name: string; description?: string; config: JsonBoardConfig }> = [
  {
    id: 'json-sber',
    name: 'Сбер',
    config: {
      url: 'https://rabota.sber.ru/public/app-candidate-public-api-gateway/api/v1/publications?skip={offset}&take=50',
      list: 'data.vacancies',
      pageSize: 50,
      pagesPerPoll: 4,
      id: 'internalId',
      title: 'title',
      text: ['introduction', 'specialization', 'duties', 'requirements', 'conditions'],
      link: 'https://rabota.sber.ru/search/{internalId}/',
      company: 'Сбер',
      city: 'city',
      published: 'publicationDate',
      salaryMin: 'salary_min',
      salaryMax: 'salary_max',
    },
  },
  {
    id: 'json-wildberries',
    name: 'Wildberries',
    config: {
      url: 'https://career.rwb.ru/hr-crm-api/api/v2/pub/vacancies?limit=50&offset={offset}',
      list: 'data.items',
      pageSize: 50,
      pagesPerPoll: 1,
      id: 'id',
      title: 'name',
      text: ['direction_name', 'experience_type_title', 'description', 'duties_arr', 'requirements_arr', 'conditions_arr'],
      link: 'https://career.rwb.ru/vacancies/{id}',
      detail: 'https://career.rwb.ru/hr-crm-api/api/v2/pub/vacancies/{id}',
      detailRoot: 'data',
      company: 'Wildberries',
      city: 'city_title',
      format: 'employment_types_list',
    },
  },
  {
    id: 'json-magnit-tech',
    name: 'Магнит Tech',
    config: {
      url: 'https://magnit.tech/api/v1/vacancy?page={page}',
      list: 'results',
      pageSize: 9,
      pagesPerPoll: 3,
      id: 'id',
      title: 'title',
      text: ['description', 'about_product', 'tasks', 'skills', 'extra_skills', 'offer', 'technologies'],
      link: 'https://magnit.tech/vacancies/{id}',
      detail: 'https://magnit.tech/api/v1/vacancy/{id}',
      detailRoot: 'results',
      company: 'Магнит Tech',
      format: 'work_formats',
    },
  },
  {
    id: 'json-it-one',
    name: 'IT_One',
    config: {
      url: 'https://it-one.ru/api/entities/vacancy',
      id: 'id',
      title: 'name',
      text: ['position', 'specialization', 'preview'],
      link: 'https://it-one.ru{url}',
      company: 'IT_One',
      city: 'city',
    },
  },
  // Dreamwork (dreamworkhq.com) publishes daily MIT-licensed job feeds on GitHub. The `url`
  // field is their tracking card, not the employer's page — the description says so honestly.
  // Salaries are annual USD (`salaryPeriod: 'annual'`); the period field keeps them from being
  // labeled monthly. Ten more category repos share the shape; enable only complementary ones.
  {
    id: 'dreamwork-remote-tech',
    name: 'Dreamwork — Remote Tech Jobs',
    description:
      'Ежедневный MIT-фид удалённых tech-вакансий (dreamworkhq, 600 строк). Ссылка ведёт на карточку Dreamwork, не на оригинал работодателя. Зарплаты — годовые USD.',
    config: {
      url: 'https://raw.githubusercontent.com/dreamworkhq/Remote-Tech-Jobs/main/data/listings.json',
      list: 'listings',
      id: 'id',
      title: 'title',
      text: ['company', 'location', 'aiRoleKind'],
      link: '{url}',
      city: 'location',
      published: 'postedAt',
      format: 'remoteType',
      salaryMin: 'salaryMin',
      salaryMax: 'salaryMax',
      salaryPeriod: 'salaryPeriod',
      currency: 'USD',
      maxAgeDays: 14,
    },
  },
  {
    id: 'dreamwork-ai-ml',
    name: 'Dreamwork — AI/ML Jobs',
    description:
      'Ежедневный MIT-фид AI/ML-вакансий (dreamworkhq, 600 строк). Ссылка ведёт на карточку Dreamwork, не на оригинал работодателя. Зарплаты — годовые USD.',
    config: {
      url: 'https://raw.githubusercontent.com/dreamworkhq/AI-ML-Jobs/main/data/listings.json',
      list: 'listings',
      id: 'id',
      title: 'title',
      text: ['company', 'location', 'aiRoleKind'],
      link: '{url}',
      city: 'location',
      published: 'postedAt',
      format: 'remoteType',
      salaryMin: 'salaryMin',
      salaryMax: 'salaryMax',
      salaryPeriod: 'salaryPeriod',
      currency: 'USD',
      maxAgeDays: 14,
    },
  },
  {
    id: 'dreamwork-senior-swe',
    name: 'Dreamwork — Senior Software Engineer Jobs',
    description:
      'Ежедневный MIT-фид senior SWE-вакансий (dreamworkhq, ~900 строк). Ссылка ведёт на карточку Dreamwork, не на оригинал работодателя. Зарплаты — годовые USD.',
    config: {
      url: 'https://raw.githubusercontent.com/dreamworkhq/Senior-Software-Engineer-Jobs/main/data/listings.json',
      list: 'listings',
      id: 'id',
      title: 'title',
      text: ['company', 'location', 'aiRoleKind'],
      link: '{url}',
      city: 'location',
      published: 'postedAt',
      format: 'remoteType',
      salaryMin: 'salaryMin',
      salaryMax: 'salaryMax',
      salaryPeriod: 'salaryPeriod',
      currency: 'USD',
      maxAgeDays: 14,
    },
  },
  // Jobbie (jobbie.bot) publishes its US internship feed openly: JSON, cached 10 minutes,
  // ETag-aware, 30 req/min per IP. `apply_url` is the employer's own ATS page (the original);
  // `url` is Jobbie's tracking card and is used only when apply_url is missing. The feed mixes
  // tech and non-tech roles — the includeKeywords filter keeps the tech slice, like Jobbie's
  // own README does.
  {
    id: 'jobbie-internships',
    name: 'Jobbie — US Tech Internships',
    description:
      'Публичный JSON-фид стажировок США (jobbie.bot, обновляется каждые 6 часов, ~380 строк). Ссылка — оригинал на карьерном сайте работодателя (apply_url). Зарплаты — почасовые USD.',
    config: {
      url: 'https://api.jobbie.bot/public/internships.json',
      list: 'jobs',
      id: 'id',
      title: 'title',
      text: ['company', 'location', 'source', 'salary'],
      link: '{apply_url}',
      city: 'location',
      published: 'posted_at',
      maxAgeDays: 14,
      // The feed states pay as «$20 – $30/hr»: kept verbatim, hourly USD, never monthly RUB.
      salary: 'salary',
      currency: 'USD',
      includeKeywords: [
        'software', 'engineer', 'developer', 'data scien', 'data engineer', 'machine learning',
        'security', 'cyber', 'hardware', 'firmware', 'embedded', 'devops', 'sre', 'cloud',
        'infrastructure', 'backend', 'frontend', 'full stack', 'full-stack', 'ios', 'android',
        'robotic', 'computer', 'electrical', 'quant', 'python', 'java', 'technical', 'qa',
        'platform', 'network', 'systems', 'web', 'test', 'research scientist',
      ],
    },
  },
];

export const JSON_BOARD_PRESETS: SourcePreset[] = BOARDS.map((board) => ({
  id: board.id,
  kind: 'json',
  title: board.name.includes('—') ? board.name : `${board.name} — Вакансии`,
  description: board.description ?? `Вакансии из открытого списка сайта ${new URL(board.config.url).hostname.replace(/^www\./, '')}`,
  config: board.config as unknown as SourcePreset['config'],
}));
