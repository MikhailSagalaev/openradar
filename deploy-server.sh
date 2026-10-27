#!/usr/bin/env bash
# ==============================================================================
# Radar Auto-Deploy Script for Server
# ==============================================================================
set -euo pipefail
# Runs as `ssh host 'bash -s' < deploy-server.sh`: commands that read stdin get
# </dev/null so they do not swallow the rest of this script.

echo "[Radar Deploy] Начинаем развертывание Radar..."

# 1. Проверяем наличие директории
TARGET_DIR="${RADAR_DIR:-/opt/radar}"
if [ ! -d "$TARGET_DIR" ]; then
  echo "Клонируем репозиторий в $TARGET_DIR..."
  git clone https://github.com/MikhailSagalaev/openradar.git "$TARGET_DIR"
fi

cd "$TARGET_DIR"
echo "Обновляем репозиторий в $TARGET_DIR..."
git fetch origin main
git reset --hard origin/main

# 2. Создаем production .env если его нет или дополняем обязательными секретами
if [ ! -f .env ]; then
  echo "Создаем .env файл конфигурации со случайными надежными секретами..."
  RAND_DB_PWD=$(openssl rand -hex 24)
  RAND_ADMIN_TOKEN=$(openssl rand -hex 32)
  cat << EOF > .env
PORT=8787
RADAR_HOST_PORT=8787
NODE_ENV=production
RADAR_ADMIN_TOKEN=${RAND_ADMIN_TOKEN}

# PostgreSQL 17 + pgvector
POSTGRES_USER=radar
POSTGRES_DB=radar
POSTGRES_PASSWORD=${RAND_DB_PWD}
DATABASE_URL=postgres://radar:${RAND_DB_PWD}@postgres:5432/radar

# General
RADAR_LOG_LEVEL=info
RADAR_PUBLIC_READ=true
RADAR_MODE=hub
RADAR_PUBLIC_URL=${RADAR_PUBLIC_URL:-}
RADAR_CONSOLE_SINK=true
EOF
  echo ".env файл успешно создан."
else
  # Дополняем недостающие переменные если файл уже был
  if ! grep -q "^POSTGRES_PASSWORD=" .env 2>/dev/null; then
    RAND_DB_PWD=$(openssl rand -hex 24)
    echo "POSTGRES_PASSWORD=${RAND_DB_PWD}" >> .env
  fi
  if ! grep -q "^RADAR_ADMIN_TOKEN=" .env 2>/dev/null; then
    RAND_ADMIN_TOKEN=$(openssl rand -hex 32)
    echo "RADAR_ADMIN_TOKEN=${RAND_ADMIN_TOKEN}" >> .env
  fi
  if ! grep -q "^RADAR_MODE=" .env 2>/dev/null; then
    echo "RADAR_MODE=hub" >> .env
  fi
  if ! grep -q "^RADAR_HOST_PORT=" .env 2>/dev/null; then
    echo "RADAR_HOST_PORT=8787" >> .env
  fi
  if ! grep -q "^RADAR_PUBLIC_URL=" .env 2>/dev/null && [ -n "${RADAR_PUBLIC_URL:-}" ]; then
    echo "RADAR_PUBLIC_URL=${RADAR_PUBLIC_URL}" >> .env
  fi
  # 0.7 refuses example admin tokens: replace one if an old .env still has it.
  CURRENT_TOKEN=$(grep -E "^RADAR_ADMIN_TOKEN=" .env | cut -d '=' -f2- | tr -d ' "' || true)
  case "$CURRENT_TOKEN" in
    change-me|012345678901234567890123456789012|your_secure_random_admin_token_here_at_least_32_chars|"")
      NEW_TOKEN=$(openssl rand -hex 32)
      sed -i "s|^RADAR_ADMIN_TOKEN=.*|RADAR_ADMIN_TOKEN=${NEW_TOKEN}|" .env
      echo "RADAR_ADMIN_TOKEN был примером из репозитория и заменён; новый токен в $TARGET_DIR/.env"
      ;;
  esac
fi

# 3. Читаем порт хоста
RADAR_HOST_PORT=$(grep -E "^RADAR_HOST_PORT=" .env | cut -d '=' -f2- | tr -d ' "' || true)
RADAR_HOST_PORT=${RADAR_HOST_PORT:-8787}

# 4. Сборка нового образа приложения без остановки текущего
echo "Сборка обновленного образа Radar..."
docker compose build radar

# 5. Проверка работы базы данных
echo "Проверка и запуск PostgreSQL..."
docker compose up -d postgres

# 6. Резервная копия перед миграциями (0.7 удаляет таблицы mesh radar/1)
BACKUP_DIR="${RADAR_BACKUP_DIR:-$TARGET_DIR/backups}"
mkdir -p "$BACKUP_DIR"
for i in {1..15}; do
  docker compose exec -T postgres pg_isready -q </dev/null && break
  sleep 2
done
PG_USER=$(grep -E "^POSTGRES_USER=" .env | cut -d '=' -f2- | tr -d ' "' || true)
PG_DB=$(grep -E "^POSTGRES_DB=" .env | cut -d '=' -f2- | tr -d ' "' || true)
BACKUP_FILE="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S).dump"
if docker compose exec -T postgres pg_dump -U "${PG_USER:-radar}" -Fc "${PG_DB:-radar}" </dev/null > "$BACKUP_FILE"; then
  echo "Резервная копия: $BACKUP_FILE"
else
  echo "Не удалось сделать резервную копию, деплой остановлен"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# 7. Запуск миграций базы данных
echo "Применение миграций базы данных..."
docker compose run --rm -T radar migrate </dev/null

# 8. Бесшовное обновление контейнера приложения
echo "Перезапуск контейнера radar_app..."
docker compose up -d --no-deps radar

# 9. Проверка статуса и healthcheck с ретраями
echo "⏳ Ожидаем готовность сервиса (порт $RADAR_HOST_PORT)..."
HEALTH_OK=0
for i in {1..12}; do
  sleep 2
  if curl -fsS "http://127.0.0.1:${RADAR_HOST_PORT}/health" >/dev/null 2>&1; then
    HEALTH_OK=1
    break
  fi
  echo "Ожидание старта сервиса... ($i/12)"
done

if [ "$HEALTH_OK" -ne 1 ]; then
  echo "Healthcheck failed! Radar не ответил 200 OK на http://127.0.0.1:${RADAR_HOST_PORT}/health"
  echo "Логи сервиса:"
  docker compose logs radar --tail 50
  exit 1
fi

echo "Radar успешно запущен и работает на http://127.0.0.1:${RADAR_HOST_PORT}"
