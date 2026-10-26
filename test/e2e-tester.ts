import { accessPolicyFromEnv } from '../src/runtime.ts';
import { createApp } from '../src/server/app.ts';
import { createRuntime } from '../src/runtime.ts';
import { MemoryStore } from '../src/store/memory.ts';
import { createSourceRegistry } from '../src/sources/index.ts';
import { createSinkRegistry } from '../src/sinks/index.ts';
import { createLogger } from '../src/core/logger.ts';
import { loadEnv } from '../src/config.ts';

async function runE2ETestSuite() {
  console.log('🚀 [QA Tester] Запуск сквозного (E2E) тестирования Radar...');

  const env = loadEnv({
    RADAR_ADMIN_TOKEN: 'qa-admin-secret-token',
    RADAR_CONSOLE_SINK: false,
    RADAR_LLM_ENABLED: false,
  });

  const logger = createLogger('error');
  const store = new MemoryStore();
  const sources = createSourceRegistry();
  const sinks = createSinkRegistry(env);

  const runtime = {
    env,
    logger,
    store,
    sources,
    sinks,
    fetchImpl: fetch,
    access: accessPolicyFromEnv(env),
  };

  const app = createApp(runtime);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✓ ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      failed++;
    }
  }

  // 1. Проверка Healthcheck
  const healthRes = await app.request('/health');
  assert(healthRes.status === 200, 'GET /health возвращает 200 OK');

  // 2. Создание Webhook-источника
  const src = await store.createSource({
    kind: 'webhook',
    title: 'Комьюнити-тест',
    config: { token: 'community-token-123' },
  });
  assert(Boolean(src.id), `Webhook-источник создан с ID: ${src.id}`);

  // 3. Эмуляция отправки из браузерного расширения v0.4.0
  const ingestPayload = {
    title: 'Разработка Telegram-бота на Python и FastAPI',
    text: 'Требуется опытный бэкендер для написания парсера и интеграции с платежной системой ЮKassa. Бюджет 45 000 руб. Срочно.',
    url: 'https://freelance.example.com/order/777',
    author: '@qa_tester (community)',
    city: 'Москва',
    budget: 45000,
    currency: 'RUB',
    category: 'Бэкенд-разработка',
    skills: ['Python', 'FastAPI', 'Telegram API', 'PostgreSQL'],
    isRemote: true,
    metadata: { urgency: 'high', verified: true },
  };

  const ingestRes = await app.request(`/api/ingest/${src.id}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-radar-token': 'community-token-123',
    },
    body: JSON.stringify(ingestPayload),
  });

  assert(ingestRes.status === 200, 'POST /api/ingest принимает лид из расширения с x-radar-token');
  const ingestBody = (await ingestRes.json()) as { accepted: number };
  assert(ingestBody.accepted === 1, '1 лид успешно принят и обработан в пайплайне');

  // 4. Проверка полнотекстового поиска
  const searchBySkill = await store.listLeads({ query: 'FastAPI' });
  assert(searchBySkill.length === 1, 'Поиск по тегу/слову из текста "FastAPI" находит созданный заказ');

  const searchByCity = await store.listLeads({ query: 'Москва' });
  assert(searchByCity.length === 1, 'Поиск по городу "Москва" находит заказ');

  // 5. Проверка сохранения метаданных и характеристик
  const savedLead = searchBySkill[0];
  if (!savedLead) throw new Error('Lead not found in search results');
  assert(savedLead.category === 'Бэкенд-разработка', 'Категория "Бэкенд-разработка" сохранена в базе');
  assert(Array.isArray(savedLead.skills) && savedLead.skills.includes('Python'), 'Массив skills ["Python", ...] сохранен');
  assert(savedLead.author === '@qa_tester (community)', 'Авторство контрибьютора сохранено');
  assert(savedLead.isRemote === true, 'Флаг isRemote=true сохранен');

  // 6. Проверка защиты дашборда по токену
  const unauthorizedLeads = await app.request('/api/leads');
  assert(unauthorizedLeads.status === 401, 'Доступ к /api/leads закрыт без admin-токена (401 Unauthorized)');

  const authorizedLeads = await app.request('/api/leads', {
    headers: { 'authorization': 'Bearer qa-admin-secret-token' },
  });
  assert(authorizedLeads.status === 200, 'Доступ к /api/leads разрешен с валидным Bearer токеном (200 OK)');

  // 7. Проверка страницы онбординга расширения
  const extPage = await app.request('/extension', {
    headers: { 'authorization': 'Bearer qa-admin-secret-token' },
  });
  assert(extPage.status === 200, 'Страница онбординга /extension рендерится корректно (200 OK)');
  const extHtml = await extPage.text();
  assert(extHtml.includes('Комьюнити-тест'), 'На странице /extension выводится созданный webhook-источник');

  await store.close();

  console.log(`\n🏁 [QA Tester] Итог: ${passed} успешно, ${failed} ошибок.`);
  if (failed > 0) process.exit(1);
}

runE2ETestSuite().catch((err) => {
  console.error('Fatal QA error:', err);
  process.exit(1);
});
