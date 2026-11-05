import { describe, expect, it } from 'vitest';
import { leadFromPage } from '../src/sources/sitemap.ts';
import { makeSource } from './helpers.ts';

const source = makeSource({ kind: 'sitemap', title: 'Test — Вакансии' });

describe('sitemap lead extraction', () => {
  it('reads a JobPosting page with its markup', () => {
    const html = `<!doctype html><html><head><title>Job - Co</title></head><body>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Backend Engineer","datePosted":"2026-11-01","hiringOrganization":{"name":"Co"},"jobLocation":{"address":{"addressLocality":"Москва"}},"description":"<p>Build APIs</p>"}</script>
      </body></html>`;
    const lead = leadFromPage(source, 'https://x.test/v/1', '1', html);
    expect(lead?.title).toBe('Backend Engineer');
    expect(lead?.author).toBe('Co');
    expect(lead?.city).toBe('Москва');
    expect(lead?.publishedAt).toBe('2026-11-01');
  });

  it('falls back to a plain page: h1 is the vacancy, body and meta carry the text', () => {
    const html = `<!doctype html><html><head><title>Аналитик 1С - Сбер2Б</title>
      <meta name="description" content="Занимаетесь аналитикой процессов 1С"></head>
      <body><nav>меню меню</nav><h1>Аналитик 1С</h1>
      <p>Обязанности: развивать механизмы 1С, сопровождать конфигурации, оптимизировать запросы. Зарплата от 200 000 до 260 000 рублей в месяц, оформление по ТК, удалённая работа, гибкое начало дня, ДМС после испытательного срока, обучение за счёт компании.</p>
      <footer>контакты</footer></body></html>`;
    const lead = leadFromPage(source, 'https://x.test/v/2', '2', html);
    expect(lead?.title).toBe('Аналитик 1С');
    expect(lead?.text).toContain('аналитикой процессов 1С');
    expect(lead?.text).toContain('от 200 000 до 260 000');
    expect(lead?.externalId).toBe('sitemap:x.test:2');
  });

  it('rejects a dead page and a thin page', () => {
    const dead = '<html><head><title>404 - Страница не найдена</title></head><body><h1>404</h1></body></html>';
    expect(leadFromPage(source, 'https://x.test/v/3', '3', dead)).toBeUndefined();
    const thin = '<html><head><title>Job</title></head><body><h1>Job</h1><p>Коротко.</p></body></html>';
    expect(leadFromPage(source, 'https://x.test/v/4', '4', thin)).toBeUndefined();
  });
});
