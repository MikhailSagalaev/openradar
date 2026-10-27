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
