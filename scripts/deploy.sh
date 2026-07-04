#!/bin/bash
# =============================================================================
# scripts/deploy.sh — NanaWrongBook 服务器一键部署脚本
#
# 用法:
#   ssh root@119.28.42.208
#   cd /opt/nana
#   bash scripts/deploy.sh
#
# 前置条件:
#   - 本地已推代码到 origin/main，GitHub Actions CI 已完成构建并通过测试容器门禁
#     （否则 docker compose pull 会拉取到旧镜像或失败）
#   - 服务器已安装 docker, docker compose, git, sqlite3
#   - 当前用户有 /opt/nana 写入权限
#   - GHCR 认证已完成（docker login ghcr.io）
#
# 工作流程:
#   1. 进入项目目录 /opt/nana
#   2. 检查 Git 工作区状态（修改文件会警告，untracked 不阻塞）
#   3. 确认分支为 main（非 main 需 --force 参数）
#   4. git pull origin main 拉取最新代码
#   5. 备份 SQLite 数据库（cp 快速备份 + sqlite3 .backup 快照）
#   6. docker compose pull 拉取最新镜像
#   7. docker compose up -d 重启容器
#   8. 健康检查 + 输出部署报告
#
# 参数:
#   --force   忽略分支检查和未提交修改警告，继续部署
#
# 安全说明:
#   - set -e：任何步骤失败即停止，不掩盖错误
#   - 备份失败不得继续部署（安全铁律）
#   - 非 main 分支默认拒绝，防止意外部署开发中代码
#   - 不修改 .env、Caddyfile、docker-compose.prod.yml 等配置文件
# =============================================================================

set -e

# ===== 颜色定义 =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ===== 配置 =====
PROJECT_DIR="/opt/nana"
COMPOSE_FILE="docker-compose.prod.yml"
DB_PATH="data/dev.db"
BACKUP_DIR="backups"
BACKUP_SCRIPT="backup.sh"
HEALTH_CHECK_URL="https://nana.nanatop.xyz/nana"

echo ""
echo "=============================================="
echo "   NanaWrongBook 部署脚本"
echo "   开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================================="
echo ""

# ===== 步骤 0: 参数解析 =====
FORCE_MODE=false
if [ "$1" = "--force" ]; then
    FORCE_MODE=true
    echo -e "${YELLOW}⚠ --force 模式：跳过分支检查和未提交修改警告${NC}"
fi

# ===== 步骤 1: 进入项目目录 =====
echo -e "${YELLOW}[1/8]${NC} 进入项目目录..."
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}❌ 目录 $PROJECT_DIR 不存在${NC}"
    echo "请确认已在服务器上克隆仓库："
    echo "  git clone https://github.com/Jewellury/NanaWrongBook.git /opt/nana"
    exit 1
fi
cd "$PROJECT_DIR"
echo "   目录: $(pwd)"

# ===== 步骤 2: 检查 Git 工作区状态 =====
echo ""
echo -e "${YELLOW}[2/8]${NC} 检查 Git 工作区状态..."

# 检查是否有未提交的修改（排除 untracked 文件，它们不影响 pull）
# `git status --porcelain` 中 '?? ' 开头的是 untracked 文件
# ' M '、' M'、'D '、'D'、'R '、'C ' 等为已跟踪文件的变更
MODIFIED=$(git status --porcelain | grep -v '^??' | grep -v '^$' || true)
if [ -n "$MODIFIED" ]; then
    echo -e "${RED}⚠ 警告: 工作区有未提交的修改（以下列出前 20 行）:${NC}"
    echo "$MODIFIED" | head -20
    echo ""
    echo -e "${YELLOW}git pull 可能因冲突失败。建议先 git stash 或提交后再部署。${NC}"
    if [ "$FORCE_MODE" = false ]; then
        echo -e "${RED}如需忽略此警告继续，请使用 --force 参数${NC}"
        exit 1
    fi
    echo -e "${YELLOW}--force 已指定，继续执行...${NC}"
else
    echo -e "${GREEN}✅ 工作区干净${NC}"
fi

# ===== 步骤 3: 确认分支并记录 commit =====
echo ""
echo -e "${YELLOW}[3/8]${NC} 确认分支和 commit..."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_COMMIT=$(git rev-parse --short HEAD)
CURRENT_COMMIT_FULL=$(git rev-parse HEAD)

echo "   当前分支: $CURRENT_BRANCH"
echo "   当前 commit: $CURRENT_COMMIT ($CURRENT_COMMIT_FULL)"

# 检查远程 origin/main 的 commit（用于对比）
REMOTE_COMMIT=$(git rev-parse --short origin/main 2>/dev/null || echo "unknown")
echo "   远程 origin/main: $REMOTE_COMMIT"

if [ "$CURRENT_BRANCH" != "main" ]; then
    echo ""
    echo -e "${RED}⚠ 当前分支不是 main（当前: $CURRENT_BRANCH）${NC}"
    echo "   服务器默认只部署 main 分支（AGENTS.md 部署发布门禁）。"
    echo "   如需临时部署到此分支，请传递 --force 参数并确认已获用户批准。"
    if [ "$FORCE_MODE" = false ]; then
        exit 1
    fi
    echo -e "${YELLOW}--force 已指定，临时部署到非 main 分支...${NC}"
    echo -e "${YELLOW}⚠ 请确认用户已明确批准此临时例外${NC}"
fi

# ===== 步骤 4: git pull =====
echo ""
echo -e "${YELLOW}[4/8]${NC} 拉取最新代码..."
echo -e "${YELLOW}   执行: git pull origin main${NC}"

git pull origin main

NEW_COMMIT=$(git rev-parse --short HEAD)
NEW_COMMIT_FULL=$(git rev-parse HEAD)
echo -e "${GREEN}✅ git pull 完成${NC}"
echo "   拉取后 commit: $NEW_COMMIT ($NEW_COMMIT_FULL)"

if [ "$CURRENT_COMMIT" != "$NEW_COMMIT" ]; then
    echo -e "${GREEN}   代码已更新（${CURRENT_COMMIT} → ${NEW_COMMIT}）${NC}"
else
    echo -e "${YELLOW}   代码无变化（仍是 $CURRENT_COMMIT）${NC}"
fi

# ===== 步骤 5: 备份数据库 =====
echo ""
echo -e "${YELLOW}[5/8]${NC} 备份 SQLite 数据库..."
echo -e "${YELLOW}   ⚠ 安全铁律：部署前必须备份生产 SQLite，备份失败不得继续部署${NC}"

# 5a. cp 快速文件备份（简易安全网）
if [ -f "$DB_PATH" ]; then
    mkdir -p "$BACKUP_DIR"
    BACKUP_FILE="$BACKUP_DIR/prod-$(date +%Y%m%d_%H%M%S).db"
    cp "$DB_PATH" "$BACKUP_FILE"
    echo -e "${GREEN}   ✅ 文件备份完成: $BACKUP_FILE${NC}"
    ls -lh "$BACKUP_FILE"
else
    echo -e "${YELLOW}   ⚠ 数据库文件 $DB_PATH 不存在，跳过文件备份（首次部署？）${NC}"
fi

# 5b. 调用 backup.sh 做 sqlite3 .backup 快照（更安全的备份方式）
if [ -f "$BACKUP_SCRIPT" ]; then
    echo -e "${YELLOW}   执行 backup.sh 进行 sqlite3 快照备份...${NC}"
    bash "$BACKUP_SCRIPT"
    echo -e "${GREEN}   ✅ backup.sh 快照备份完成${NC}"
else
    echo -e "${YELLOW}   ⚠ backup.sh 未找到，跳过 sqlite3 快照备份${NC}"
fi

# ===== 步骤 6: docker compose pull =====
echo ""
echo -e "${YELLOW}[6/8]${NC} 拉取最新 Docker 镜像..."
echo -e "${YELLOW}   ⚠ 注意: ${COMPOSE_FILE} 使用 image 方式（无 build 指令），${NC}"
echo -e "${YELLOW}     必须用 docker compose pull 而不是 build --no-cache 或 up -d --build。${NC}"
echo -e "${YELLOW}     如果 pull 失败，请检查 GitHub Actions CI 是否已完成构建。${NC}"

docker compose -f "$COMPOSE_FILE" pull
echo -e "${GREEN}✅ 镜像拉取完成${NC}"

# ===== 步骤 7: docker compose up -d =====
echo ""
echo -e "${YELLOW}[7/8]${NC} 重启容器..."
docker compose -f "$COMPOSE_FILE" up -d
echo -e "${GREEN}✅ 容器已重启${NC}"

# ===== 步骤 8: 健康检查 + 部署报告 =====
echo ""
echo -e "${YELLOW}[8/8]${NC} 健康检查..."

# 8a. 等待容器启动
echo -e "${YELLOW}   等待容器就绪（5 秒）...${NC}"
sleep 5

# 8b. 检查容器状态
echo -e "${YELLOW}   检查容器运行状态:${NC}"
docker compose -f "$COMPOSE_FILE" ps

# 8c. 单独获取容器状态文本
echo ""
WRONG_NOTEBOOK_STATUS=$(docker ps --filter "name=wrong-notebook" --format "{{.Status}}" 2>/dev/null || echo "未运行")
CADDY_STATUS=$(docker ps --filter "name=caddy" --format "{{.Status}}" 2>/dev/null || echo "未运行")

if echo "$WRONG_NOTEBOOK_STATUS" | grep -q "Up"; then
    echo -e "${GREEN}   ✅ wrong-notebook: $WRONG_NOTEBOOK_STATUS${NC}"
else
    echo -e "${RED}   ❌ wrong-notebook: $WRONG_NOTEBOOK_STATUS${NC}"
fi

if echo "$CADDY_STATUS" | grep -q "Up"; then
    echo -e "${GREEN}   ✅ caddy: $CADDY_STATUS${NC}"
else
    echo -e "${RED}   ❌ caddy: $CADDY_STATUS${NC}"
fi

# 8d. 显示最新日志
echo ""
echo -e "${YELLOW}   wrong-notebook 最新日志（末尾 10 行）:${NC}"
docker logs --tail 10 wrong-notebook 2>/dev/null || echo "   （无法获取日志）"

# ===== 输出部署报告 =====
echo ""
echo "=============================================="
echo -e "${GREEN}   ✅ 部署流程完成${NC}"
echo "=============================================="
echo "   完成时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "   分支:     $CURRENT_BRANCH"
echo "   commit:   $CURRENT_COMMIT → $NEW_COMMIT"
echo "   远程:     origin/main = $REMOTE_COMMIT"
echo "   wrong-notebook: $WRONG_NOTEBOOK_STATUS"
echo "   caddy:          $CADDY_STATUS"
echo "=============================================="
echo ""
echo -e "${YELLOW}后续验证命令:${NC}"
echo "   curl -sk $HEALTH_CHECK_URL"
echo "   docker logs --tail 80 wrong-notebook"
echo ""
echo -e "${YELLOW}如需回滚:${NC}"
echo "   1. 查看可用备份: ls -lh $BACKUP_DIR/"
echo "   2. 恢复数据库:   cp $BACKUP_DIR/prod-<timestamp>.db $DB_PATH"
echo "   3. 回滚镜像:     修改 .env 中 NANA_IMAGE 为旧 tag，然后重新部署"
echo "   详情见:          doc/guide/deployment-guide.md §4 回滚指南"
echo ""
