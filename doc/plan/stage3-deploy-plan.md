# Stage 3 生产接入部署计划

> 计划者：plan-agent
> 日期：2026-07-07
> 前置：Provider Smoke Conditional Go 已确认（2026-07-06）
> 预计影响：服务器 .env（新增 4 个环境变量）、.env.test.example（补占位）、doc/active_spec.md

---

## 0. 特别声明

**本轮 Go 只覆盖 image-only 场景。** Provider smoke 验证了豆包 Lite 对图片的识别、分类和反馈质量，但语音转写（transcript）质量完全未测。上线后需单独安排语音验收（§6）。

**本轮不新增功能。** 只做生产接入：配置环境变量、走部署流程、真机验收。

---

## 1. 大白话概述

Smoke 证明豆包 Lite 对图片的反馈质量可以给孩子看。现在要把 AI 整理功能从"只在本地能跑"变成"外甥女在手机上也能用"。要做的事：把 VOLCENGINE 的 4 个环境变量加到服务器 .env 里，dev 合 main，CI 构建镜像，服务器拉镜像重启，然后用测试账号在手机上拍一道题，看看能不能出 AI 结果卡。

---

## 2. 现状盘点

### 2.1 已就绪

| 组件 | 状态 | 说明 |
|------|------|------|
| 代码 | ✅ dev 分支已就绪 | Round 0-4 + Hotfix 全部完成 |
| Provider Smoke | ✅ Conditional Go | 3/3 图片成功，0 幻觉，0 真实越界 |
| CI workflow | ✅ build-and-push.yml | push main → build + test container + push GHCR |
| 生产 compose | ✅ docker-compose.prod.yml | image 方式，env_file: .env |
| 一键部署脚本 | ✅ scripts/deploy.sh | 分支检查 → pull → 备份 → 拉镜像 → 重启 → 健康检查 |
| 备份脚本 | ✅ backup.sh | sqlite3 .backup，每日 crontab 2:00 |
| HTTPS | ✅ Caddy 反代 | nana.nanatop.xyz → wrong-notebook:3000 |
| 图谱种子 | ✅ 已修复（2026-07-02 事故后） | 48 节点已在生产库 |

### 2.2 缺口（本轮要做的）

| 缺口 | 处理方式 |
|------|----------|
| 服务器 .env 缺 VOLCENGINE 变量 | SSH 到服务器手动追加 |
| .env.test.example 缺 VOLCENGINE 占位 | 本地修改，CI 测试容器需要 |
| dev 未合 main | git checkout main && git merge dev |
| 真机验收未执行 | 部署后用测试账号验收 |
| 语音质量未验证 | 上线后单独验收（§6） |

---

## 3. 任务分解

| # | 任务 | 在哪做 | 改什么 |
|---|------|--------|--------|
| 1 | 补 .env.test.example 占位 | 本地 | 追加 VOLCENGINE_* 占位值 |
| 2 | 本地构建验证 | 本地 | npm.cmd run build |
| 3 | dev 合 main | 本地 | git checkout main && git merge dev && git push origin main |
| 4 | CI 门禁 | GitHub Actions | 自动触发：build + test container + push GHCR |
| 5 | 服务器 .env 追加变量 | 服务器 | SSH 手动追加 4 个 VOLCENGINE 变量 |
| 6 | 服务器部署 | 服务器 | bash scripts/deploy.sh |
| 7 | 真机验收 | 手机 | 测试账号登录 → 拍题 → 等 AI → 看结果卡 |
| 8 | 语音验收 | 手机 | 拍题 + 录音 → 看 transcript 质量 |
| 9 | Git 收口 | 本地 | 提交 .env.test.example + active_spec 更新 |

---

## 4. 详细设计

### 4.1 任务 1：补 .env.test.example

CI 测试容器使用 `.env.test.example` 复制成 `.env.test`。测试代码中 mock 了 case-analyzer，不需要真实 API Key，但需要占位值防止 import 时报错。

在 `.env.test.example` 末尾追加：

```
# ========== Stage 3 AI（占位，测试 mock 不调真实 API）==========
VOLCENGINE_API_KEY="test-placeholder"
VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
LITE_ENDPOINT_ID="test-placeholder"
LITE_MODEL_NAME="doubao-seed-2-0-lite-260215"
```

### 4.2 任务 2：本地构建验证

```bash
npm.cmd run build
```

确认构建通过后再合 main。

### 4.3 任务 3：dev 合 main

```bash
git checkout dev
git status                          # 确认工作区干净
git checkout main
git merge dev
git push origin main                # 触发 CI
```

### 4.4 任务 4：CI 门禁

CI workflow（`.github/workflows/build-and-push.yml`）在 push main 时自动执行：

1. `npm ci` — 安装依赖
2. `npx prisma generate` — 生成 Prisma Client
3. `npm run build` — 构建验证
4. `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` — 测试容器门禁
5. `docker compose -f docker-compose.test.yml down -v` — 清理
6. `docker build` + push GHCR（三个 tag：sha-、时间戳、latest）

**门禁规则**：CI 失败 → 不得部署。修复必须回本地改代码。

**监控方式**：访问 https://github.com/Jewellury/NanaWrongBook/actions 确认 CI 绿色。

### 4.5 任务 5：服务器 .env 追加变量

SSH 到服务器，手动追加 4 个环境变量：

```bash
ssh root@119.28.42.208
cd /opt/nana

# 追加 VOLCENGINE 变量（不覆盖已有内容）
cat >> /opt/nana/.env << 'EOF'

# Stage 3: Nana AI 整理（豆包 Lite 一体化）
VOLCENGINE_API_KEY="ark-f0265617-c9c6-41a1-a6de-94d4fd7ac0e5-596a9"
VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
LITE_ENDPOINT_ID="ep-20260619160218-5m76d"
LITE_MODEL_NAME="doubao-seed-2-0-lite-260215"
CASE_ANALYZER_TIMEOUT_MS="60000"
EOF

# 验证
grep VOLCENGINE /opt/nana/.env
```

**安全**：
- 密钥只在服务器 .env 中，不入 git
- 操作时不回显完整 Key（用 grep 确认存在即可）
- 如果 Key 需要更换，直接编辑 .env 对应行

### 4.6 任务 6：服务器部署

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
5. docker compose up -d（重启容器）
6. 健康检查 + 输出部署报告

### 4.7 任务 7：真机验收（Image-only）

**验收人**：用户（或外甥女）

**前置**：测试账号已注册（或用现有账号）

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

### 4.8 任务 8：语音验收（单独执行）

> ⚠️ **本轮 Go 只覆盖 image-only。语音质量需上线后单独验收。**

**验收步骤**：

| # | 操作 | 预期结果 | 通过标准 |
|---|------|----------|----------|
| 1 | 拍题时同时录音（wav 格式） | 保存成功 | 图片+音频都上传 |
| 2 | 等待 AI 整理 | 结果卡 transcript 非空 | transcript 有内容 |
| 3 | 查看 transcript | 口语化转写，保留"嗯/然后" | 转写内容与口述匹配 |
| 4 | 拍题时录 webm 格式 | audioStatus=skipped | 降级正确，不报错 |

**如果语音质量不达标**：
- 不影响 image-only 功能继续使用
- 评估是否需要调整音频格式支持（如增加 webm→wav 转码）
- 或在 UI 中明确提示"仅支持 wav/mp3 格式录音"

### 4.9 任务 9：Git 收口

```bash
git checkout dev
git add .env.test.example doc/plan/stage3-deploy-plan.md doc/active_spec.md
git commit -m "docs stage3-deploy: 生产接入部署计划 + .env.test.example 补 VOLCENGINE 占位"
git push origin dev
```

---

## 5. 失败回滚方案

### 5.1 部署失败（容器启动异常）

```bash
# 1. 查看日志
docker logs --tail 120 wrong-notebook

# 2. 如果是 .env 配置问题，修复 .env 后重启
docker compose -f docker-compose.prod.yml restart wrong-notebook

# 3. 如果是代码问题，回滚到上一个镜像
bash backup.sh                                    # 先备份
# 编辑 .env，设置 NANA_IMAGE 为上一个 sha tag
NANA_IMAGE=ghcr.io/jewellury/nanawrongbook:sha-<旧短sha>
docker compose -f docker-compose.prod.yml up -d   # 用旧镜像重启
```

### 5.2 AI 功能异常（API 不通 / 超时 / 返回垃圾）

**不影响现有功能**。AI 整理是异步的，失败时：
- 前端显示"AI 整理失败，可重试"
- 不影响题目保存、汇总页、知识地图等现有功能
- 用户可重新触发整理

**排查**：
```bash
docker logs --tail 80 wrong-notebook 2>&1 | grep -i "case.analyzer\|volcengine\|error"
```

**临时降级**：如果持续失败，可在服务器 .env 中注释掉 VOLCENGINE_API_KEY，case-analyzer 会 throw CaseAnalyzerError，前端走"整理失败"路径。

### 5.3 数据库回滚

```bash
# 查看备份
ls -lh /opt/nana/backups/

# 恢复
cp /opt/nana/backups/prod-<timestamp>.db /opt/nana/data/dev.db
docker compose -f docker-compose.prod.yml restart wrong-notebook
```

### 5.4 完全回滚（回到部署前状态）

1. 回滚镜像：设置 `NANA_IMAGE` 为部署前的 sha tag
2. 回滚数据库：用部署前的备份恢复
3. 移除 VOLCENGINE 变量：编辑 .env 删除 VOLCENGINE 行
4. 重启容器

---

## 6. 语音验收特别说明

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

## 7. 安全约束

### 7.1 密钥安全

- VOLCENGINE_API_KEY 只放服务器 `/opt/nana/.env`，不入 git
- `.env.test.example` 只放占位值 `test-placeholder`
- 不在 commit message、日志、文档中出现真实 Key
- 部署后 `grep VOLCENGINE /opt/nana/.env` 确认存在，不回显完整 Key

### 7.2 不改生产代码

本轮不修改 `case-analyzer.ts`、`/process` API、采集页等任何生产代码。

### 7.3 备份铁律

部署前 `scripts/deploy.sh` 自动执行 `backup.sh`，备份失败不继续。

---

## 8. 验收标准

| # | 验收项 | 验证方式 |
|---|--------|----------|
| 1 | .env.test.example 包含 VOLCENGINE 占位 | 文件检查 |
| 2 | 本地 npm.cmd run build 通过 | 命令退出码 0 |
| 3 | CI 绿色（build + test container + push GHCR） | GitHub Actions 页面 |
| 4 | 服务器 .env 包含 4 个 VOLCENGINE 变量 | grep 确认 |
| 5 | 服务器容器正常运行 | docker ps 确认 |
| 6 | 手机能访问 nana.nanatop.xyz/nana | 浏览器 |
| 7 | 拍题后 AI 结果卡出现（30-40 秒内） | 真机操作 |
| 8 | 结果卡内容合理（摘要/分类/反馈） | 人工审阅 |
| 9 | 题目汇总页能看到新题 | 列表检查 |
| 10 | 图谱 smoke check：KnowledgeNode ≥ 48 | sqlite3 查询 |

---

## 9. 执行顺序

```
本地                          GitHub Actions              服务器
─────                         ──────────────              ──────
[1] 补 .env.test.example
[2] npm.cmd run build
[3] dev 合 main → push ──────→ [4] CI 自动构建+测试+推镜像
                              ────────────────────────→  [5] SSH 追加 .env 变量
                                                         [6] bash scripts/deploy.sh
                                                            ├─ git pull
                                                            ├─ backup.sh
                                                            ├─ docker compose pull
                                                            └─ docker compose up -d
                                                         [7] 真机验收（image-only）
                                                         [8] 语音验收（单独）
[9] Git 收口（提交文档）
```

---

## 10. 用户验收提醒

### 10.1 部署前确认

- CI 已绿色（GitHub Actions 页面确认）
- 本地 git status 干净
- 服务器 SSH 可连接

### 10.2 部署中监控

- deploy.sh 输出无 ❌
- 容器启动后 docker logs 无 ERROR
- 图谱 smoke check：`sqlite3 /opt/nana/data/dev.db "SELECT COUNT(*) FROM KnowledgeNode;"` ≥ 48

### 10.3 部署后验收

- 真机拍题能出 AI 结果卡
- 结果卡内容值得给孩子看
- 语音验收单独执行，不阻塞 image-only 上线

### 10.4 诚实报告

- 如果 AI 整理超时（>60 秒），如实记录
- 如果结果卡内容质量差，如实记录并评估是否回滚
- 如果语音转写质量差，记录但不阻塞 image-only 使用
