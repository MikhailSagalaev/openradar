# Roadmap

Живой трекинг — в issues; этот файл фиксирует направления и что уже вышло.
Механика версий: тег → автодеплой (см. [PUBLISHING.md](PUBLISHING.md)).

## Направления (эпики-issues)

| Эпик | Issue | Суть |
| --- | --- | --- |
| Агентская дистрибуция | [#59](https://github.com/MikhailSagalaev/openradar/issues/59) | стать стандартным источником джоб-данных для ИИ-агентов: MCP, OpenAPI, скиллы, маркетплейсы |
| Сеть участников | [#60](https://github.com/MikhailSagalaev/openradar/issues/60) | витрина вклада: рейтинг, источники недели, стена историй, партнёры |
| Data-продукт | [#61](https://github.com/MikhailSagalaev/openradar/issues/61) | референс JobsPipe: Signals, закрытия, таксономия, insights — всё бесплатно и открыто |
| Источники | [#62](https://github.com/MikhailSagalaev/openradar/issues/62) | очередь-2, дисциплина robots.txt, журнал решений по источникам |
| Масштаб к v1.0 | [#63](https://github.com/MikhailSagalaev/openradar/issues/63) | set-based recompute, кластер, политики, стабильный контракт адаптеров |

Good first issues: [#54](https://github.com/MikhailSagalaev/openradar/issues/54),
[#55](https://github.com/MikhailSagalaev/openradar/issues/55),
[#56](https://github.com/MikhailSagalaev/openradar/issues/56),
[#57](https://github.com/MikhailSagalaev/openradar/issues/57),
[#58](https://github.com/MikhailSagalaev/openradar/issues/58).

## v1.0 — критерии

- Стабильный контракт адаптеров с semver и публичным реестром.
- Хаб выдерживает 100k+ лидов/30 дней: set-based пересчёт рейтинга, кластер воркеров.
- Политики: takedown по требованию площадки, security policy, бренд.
- Лента: ≥100 активных источников, ≥500 участников сети, время «пост → лента» ≤ 5 минут.
