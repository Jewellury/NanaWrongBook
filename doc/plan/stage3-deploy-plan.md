# Stage 3 生产接入部署计划 (r2)

> 计划者：plan-agent
> 日期：2026-07-07
> 版本：r2（补充 Stage 3 migration + seed 验证步骤）
> 前置：Provider Smoke Conditional Go 已确认（2026-07-06）
> 预计影响：Dockerfile（预编译 seed 脚本）、docker-entrypoint.sh（运行 seed）、.env.test.example、服务器 .env、doc/active_spec.md

---

## 0. 特别声明

**本轮 Go 只覆盖 image-only 场景。** Provider smoke 验证了豆包 Lite 对图片的识别、分类和反馈质量，但语音转写（transcript）质量完全未测。上线后需单独安排语音验收（§7）。

**本轮不新增功能。** 只做生产接入：配置环境变量、修复 seed 自动化缺口、走部署流程、真机验收。

**r2 新增关键内容**：生产库 TextbookTopic / TextbookNodeMapping seed 自动化 + 部署后只读验证（§4.6）。这是 2026-07-02 KnowledgeNode seed 丢失事故的同类风险，必须在部署前堵住。

---

## 1. 大白话概述

Smoke 证明豆包 Lite 对图片的反馈质量可以给孩子看。现在要把 AI 整理功能从"只在本地能跑"变成"外甥女在手机上也能用"。

但有一个**必须先堵的缺口**：生产库的 TextbookTopic（16 条）和 TextbookNodeMapping（48 条）种子数据，Dockerfile 和 entrypoint 都不会自动灌入。如果不补这个缺口，AI 返回 TB-010 时 `/process` API 会报 500 "知识点或课本章节数据为空"，AI 整理功能完全不可用——跟 2026-07-02 KnowledgeNode=0 的事故一模一样。

所以要做的事依次是：修复 Dockerfile/entrypoint 让 seed 自动跑 → 补 .env.test.example → dev 合 main → CI 构建镜像 → 服务器配 .env → 部署 → **验证 seed 行数** → 真机验收。

---

## 2. 现状盘点

### 2.1 已就绪

| 组件 | 状态 | 说明 |
|------|------|------|
| 代码 | ✅ dev 分支已就绪 | Round 0-4 + Hotfix 全部完成 |
| Provider Smoke | ✅ Conditional Go | 3/3 图片成功，0 幻觉，0 真实越界 |
| Stage 3 migration | ✅ 已在 prisma/migrations | `20260705011104_stage3_revised_ai_card` 建 4 张表 |
| CI workflow | ✅ build-and-push.yml | push main → build + test container + push GHCR |
| 生产 compose | ✅ docker-compose.prod.yml | image 方式，env_file: .env |
| 一键部署脚本 | ✅ scripts/deploy.sh | 分支检查 → pull → 备份 → 拉镜像 → 重启 → 健康检查 |
| 备份脚本 | ✅ backup.sh | sqlite3 .backup，每日 crontab 2:00 |
| HTTPS | ✅ Caddy 反代 | nana.nanatop.xyz → wrong-notebook:3000 |

### 2.2 缺口（本轮要做的）

| 缺口 | 严重度 | 处理方式 |
|------|--------|----------|
| **TextbookTopic/TextbookNodeMapping seed 不自动跑** | 🔴 **致命** | 修改 Dockerfile + entrypoint，预编译 seed 脚本并运行 |
| **KnowledgeNode seed 也不自动跑** | 🟡 已手动修复过 | 同上，一并修复防止复发 |
| 服务器 .env 缺 VOLCENGINE 变量 | 🟡 需要 | SSH 到服务器手动追加 |
| .env.test.example 缺 VOLCENGINE 占位 | 🟡 需要 | 本地修改，CI 测试容器需要 |
| dev 未合 main | 🟡 需要 | git checkout main && git merge dev |
| 真机验收未执行 | 🟡 需要 | 部署后用测试账号验收 |
| 语音质量未验证 | 🟡 需要 | 上线后单独验收（§7） |

### 2.3 Seed 自动化缺口分析（r2 新增）

**根因调查**：

| 环节 | 是否跑 seed_textbook_topics | 是否跑 seed_graph |
|------|:--:|:--:|
| Dockerfile build `prisma db seed` | ❌ 只跑 `prisma/seed.ts`（admin 用户） | ❌ 同 |
| docker-entrypoint.sh | ❌ 只跑 `seed-admin.js` + `rebuild-system-tags.js` | ❌ 同 |
| `npm run seed` | ❌ 跑 `seed_graph.ts`（含 KnowledgeNode），但不含 TextbookTopic | ✅ 但需手动执行 |

**`prisma db seed` 的配置**（package.json）：
```json
"prisma": {
  "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
}
```
`prisma/seed.ts` 只创建 admin 用户，不跑 `seed_textbook_topics.ts` 也不跑 `seed_graph.ts`。

**影响**：如果生产库 TextbookTopic=0，`/process` API 的 `loadNodesAndTopics()` 返回空数组，直接 500 报错，AI 整理完全不可用。

---

## 3. 任务分解

| # | 任务 | 在哪做 | 改什么 |
|---|------|--------|--------|
| 1 | **修复 Dockerfile + entrypoint seed 自动化** | 本地 | 预编译 seed 脚本 + entrypoint 运行 |
| 2 | 补 .env.test.example 占位 | 本地 | 追加 VOLCENGINE_* 占位值 |
| 3 | 本地构建验证 | 本地 | npm.cmd run build |
| 4 | dev 合 main | 本地 | git checkout main && git merge dev && git push origin main |
| 5 | CI 门禁 | GitHub Actions | 自动触发：build + test container + push GHCR |
| 6 | 服务器 .env 追加变量 | 服务器 | SSH 手动追加 4 个 VOLCENGINE 变量 |
| 7 | 服务器部署 | 服务器 | bash scripts/deploy.sh |
| 8 | **Migration + Seed 只读验证** | 服务器 | sqlite3 查询 4 张表行数 |
| 9 | 真机验收 | 手机 | 测试账号登录 → 拍题 → 等 AI → 看结果卡 |
| 10 | 语音验收 | 手机 | 拍题 + 录音 → 看 transcript 质量 |
| 11 | Git 收口 | 本地 | 提交全部变更 |

---

## 4. 详细设计

### 4.1 任务 1：修复 Dockerfile + entrypoint seed 自动化（r2 新增，🔴 致命）

**目标**：让 `seed_textbook_topics.ts` 和 `seed_graph.ts` 在容器启动时自动运行（幂等，重复执行不报错）。

**方案**：沿用现有 `rebuild-system-tags.ts` 的模式——Dockerfile build 时用 `tsc` 预编译成 `.js`，entrypoint 运行。

#### 4.1.1 Dockerfile 修改

在现有 `tsc` 预编译行后追加两个 seed 脚本的编译：

```dockerfile
# 现有（不改动）：
RUN npx tsc scripts/rebuild-system-tags.ts --outDir dist-scripts --esModuleInterop --resolveJsonModule --skipLibCheck --module commonjs --target ES2020

# 新增：预编译 seed 脚本
RUN npx tsc prisma/seed_textbook_topics.ts --outDir dist-scripts/prisma --esModuleInterop --resolveJsonModule --skipLibCheck --module commonjs --target ES2020
RUN npx tsc prisma/seed_graph.ts --outDir dist-scripts/prisma --esModuleInterop --resolveJsonModule --skipLibCheck --module commonjs --target ES2020
```

在 runner 阶段的 COPY 区域追加：

```dockerfile
# 现有（不改动）：
COPY --from=builder --chown=nextjs:nodejs /app/dist-scripts ./dist-scripts

# dist-scripts 已包含预编译的 seed 脚本，无需额外 COPY
```

> 注意：`seed_graph.ts` import 了 `doc/research/seed_graph_batch1.ts`，tsc 编译时需要确保该文件在 COPY . . 后可用（builder 阶段已有）。如果 tsc 报 import 路径错误，改用 esbuild bundle 方式（参考 2026-07-02 修复方案）。

#### 4.1.2 docker-entrypoint.sh 修改

在 `prisma migrate deploy` 之后、`seed-admin` 之前，插入 seed 脚本运行：

```sh
# Run migrations to ensure DB schema is available and up to date.
echo "[Entrypoint] Running database migrations to sync schema..."
cd /app && $PRISMA_BIN migrate deploy --schema=./prisma/schema.prisma && {
    echo "[Entrypoint] Migrations completed successfully."
} || echo "[Entrypoint] Migration failed or no pending migrations."

# === Stage 3 seed: TextbookTopic + TextbookNodeMapping（幂等）===
echo "[Entrypoint] Seeding TextbookTopic + TextbookNodeMapping..."
cd /app && node ./dist-scripts/prisma/seed_textbook_topics.js && {
    echo "[Entrypoint] TextbookTopic seed completed."
} || echo "[Entrypoint] TextbookTopic seed failed (non-fatal, continuing...)."

# === Knowledge graph seed: KnowledgeNode + Edge + Mainline（幂等）===
echo "[Entrypoint] Seeding KnowledgeGraph..."
cd /app && node ./dist-scripts/prisma/seed_graph.js && {
    echo "[Entrypoint] KnowledgeGraph seed completed."
} || echo "[Entrypoint] KnowledgeGraph seed failed (non-fatal, continuing...)."

# 现有（不改动）：Always run seed after migrations to ensure admin user...
```

**为什么 non-fatal**：与 `seed-admin` 保持一致策略。如果 seed 失败，容器仍能启动，部署后验证步骤（§4.8）会发现行数为 0 并报警。

**幂等性**：两个 seed 脚本都使用 `prisma.upsert`，重复执行不报错、不产生重复数据。

#### 4.1.3 编译验证

本地验证 tsc 能成功编译这两个脚本：

```bash
npx.cmd tsc prisma/seed_textbook_topics.ts --outDir dist-scripts-test --esModuleInterop --resolveJsonModule --skipLibCheck --module commonjs --target ES2020
npx.cmd tsc prisma/seed_graph.ts --outDir dist-scripts-test --esModuleInterop --resolveJsonModule --skipLibCheck --module commonjs --target ES2020
# 验证生成的 .js 文件存在
dir dist-scripts-test\prisma\*.js
# 清理临时目录
rmdir /s /q dist-scripts-test
```

如果 `seed_graph.ts` 因 import `doc/research/seed_graph_batch1.ts` 编译失败，改用 esbuild bundle：

```bash
npx.cmd esbuild prisma/seed_graph.ts --bundle --platform=node --outfile=dist-scripts/prisma/seed_graph.js --format=cjs
```

### 4.2 任务 2：补 .env.test.example

CI 测试容器使用 `.env.test.example` 复制成 `.env.test`。测试代码中 mock 了 case-analyzer，不需要真实 API Key，但需要占位值防止 import 时报错。

在 `.env.test.example` 末尾追加：

```
# ========== Stage 3 AI（占位，测试 mock 不调真实 API）==========
VOLCENGINE_API_KEY="test-placeholder"
VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
LITE_ENDPOINT_ID="test-placeholder"
LITE_MODEL_NAME="doubao-seed-2-0-lite-260215"
```

### 4.3 任务 3：本地构建验证

```bash
npm.cmd run build
```

确认构建通过后再合 main。

### 4.4 任务 4：dev 合 main

```bash
git checkout dev
git status                          # 确认工作区干净
git checkout main
git merge dev
git push origin main                # 触发 CI
```

### 4.5 任务 5：CI 门禁

CI workflow（`.github/workflows/build-and-push.yml`）在 push main 时自动执行：

1. `npm ci` — 安装依赖
2. `npx prisma generate` — 生成 Prisma Client
3. `npm run build` — 构建验证
4. `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` — 测试容器门禁
5. `docker compose -f docker-compose.test.yml down -v` — 清理
6. `docker build` + push GHCR（三个 tag：sha-、时间戳、latest）

**门禁规则**：CI 失败 → 不得部署。修复必须回本地改代码。

**监控方式**：访问 https://github.com/Jewellury/NanaWrongBook/actions 确认 CI 绿色。

### 4.6 任务 6：服务器 .env 追加变量

SSH 到服务器，手动追加 4 个环境变量：

```bash
ssh root@119.28.42.208
cd /opt/nana

# 追加 VOLCENGINE 变量（不覆盖已有内容）
cat >> /opt/nana/.env << 'EOF'

# Stage 3: Nana AI 整理（豆包 Lite 一体化）
VOLCENGINE_API_KEY="<从 .env 复制>"
VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
LITE_ENDPOINT_ID="ep-20260619160218-5m76d"
LITE_MODEL_NAME="doubao-seed-2-0-lite-260215"
CASE_ANALYZER_TIMEOUT_MS="60000"
EOF

# 验证（不回显完整 Key）
grep VOLCENGINE /opt/nana/.env
```

**安全**：
- 密钥只在服务器 .env 中，不入 git
- 操作时不回显完整 Key（用 grep 确认存在即可）

### 4.7 任务 7：服务器部署

等 CI 绿色后，在服务器执行一键部署：

```bash
ssh root@119.28.42.208
cd /opt/nana
bash scripts/deploy.sh
```

deploy.sh 自动完成：
1. 检查分支为 main
2. git pull origin main
3. 备份 SQLite（cp 快速备份 + backup.sh sqlite3 快照）
4. docker compose pull（拉新镜像）
5. docker compose up -d（重启容器，entrypoint 自动跑 migration + seed）
6. 健康检查 + 输出部署报告

### 4.8 任务 8：Migration + Seed 只读验证（r2 新增，🔴 致命）

**部署后、真机验收前，必须执行此验证。如果任何一项不通过，不得开始真机验收。**

#### 4.8.1 验证 migration 已应用

```bash
# 检查 Stage 3 migration 是否在 _prisma_migrations 表中
sqlite3 /opt/nana/data/dev.db "SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%stage3%';"
# 预期：20260705011104_stage3_revised_ai_card
```

#### 4.8.2 验证 4 张表存在且行数正确

```bash
# TextbookTopic（期望 16）
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM TextbookTopic;"

# TextbookNodeMapping（期望 48）
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM TextbookNodeMapping;"

# KnowledgeNode（期望 ≥ 48）
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM KnowledgeNode;"

# KnowledgeEdge（期望 ≥ 36）
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM KnowledgeEdge;"

# CaseAiResult 表存在（期望 0，首部署无数据）
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM CaseAiResult;"

# CaseTextbookTopicTag 表存在（期望 0）
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM CaseTextbookTopicTag;"
```

#### 4.8.3 验证汇总

| 表 | 期望行数 | 不通过处理 |
|----|----------|------------|
| `_prisma_migrations` 含 stage3 | 1 条 | 检查 entrypoint 日志中 migration 报错 |
| `TextbookTopic` | 16 | §4.8.4 补 seed 流程 |
| `TextbookNodeMapping` | 48 | §4.8.4 补 seed 流程 |
| `KnowledgeNode` | ≥ 48 | §4.8.4 补 seed 流程 |
| `KnowledgeEdge` | ≥ 36 | §4.8.4 补 seed 流程 |
| `CaseAiResult` | 0（表存在即可） | 如果表不存在，migration 未应用 |
| `CaseTextbookTopicTag` | 0（表存在即可） | 同上 |

#### 4.8.4 如果 seed 缺失（补 seed 安全流程）

**不得在真机验收前跳过此步骤。**

```bash
# 1. 确认有备份（deploy.sh 已执行 backup.sh）
ls -lh /opt/nana/backups/

# 2. 在容器内手动跑 seed（如果 entrypoint 的 seed 失败了）
docker exec wrong-notebook node /app/dist-scripts/prisma/seed_textbook_topics.js
docker exec wrong-notebook node /app/dist-scripts/prisma/seed_graph.js

# 3. 如果容器内没有预编译的 seed 脚本（Dockerfile 修改未生效），
#    使用 esbuild bundle 方式（2026-07-02 修复方案）：
#    在本地打包 → scp 到服务器 → docker cp 到容器 → docker exec node 执行

# 4. 重新验证行数
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM TextbookTopic;"
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM TextbookNodeMapping;"
sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM KnowledgeNode;"

# 5. 全部通过后才继续真机验收
```

#### 4.8.5 执行日志必须记录

部署日志中必须包含以下信息（人工记录或脚本输出）：

```
=== Migration + Seed 验证 ===
备份路径: /opt/nana/backups/prod-<timestamp>.db
Migration: 20260705011104_stage3_revised_ai_card → ✅ 已应用
TextbookTopic: 16 → ✅
TextbookNodeMapping: 48 → ✅
KnowledgeNode: 48 → ✅
KnowledgeEdge: 36 → ✅
CaseAiResult 表: 存在 → ✅
CaseTextbookTopicTag 表: 存在 → ✅
=== 验证通过，可以开始真机验收 ===
```

### 4.9 任务 9：真机验收（Image-only）

**前置**：§4.8 Migration + Seed 验证全部通过。

**验收人**：用户（或外甥女）

**验收步骤**：

| # | 操作 | 预期结果 | 通过标准 |
|---|------|----------|----------|
| 1 | 手机浏览器打开 nana.nanatop.xyz/nana | 跳转到登录页 | 页面正常加载 |
| 2 | 用测试账号登录 | 进入 /nana 页面 | 登录成功 |
| 3 | 点击"拍题" | 进入采集页 | 相机可用 |
| 4 | 拍一道数学题（清晰） | 图片保存，显示"AI 整理中..." | 保存成功 |
| 5 | 等待 30-40 秒 | AI 结果卡出现 | 结果卡展示 7 字段内容 |
| 6 | 查看题目摘要 | 准确概括题意 | 与题目内容匹配 |
| 7 | 查看课本分类 | 显示 TextbookTopic 名称 | 分类合理 |
| 8 | 查看知识点 | 显示 KnowledgeNode 名称 | 知识点合理 |
| 9 | 查看反馈文案 | 温和鼓励，不透露答案 | 语气合规 |
| 10 | 查看下一步建议 | "回看 XX 章节 + 小动作" | 具体可操作 |
| 11 | 进入"题目汇总"页 | 能看到刚拍的题 | 列表中有新题 |

**验收记录**：记录每步通过/失败，拍照截图存档。

### 4.10 任务 10：语音验收（单独执行）

> ⚠️ **本轮 Go 只覆盖 image-only。语音质量需上线后单独验收。**

详见 §7 语音验收特别说明。

### 4.11 任务 11：Git 收口

```bash
git checkout dev
git add Dockerfile docker-entrypoint.sh .env.test.example doc/plan/stage3-deploy-plan.md doc/active_spec.md
git commit -m "docs stage3-deploy r2: 补 seed 自动化 + migration 验证步骤"
git push origin dev
```

---

## 5. 失败回滚方案

### 5.1 部署失败（容器启动异常）

```bash
# 1. 查看日志（重点看 entrypoint 中 seed 报错）
docker logs --tail 120 wrong-notebook

# 2. 如果是 .env 配置问题，修复 .env 后重启
docker compose -f docker-compose.prod.yml restart wrong-notebook

# 3. 如果是代码问题，回滚到上一个镜像
bash backup.sh                                    # 先备份
# 编辑 .env，设置 NANA_IMAGE 为上一个 sha tag
NANA_IMAGE=ghcr.io/jewellury/nanawrongbook:sha-<旧短sha>
docker compose -f docker-compose.prod.yml up -d   # 用旧镜像重启
```

### 5.2 Seed 缺失（TextbookTopic=0 或 KnowledgeNode=0）

**不得开始真机验收。** 按 §4.8.4 补 seed 安全流程执行。

如果补 seed 失败：
1. 回滚镜像到部署前版本
2. 数据库无需回滚（seed 是 upsert，不会损坏数据）
3. 修复 Dockerfile/entrypoint 后重新走 CI → 部署流程

### 5.3 AI 功能异常（API 不通 / 超时 / 返回垃圾）

**不影响现有功能**。AI 整理是异步的，失败时：
- 前端显示"AI 整理失败，可重试"
- 不影响题目保存、汇总页、知识地图等现有功能
- 用户可重新触发整理

**排查**：
```bash
docker logs --tail 80 wrong-notebook 2>&1 | grep -i "case.analyzer\|volcengine\|error"
```

**临时降级**：如果持续失败，可在服务器 .env 中注释掉 VOLCENGINE_API_KEY，case-analyzer 会 throw CaseAnalyzerError，前端走"整理失败"路径。

### 5.4 数据库回滚

```bash
# 查看备份
ls -lh /opt/nana/backups/

# 恢复
cp /opt/nana/backups/prod-<timestamp>.db /opt/nana/data/dev.db
docker compose -f docker-compose.prod.yml restart wrong-notebook
```

### 5.5 完全回滚（回到部署前状态）

1. 回滚镜像：设置 `NANA_IMAGE` 为部署前的 sha tag
2. 回滚数据库：用部署前的备份恢复
3. 移除 VOLCENGINE 变量：编辑 .env 删除 VOLCENGINE 行
4. 重启容器

---

## 6. 安全约束

### 6.1 密钥安全

- VOLCENGINE_API_KEY 只放服务器 `/opt/nana/.env`，不入 git
- `.env.test.example` 只放占位值 `test-placeholder`
- 不在 commit message、日志、文档中出现真实 Key
- 部署后 `grep VOLCENGINE /opt/nana/.env` 确认存在，不回显完整 Key

### 6.2 不改生产业务代码

本轮不修改 `case-analyzer.ts`、`/process` API、采集页等任何生产业务代码。
修改范围仅限：Dockerfile（预编译 seed）、docker-entrypoint.sh（运行 seed）、.env.test.example（占位）。

### 6.3 备份铁律

部署前 `scripts/deploy.sh` 自动执行 `backup.sh`，备份失败不继续。

### 6.4 Seed 验证铁律（r2 新增）

**部署后、真机验收前，必须执行 §4.8 Migration + Seed 只读验证。任何一项不通过，不得开始真机验收。**

---

## 7. 语音验收特别说明

### 当前状态

- **Provider smoke 只验证了 image-only**：3 张 fixture 图片全部成功，质量可接受
- **语音转写完全未测**：case-analyzer 支持音频输入（wav/mp3/flac/ogg/m4a/aac），但 smoke 脚本没有音频输入
- **webm 降级已知**：Round 0 预验证确认豆包 Lite 不支持 webm/mp4，case-analyzer 会降级为 skipped

### 上线后语音验收计划

1. **第一轮**：用手机录一段 wav 格式口述（如"这道题我先用定义法判断单调性"），拍题 + 录音同时上传，看 transcript 质量
2. **第二轮**：用手机录 webm 格式（浏览器默认），确认降级为 skipped，不报错
3. **第三轮**：不录音只拍题，确认 image-only 路径与 smoke 结果一致

### 如果语音质量不达标

- image-only 功能继续可用（已验证）
- 评估是否需要：
  - 前端增加录音格式提示（"请使用 wav 格式"）
  - 或增加 webm→wav 前端转码
  - 或更换支持 webm 的模型

---

## 8. 验收标准

| # | 验收项 | 验证方式 | 严重度 |
|---|--------|----------|--------|
| 1 | Dockerfile 预编译 seed 脚本成功 | 本地 tsc 编译验证 | 🔴 |
| 2 | .env.test.example 包含 VOLCENGINE 占位 | 文件检查 | 🟡 |
| 3 | 本地 npm.cmd run build 通过 | 命令退出码 0 | 🟡 |
| 4 | CI 绿色（build + test container + push GHCR） | GitHub Actions 页面 | 🔴 |
| 5 | 服务器 .env 包含 4 个 VOLCENGINE 变量 | grep 确认 | 🟡 |
| 6 | 服务器容器正常运行 | docker ps 确认 | 🔴 |
| 7 | **Stage 3 migration 已应用** | sqlite3 查 _prisma_migrations | 🔴 |
| 8 | **TextbookTopic = 16** | sqlite3 COUNT | 🔴 |
| 9 | **TextbookNodeMapping = 48** | sqlite3 COUNT | 🔴 |
| 10 | **KnowledgeNode ≥ 48** | sqlite3 COUNT | 🔴 |
| 11 | **KnowledgeEdge ≥ 36** | sqlite3 COUNT | 🔴 |
| 12 | CaseAiResult 表存在 | sqlite3 COUNT | 🔴 |
| 13 | CaseTextbookTopicTag 表存在 | sqlite3 COUNT | 🔴 |
| 14 | 手机能访问 nana.nanatop.xyz/nana | 浏览器 | 🟡 |
| 15 | 拍题后 AI 结果卡出现（30-40 秒内） | 真机操作 | 🟡 |
| 16 | 结果卡内容合理（摘要/分类/反馈） | 人工审阅 | 🟡 |
| 17 | 题目汇总页能看到新题 | 列表检查 | 🟡 |

**🔴 项全部通过才可继续。🟡 项不通过不阻塞部署，但需记录。**

---

## 9. 执行顺序

```
本地                            GitHub Actions              服务器
─────                           ──────────────              ──────
[1] 修复 Dockerfile + entrypoint
    (预编译 seed_textbook_topics
     + seed_graph → entrypoint 运行)
[2] 补 .env.test.example
[3] npm.cmd run build
[4] dev 合 main → push ────────→ [5] CI 自动构建+测试+推镜像
                                ────────────────────────→  [6] SSH 追加 .env 变量
                                                           [7] bash scripts/deploy.sh
                                                              ├─ git pull
                                                              ├─ backup.sh
                                                              ├─ docker compose pull
                                                              └─ docker compose up -d
                                                                  └─ entrypoint 自动跑:
                                                                     ├─ prisma migrate deploy
                                                                     ├─ seed_textbook_topics.js
                                                                     ├─ seed_graph.js
                                                                     └─ seed-admin.js
                                                           [8] Migration + Seed 只读验证 🔴
                                                              ├─ _prisma_migrations 含 stage3
                                                              ├─ TextbookTopic = 16
                                                              ├─ TextbookNodeMapping = 48
                                                              ├─ KnowledgeNode ≥ 48
                                                              ├─ KnowledgeEdge ≥ 36
                                                              ├─ CaseAiResult 表存在
                                                              └─ CaseTextbookTopicTag 表存在
                                                           [9] 真机验收（image-only）
                                                           [10] 语音验收（单独）
[11] Git 收口
```

---

## 10. 用户验收提醒

### 10.1 部署前确认

- CI 已绿色（GitHub Actions 页面确认）
- 本地 git status 干净
- 服务器 SSH 可连接
- Dockerfile/entrypoint 修改已包含在 push 的 commit 中

### 10.2 部署中监控

- deploy.sh 输出无 ❌
- 容器启动后 `docker logs wrong-notebook` 查看 entrypoint 日志：
  - `[Entrypoint] Migrations completed successfully.`
  - `[Entrypoint] TextbookTopic seed completed.`
  - `[Entrypoint] KnowledgeGraph seed completed.`
- 如果 seed 日志显示 failed，立即按 §4.8.4 补 seed

### 10.3 部署后验证（🔴 不可跳过）

```bash
# 一次性验证脚本
echo "=== Migration + Seed 验证 ==="
echo "TextbookTopic: $(sqlite3 /opt/nana/data/dev.db 'SELECT COUNT(*) FROM TextbookTopic;')"
echo "TextbookNodeMapping: $(sqlite3 /opt/nana/data/dev.db 'SELECT COUNT(*) FROM TextbookNodeMapping;')"
echo "KnowledgeNode: $(sqlite3 /opt/nana/data/dev.db 'SELECT COUNT(*) FROM KnowledgeNode;')"
echo "KnowledgeEdge: $(sqlite3 /opt/nana/data/dev.db 'SELECT COUNT(*) FROM KnowledgeEdge;')"
echo "CaseAiResult: $(sqlite3 /opt/nana/data/dev.db 'SELECT COUNT(*) FROM CaseAiResult;')"
echo "CaseTextbookTopicTag: $(sqlite3 /opt/nana/data/dev.db 'SELECT COUNT(*) FROM CaseTextbookTopicTag;')"
```

期望输出：`16 / 48 / 48+ / 36+ / 0 / 0`。任何一项为 0（除最后两个）→ 立即按 §4.8.4 补 seed。

### 10.4 诚实报告

- 如果 AI 整理超时（>60 秒），如实记录
- 如果结果卡内容质量差，如实记录并评估是否回滚
- 如果 seed 行数不正确，如实记录并按补 seed 流程处理
- 如果语音转写质量差，记录但不阻塞 image-only 使用
- 执行日志必须记录：migration 状态、seed 行数、备份路径
