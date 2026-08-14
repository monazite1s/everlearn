#!/usr/bin/env bash
# everlearn 数据迁移导入脚本（在新电脑执行）
# 用法: bash scripts/migrate-import.sh <bundle目录路径>

set -euo pipefail

cd "$(dirname "$0")/.."

BUNDLE="${1:?用法: bash scripts/migrate-import.sh <bundle目录路径>}"

if [ ! -f "${BUNDLE}/postgres.dump" ]; then
  echo "错误: ${BUNDLE}/postgres.dump 不存在" >&2
  exit 1
fi

# 使用迁移包中的 .env（保持与导出数据一致的密码）
if [ -f "${BUNDLE}/.env" ] && [ ! -f .env ]; then
  cp "${BUNDLE}/.env" .env
  echo "==> 已从迁移包恢复 .env"
elif [ ! -f .env ]; then
  echo "错误: 未找到 .env，且迁移包中没有" >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a; source .env; set +a
POSTGRES_DB="${POSTGRES_DB:-everlearn}"
POSTGRES_USER="${POSTGRES_USER:-everlearn}"

echo "==> 1/5 启动全新 Docker 服务..."
docker compose down -v 2>/dev/null || true
docker compose up -d
echo "    等待服务健康..."
sleep 10
until [ "$(docker compose ps --format json postgres | grep -c '"Health":"healthy"')" -ge 1 ] 2>/dev/null; do
  sleep 2
done

echo "==> 2/5 导入 PostgreSQL 数据..."
docker compose exec -T postgres pg_restore \
  -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists \
  < "${BUNDLE}/postgres.dump"

echo "==> 3/5 导入 Redis 数据（如有）..."
if [ -f "${BUNDLE}/redis-dump.rdb" ]; then
  docker compose stop redis > /dev/null
  docker compose cp "${BUNDLE}/redis-dump.rdb" redis:/data/dump.rdb
  docker compose start redis > /dev/null
fi

echo "==> 4/5 导入 SeaweedFS 文件数据..."
if [ -f "${BUNDLE}/seaweedfs-data.tar.gz" ]; then
  docker compose stop seaweedfs > /dev/null
  # MSYS_NO_PATHCONV=1 防止 Git Bash 把容器内路径 /backup 转成 Windows 路径
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v everlearn_seaweedfs_data:/data \
    -v "$(cd "${BUNDLE}" && pwd -W 2>/dev/null || pwd)":/backup \
    alpine sh -c "rm -rf /data/* /data/.[!.]* 2>/dev/null; tar xzf /backup/seaweedfs-data.tar.gz -C /data"
  docker compose start seaweedfs > /dev/null
fi

echo "==> 5/5 验证服务状态..."
docker compose ps

echo ""
echo "==> 导入完成！接下来:"
echo "    pnpm install"
echo "    pnpm dev"
echo ""
echo "    如需验证数据: docker compose exec postgres psql -U ${POSTGRES_USER} -d ${POSTGRES_DB} -c '\\dt'"
