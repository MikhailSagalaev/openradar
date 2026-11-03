import { describe, expect, it } from 'vitest';
import {
  buildOutreachTemplate,
  buildXRayResult,
  categorizePersonas,
  cleanCompanyName,
  searchUrl,
} from '../src/core/xray.ts';

describe('xray core module', () => {
  describe('cleanCompanyName', () => {
    it('cleans Russian corporate forms and quotes', () => {
      expect(cleanCompanyName('ООО "Яндекс.Крауд"')).toBe('Яндекс.Крауд');
      expect(cleanCompanyName('АО «Тинькофф Банк»')).toBe('Тинькофф Банк');
      expect(cleanCompanyName('ПАО Сбербанк')).toBe('Сбербанк');
      expect(cleanCompanyName('Студия Артемия Лебедева')).toBe('Артемия Лебедева');
      expect(cleanCompanyName('Компания "ВК"')).toBe('ВК');
    });

    it('cleans international corporate forms and suffixes', () => {
      expect(cleanCompanyName('Acme Corp, Inc.')).toBe('Acme');
      expect(cleanCompanyName('GitLab Inc.')).toBe('GitLab');
      expect(cleanCompanyName('Spotify LLC')).toBe('Spotify');
      expect(cleanCompanyName('GmbH Siemens')).toBe('Siemens');
    });

    it('cleans company names from URLs', () => {
      expect(cleanCompanyName('https://mindbox.cloud/careers')).toBe('mindbox');
      expect(cleanCompanyName('https://www.avito.ru/jobs')).toBe('avito');
    });

    it('handles empty or trimmed inputs cleanly', () => {
      expect(cleanCompanyName('')).toBe('');
      expect(cleanCompanyName('   ')).toBe('');
      expect(cleanCompanyName('Wildberries')).toBe('Wildberries');
    });
  });

  describe('categorizePersonas', () => {
    it('reads Russian titles, not only Latin ones', () => {
      const cases: Array<[string, string]> = [
        ['Тестировщик', 'qa'],
        ['Дизайнер интерфейсов', 'design'],
        ['Аналитик данных', 'data_ml'],
        ['Инженер инфраструктуры', 'infrastructure'],
        ['Фронтенд-разработчик', 'frontend'],
        ['Продакт-менеджер', 'product'],
      ];
      for (const [title, category] of cases) expect(categorizePersonas(title).category, title).toBe(category);
    });

    it('categorizes Go / Golang backend', () => {
      const res = categorizePersonas('Senior Go Developer', ['Kafka', 'PostgreSQL']);
      expect(res.category).toBe('golang');
      expect(res.personas).toContain('Go Lead');
      expect(res.personas).toContain('CTO');
    });

    it('categorizes Python backend', () => {
      const res = categorizePersonas('Python Backend Engineer', ['Django', 'FastAPI']);
      expect(res.category).toBe('python');
      expect(res.personas).toContain('Python Lead');
    });

    it('categorizes Frontend', () => {
      const res = categorizePersonas('Frontend Developer', ['React', 'TypeScript']);
      expect(res.category).toBe('frontend');
      expect(res.personas).toContain('Frontend Lead');
    });

    it('categorizes Mobile', () => {
      const res = categorizePersonas('iOS Developer', ['Swift', 'SwiftUI']);
      expect(res.category).toBe('mobile');
      expect(res.personas).toContain('iOS Lead');
      expect(res.personas).toContain('Mobile Lead');
    });

    it('categorizes DevOps / SRE', () => {
      const res = categorizePersonas('DevOps / SRE Engineer', ['Kubernetes', 'Terraform']);
      expect(res.category).toBe('infrastructure');
      expect(res.personas).toContain('Head of Infrastructure');
    });

    it('categorizes QA', () => {
      const res = categorizePersonas('QA Automation Engineer', ['Playwright', 'Python']);
      expect(res.category).toBe('qa');
      expect(res.personas).toContain('QA Lead');
    });

    it('categorizes Data / ML', () => {
      const res = categorizePersonas('Machine Learning Engineer', ['PyTorch', 'NLP']);
      expect(res.category).toBe('data_ml');
      expect(res.personas).toContain('Head of Data');
    });

    it('categorizes Design', () => {
      const res = categorizePersonas('Lead Product Designer', ['Figma']);
      expect(res.category).toBe('design');
      expect(res.personas).toContain('Head of Design');
    });

    it('categorizes Product', () => {
      const res = categorizePersonas('Product Manager');
      expect(res.category).toBe('product');
      expect(res.personas).toContain('Head of Product');
    });

    it('defaults to general engineering for unspecified titles', () => {
      const res = categorizePersonas('Software Engineer');
      expect(res.category).toBe('engineering');
      expect(res.personas).toContain('Engineering Manager');
      expect(res.personas).toContain('CTO');
    });
  });

  describe('searchUrl', () => {
    it('creates Google and Yandex search URLs', () => {
      const google = searchUrl('google', 'site:linkedin.com/in/ "Ozon"');
      expect(google).toBe('https://www.google.com/search?q=site%3Alinkedin.com%2Fin%2F%20%22Ozon%22');

      const yandex = searchUrl('yandex', 'site:t.me "Ozon"');
      expect(yandex).toBe('https://yandex.ru/search/?text=site%3At.me%20%22Ozon%22');
    });
  });

  describe('buildXRayResult', () => {
    it('builds comprehensive result with 5 dorks and outreach template', () => {
      const result = buildXRayResult({
        company: 'ООО "Озон Финтех"',
        role: 'Senior Go Developer',
        skills: ['Go', 'PostgreSQL'],
      });

      expect(result.cleanCompany).toBe('Озон Финтех');
      expect(result.roleCategory).toBe('golang');
      expect(result.dorks).toHaveLength(5);

      const [linkedin, telegram, habr, github, team] = result.dorks;
      expect(linkedin).toBeDefined();
      expect(telegram).toBeDefined();
      expect(habr).toBeDefined();
      expect(github).toBeDefined();
      expect(team).toBeDefined();
      if (!linkedin || !telegram || !habr || !github || !team) return;

      expect(linkedin.id).toBe('linkedin');
      expect(linkedin.query).toContain('site:linkedin.com/in/');
      expect(linkedin.query).toContain('"Озон Финтех"');
      expect(linkedin.query).toContain('"Go Lead"');
      expect(linkedin.googleUrl).toContain('https://www.google.com/search?q=');

      expect(telegram.id).toBe('telegram');
      expect(telegram.query).toContain('site:t.me');

      expect(habr.id).toBe('habr');
      expect(habr.query).toContain('site:habr.com');

      expect(github.id).toBe('github');
      expect(github.query).toContain('site:github.com');

      expect(team.id).toBe('team');

      expect(result.outreachTemplate).toContain('Озон Финтех');
      expect(result.outreachTemplate).toContain('Senior Go Developer');
    });
  });
});
