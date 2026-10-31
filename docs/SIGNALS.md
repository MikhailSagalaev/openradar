# Signals: подписки на фильтры ленты

Подписка следит за фильтром ленты (поиск, тип, навык, бюджет, язык, удалёнка, «Только IT»)
и приносит совпадения в **Telegram** или на **ваш webhook**. Подписки видят только то,
что ваш уровень уже может видеть: уведомление никогда не приходит раньше, чем лид появился
бы в вашей ленте.

## Как создать

1. Настройте фильтры в ленте [openradar.fun](https://openradar.fun).
2. Нажмите **«Следить»** над лентой или в профиле (`/me#subscriptions`).
3. Выберите канал: Telegram (подключается одноразовым кодом из профиля) или webhook.

До 20 подписок на аккаунт; новые совпадения приходят не чаще раза в 15 минут,
до 10 лидов в сообщении.

## Webhook

POST на ваш HTTPS-URL. Адрес проверяется SSRF-guard'ом при сохранении и при каждой
отправке; доступны только публичные адреса.

### `subscription.leads` — новые лиды по фильтру

```json
{
  "event": "subscription.leads",
  "subscription": { "id": "sub_…", "name": "React + бюджет", "filters": { "q": "react", "budgetRub": 100000 } },
  "leads": [ { "id": "…", "title": "…", "text": "…", "contacts": [ … ] } ],
  "more": false,
  "manage_url": "https://openradar.fun/me#subscriptions"
}
```

`leads` — та же публичная проекция, что в API, с контактами (вы вошли как member+).

### `lead.closed` — лид покинул ленту

Приходит сразу, когда лид закрывают участники или скрывают как мусор/мошенничество —
и только если он уже был виден вашему уровню (о закрытом ранее невидимом лидере
уведомлений нет).

```json
{
  "event": "lead.closed",
  "subscription": { "id": "sub_…", "name": "React + бюджет" },
  "lead": { "id": "…", "title": "…", "state": "closed" },
  "closedAt": "2026-10-31T12:00:00.000Z",
  "reason": "closed"
}
```

`reason`: `closed` (закрыт участниками), `hidden_junk`, `hidden_scam` (решение голосов
или модератора).

## Подпись запроса

Каждый запрос подписан HMAC-SHA256: секрет показывается **один раз** при создании
подписки.

```
x-openradar-timestamp: 1730366400
x-openradar-signature: hex(HMAC_SHA256(secret, "<timestamp>.<body>"))
```

Проверка (Node.js):

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

const expected = createHmac('sha256', SECRET)
  .update(`${req.headers['x-openradar-timestamp']}.${rawBody}`)
  .digest();
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-openradar-signature'], 'hex'))) {
  return res.status(401).end();
}
```

Проверяйте в таком порядке: свежесть timestamp (±5 минут достаточно), потом подпись.
Отвергайте повтор того же timestamp+body — повторов не бывает, каждый payload уникален.

## Доставка и сбои

- Неудачная отправка (не-2xx, таймаут 10 с) повторяется на следующем цикле — до 10
  неудач подряд, после чего подписка сама ставится на паузу (включить в профиле).
- Telegram: если бот заблокирован пользователем (403), чат отвязывается до повторного
  /start.
- Пауза/удаление подписки — в профиле `/me#subscriptions`.

## MCP

Тулзы `create_signal`, `list_signals`, `delete_signal` доступны через MCP-сервер
(`https://openradar.fun/mcp`) для подписанных участников.
