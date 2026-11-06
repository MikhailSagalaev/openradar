import type { SourcePreset } from './presets.ts';
import type { JsonBoardConfig } from './json-board.ts';

/**
 * Career sites read through their own open JSON. Before a line goes in, check that the address
 * opens without signing in and that robots.txt allows it.
 */
const BOARDS: Array<{ id: string; name: string; config: JsonBoardConfig }> = [
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
];

export const JSON_BOARD_PRESETS: SourcePreset[] = BOARDS.map((board) => ({
  id: board.id,
  kind: 'json',
  title: `${board.name} — Вакансии`,
  description: `Вакансии из открытого списка сайта ${new URL(board.config.url).hostname.replace(/^www\./, '')}`,
  config: board.config as unknown as SourcePreset['config'],
}));
