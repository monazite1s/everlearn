#!/usr/bin/env bash
# everlearn 数据迁移导出脚本
# 用法: bash scripts/migrate-export.sh
# 输出: tmp/everlearn-migration/ 目录（已被 .gitignore 排除）

set -euo pipefail

cd "$(dirname "$0")/.."

OUT_DIR="tmp/everlearn-migration"
STAMP="$(date +%Y%m%d-%H%M%S)"
BUNDLE="${OUT_DIR}/bundle-${STAMP}"

if [ ! -f .env ]; then
  echo "错误: 未找到 .env 文件" >&2
  exit 1
fi

# 读取 .env 中的数据库配置（不回显密码）
# shellcheck disable=SC1091
set -a; source .env; set +a
POSTGRES_DB="${POSTGRES_DB:-everlearn}"
POSTGRES_USER="${POSTGRES_USER:-everlearn}"

mkdir -p "${BUNDLE}"

echo "==> 1/5 启动 Docker 服务..."
docker compose up -d
echo "    等待服务健康..."
until [ "$(docker compose ps --format json postgres | grep -c '"Health":"healthy"')" -ge 1 ] 2>/dev/null; do
  sleep 2
done

echo "==> 2/5 导出 PostgreSQL 数据库..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc \
  > "${BUNDLE}/postgres.dump"

echo "==> 3/5 导出 Redis 数据（触发 RDB 快照后复制）..."
docker compose exec -T redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli BGSAVE' > /dev/null
sleep 2
docker compose cp redis:/data/dump.rdb "${BUNDLE}/redis-dump.rdb" 2>/dev/null \
  || echo "    （Redis 无持久化数据，跳过）"

echo "==> 4/5 导出 SeaweedFS 文件数据..."
docker run --rm \
  -v everlearn_seaweedfs_data:/data:ro \
  -v "$(pwd)/${BUNDLE}":/backup \
  alpine tar czf /backup/seaweedfs-data.tar.gz -C /data .

echo "==> 5/5 复制 .env（敏感文件，注意保管）..."
cp .env "${BUNDLE}/.env"

cat > "${BUNDLE}/README.txt" <<'EOF'
everlearn 迁移包
================
postgres.dump        PostgreSQL 自定义格式备份（pg_restore 导入）
redis-dump.rdb       Redis RDB 快照（可选）
seaweedfs-data.tar.gz SeaweedFS 卷打包
.env                 环境变量（含密钥，勿提交勿外传）

导入方法: 在新电脑项目根目录执行
  bash scripts/migrate-import.sh tmp/everlearn-migration/bundle-<时间戳>
EOF

echo ""
echo "==> 完成！迁移包位于: ${BUNDLE}"
ls -lh "${BUNDLE}"
echo ""
echo "请将整个 bundle 目录安全复制到新电脑（U盘/加密传输）。"
