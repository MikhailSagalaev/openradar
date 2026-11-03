# Резервное копирование и восстановление Radar

## Автоматическое резервное копирование

Скрипт `scripts/backup.sh` выполняет:
1. Создание бинарного дампа `pg_dump -Fc` из контейнера `radar_postgres`.
2. Опциональное асимметричное шифрование с помощью `age` открытым ключом `BACKUP_AGE_RECIPIENT`.
3. Опциональную загрузку в S3-совместимое объектное хранилище (MinIO, Timeweb Cloud S3, Yandex Object Storage).
4. Удаление локальных копий старше 14 дней.

### Настройка cron

Добавьте задание в crontab (`crontab -e`) для ежедневного запуска в 03:00 ночи. Замените `/opt/radar` на каталог, где реально живёт compose-проект (`docker inspect radar_app --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}'`):

```cron
0 3 * * * cd /opt/radar && bash scripts/backup.sh >> /var/log/radar-backup.log 2>&1
```

---

## Переход на новую major-версию PostgreSQL

Новая major-версия не открывает данные старой, поэтому данные переносятся дампом.
`scripts/pg-upgrade.sh` сравнивает версию запущенного `radar_postgres` с образом в
`docker-compose.yml` и, если в compose новее:

1. останавливает приложение и снимает `pg_dump -Fc` со старого сервера в `backups/pg<старая>-to-pg<новая>-*.dump`;
2. поднимает новый сервер на новом томе (`radar_pgdata18` для 18) и восстанавливает дамп;
3. сверяет версию и число лидов, а старый том (`radar_pgdata`) не трогает — он нужен для отката.

`deploy-server.sh` запускает скрипт на каждом деплое; когда версии совпадают, он ничего не делает.
Без `deploy-server.sh` запустите его один раз сами, **пока старый контейнер ещё работает**:

```bash
bash scripts/pg-upgrade.sh
docker compose up -d
```

Откат: верните в `docker-compose.yml` прежний образ и том `radar_pgdata:/var/lib/postgresql/data`
и пересоздайте контейнер `postgres`. Старый том можно удалить (`docker volume rm <проект>_radar_pgdata`),
когда новая версия поработала и свежий бэкап снят.

---

## Восстановление из резервной копии

### 1. Расшифровка (если использовалось шифрование age)

```bash
age --decrypt -i ~/.age/key.txt radar_20261023_030000.dump.age > radar_restore.dump
```

### 2. Восстановление в PostgreSQL

```bash
# Остановите приложение во избежание конфликтов
docker compose stop radar

# Восстановите схему и данные
docker exec -i radar_postgres pg_restore -U radar -d radar --clean --if-exists < radar_restore.dump

# Запустите приложение
docker compose start radar
```
