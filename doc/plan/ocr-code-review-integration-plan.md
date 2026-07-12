# OCR (Open Code Review) GitHub Actions 集成 · 开发计划

> 关联规格: 无（新工具集成，非功能开发）
> 计划日期: 2026-07-07
> 预计影响: `.github/workflows/ai-code-review.yml`（新增）、`.opencodereview/rule.json`（新增，可选）

---

## 0. 前置约束（必须遵守）

- **不改源码**：本轮不修改 `src/`、`prisma/`、`lib/` 中任何文件
- **不改数据库**：不涉及 Prisma schema / migration
- **不影响现有 CI**：新增独立 workflow，不修改 `ci.yml`、`build-and-push.yml` 等现有文件
- **密钥不入 git**（铁律 4）：LLM API Key 只放 GitHub Secrets，不写入代码或文档
- **不阻塞 PR 合并**：初期 OCR review 失败不阻断现有 CI 流水线（`continue-on-error: true`）

---

## 1. 大白话概述

每次往 GitHub 提交 Pull Request 时，自动有一个 AI 帮你把这次改动的代码审查一遍，审查意见直接发到 PR 的评论区里。这个 AI 不是简单地把代码丢给大模型聊天，而是专门做代码审查的工具——它会看完整文件、搜索代码库找关联、检查改了的地方会不会影响别处，然后给出带行号的意见。

**为什么要做**：项目已经进入正常开发迭代，代码改动越来越频繁。三代理框架里的 audit-agent 是"只指出不修改"的角色，OCR 的理念完全一致——自动审查、给建议、不改代码。接入后每个 PR 自动获得一轮 AI 审查，减少人工遗漏，和现有的人工 /execute → /audit 流程互补。

**用什么工具**：阿里开源的 Open Code Review（简称 OCR），Go 写的 CLI 工具，Apache-2.0 许可证。在阿里内部服务数万开发者两年后开源，基准测试显示比通用 Agent 省 9 倍 token、误报更少。

---

## 2. 待决策项（需用户确认后再进 /execute）

### 决策 1：LLM 后端选哪个？

OCR 需要一个 LLM 来做审查。项目现有的 LLM 配置情况：

| 选项 | 说明 | 成本 | OCR 支持度 | 推荐 |
|------|------|------|-----------|------|
| **A. DeepSeek** | 项目提到"开发 AI 用 DeepSeek"；OCR 内置 `deepseek` 供应商 | 极低（DeepSeek 价格便宜） | ✅ 原生内置 | ⭐ 推荐 |
| **B. 火山引擎豆包** | 项目已有 `VOLCENGINE_API_KEY`；通过自定义供应商（OpenAI 兼容协议）接入 | 低 | ✅ 自定义供应商 | 可选 |
| **C. OpenAI / Anthropic** | OCR 原生支持，但项目未配置相关 Key | 较高 | ✅ 原生内置 | 不推荐（成本高） |

> **需要你确认**：用哪个？是否有对应的 API Key 可以放进 GitHub Secrets？

### 决策 2：审查意见发到哪？

| 选项 | 说明 | 复杂度 | 推荐 |
|------|------|--------|------|
| **A. 直接发 PR comment** | OCR 输出 text → 用 `gh pr comment` 发到 PR 评论区 | 低 | ⭐ 推荐 |
| **B. 只输出到 Actions 日志** | 审查结果只在 GitHub Actions 运行日志里看 | 最低 | 备选（验证期） |
| **C. 解析 JSON 后发结构化 comment** | OCR 输出 JSON → 脚本解析 → 带行号发 review comment | 中 | 未来增强 |

> **建议**：先用 A（直接发 PR comment），验证效果后再考虑升级到 C。

---

## 3. 任务分解

- [ ] 任务 1：配置 GitHub Secrets（人工操作，在 GitHub 仓库 Settings 中完成）
- [ ] 任务 2：新建 workflow 文件 `.github/workflows/ai-code-review.yml`（涉及文件: 新增）
- [ ] 任务 3：（可选）新建项目级审查规则 `.opencodereview/rule.json`（涉及文件: 新增）
- [ ] 任务 4：验证——发一个测试 PR，确认 OCR 正常运行且 comment 正常发布
- [ ] 任务 5：写执行日志 `doc/executionlog/ocr-code-review-integration-log.md`

---

## 4. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `.github/workflows/ai-code-review.yml` | 新增 | OCR AI 代码审查 workflow，PR 触发 |
| `.opencodereview/rule.json` | 新增（可选） | 项目级审查规则，可提交到 git 与团队共享 |
| `doc/executionlog/ocr-code-review-integration-log.md` | 新增 | 执行日志 |

> **不修改的文件**：`ci.yml`、`build-and-push.yml`、`smoke-test.yml`、`release.yml`、`build-docker.yml` 以及 `src/`、`prisma/`、`lib/` 下所有文件。

---

## 5. 详细设计

### 5.1 workflow 触发条件

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    # 所有分支的 PR 都触发，不限 main
```

> 与现有 `ci.yml`（push main / PR main）互不干扰。OCR review 作为独立 workflow 并行运行。

### 5.2 workflow 整体结构

```
PR 触发
  → checkout（fetch-depth: 0，OCR 需要完整 git 历史做 diff）
  → setup node 22
  → npm install -g @alibaba-group/open-code-review
  → 配置 LLM 环境变量（从 GitHub Secrets 读取）
  → fetch origin main（作为 diff 基准）
  → ocr review --from origin/main --to origin/<PR分支> --format text
  → 将审查结果发布为 PR comment（gh pr comment）
  → continue-on-error: true（审查失败不阻塞 PR）
```

### 5.3 权限需求

```yaml
permissions:
  contents: read        # 读代码
  pull-requests: write  # 发 PR comment
```

### 5.4 GitHub Secrets 清单

| Secret 名 | 用途 | 示例值 |
|-----------|------|--------|
| `OCR_LLM_TOKEN` | LLM API Key | （你的 DeepSeek / 豆包 API Key） |
| `OCR_LLM_URL` | LLM API 端点（如选 DeepSeek） | `https://api.deepseek.com/v1/chat/completions` |
| `OCR_LLM_MODEL` | 模型名称 | `deepseek-chat` |

> 如果选豆包方案，Secret 值不同，详见技术附录。

### 5.5 审查范围过滤

用 `--exclude` 排除不需要审查的目录：

```
--exclude "node_modules/**,.next/**,data/**,playwright-report/**,test-results/**,study/**"
```

### 5.6 项目级规则（可选，任务 3）

`.opencodereview/rule.json` 可定制项目特定审查规则，例如：

- 检查是否误改了上游 Prisma model（铁律 3）
- 检查新增 model 是否以追加挂接方式（不改原有 model 字段）
- 检查密钥是否硬编码到源码（铁律 4）

> **建议**：初期不配规则，先用 OCR 默认规则验证效果。确认稳定后再加项目级规则。

---

## 6. 验收标准

- [ ] 在 GitHub 仓库提交一个测试 PR（改几行代码），触发 `AI Code Review` workflow
- [ ] workflow 运行成功（绿色 ✅），不报错
- [ ] PR 评论区出现一条 AI 审查 comment，包含审查意见
- [ ] 现有 `CI` workflow 不受影响，照常运行
- [ ] 如果 workflow 失败，PR 仍可正常合并（`continue-on-error` 生效）
- [ ] 审查 comment 内容合理——能指出改动中的实际问题或建议，不是泛泛而谈

---

## 7. 风险与注意事项

| 风险 | 说明 | 应对 |
|------|------|------|
| **LLM API 不稳定** | DeepSeek/豆包 API 偶尔超时或限流 | `continue-on-error: true`，失败不阻塞；设 `--timeout 10` |
| **大 PR 审查慢** | 变更文件多时审查耗时长 | OCR 默认并发 8 文件；可调 `--concurrency` 和 `--timeout` |
| **OCR 项目较新** | 2026 年开源，社区生态仍在成长 | 阿里内部两年数万开发者验证背书；Apache-2.0 可自托管二进制 |
| **审查意见质量波动** | AI 审查偶尔误报 | 初期作为参考性建议，不作为合并门禁；积累经验后调规则 |
| **Secrets 配置错误** | API Key 填错导致审查失败 | workflow 第一步加 `ocr llm test` 验证连通性 |
| **审查范围过大** | 不加过滤会审 node_modules 等 | 用 `--exclude` 排除无关目录 |

---

## 8. 技术附录

### 8.1 workflow yml 草稿（决策 1 选 DeepSeek 方案）

```yaml
name: AI Code Review (OCR)

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    continue-on-error: true
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # OCR 需要完整 git 历史做 diff

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install Open Code Review
        run: npm install -g @alibaba-group/open-code-review

      - name: Configure & Test LLM
        env:
          OCR_LLM_URL: ${{ secrets.OCR_LLM_URL }}
          OCR_LLM_TOKEN: ${{ secrets.OCR_LLM_TOKEN }}
          OCR_LLM_MODEL: ${{ secrets.OCR_LLM_MODEL }}
          OCR_USE_ANTHROPIC: 'false'
        run: ocr llm test

      - name: Fetch base branch
        run: git fetch origin main:refs/remotes/origin/main

      - name: Run AI Code Review
        env:
          OCR_LLM_URL: ${{ secrets.OCR_LLM_URL }}
          OCR_LLM_TOKEN: ${{ secrets.OCR_LLM_TOKEN }}
          OCR_LLM_MODEL: ${{ secrets.OCR_LLM_MODEL }}
          OCR_USE_ANTHROPIC: 'false'
        run: |
          ocr review \
            --from "origin/main" \
            --to "origin/${{ github.head_ref }}" \
            --format text \
            --exclude "node_modules/**,.next/**,data/**,playwright-report/**,test-results/**,study/**" \
            --audience human \
            > review-output.txt 2>&1
          cat review-output.txt

      - name: Post review as PR comment
        if: always()
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          if [ -s review-output.txt ]; then
            gh pr comment ${{ github.event.pull_request.number }} \
              --body-file review-output.txt \
              --repo ${{ github.repository }}
          fi
```

### 8.2 豆包方案的环境变量（决策 1 选豆包时替换）

如果选火山引擎豆包（OpenAI 兼容协议），环境变量改为：

```yaml
env:
  OCR_LLM_URL: "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
  OCR_LLM_TOKEN: ${{ secrets.VOLCENGINE_API_KEY }}
  OCR_LLM_MODEL: "doubao-seed-2-0-lite-260215"
  OCR_USE_ANTHROPIC: 'false'
```

> 复用项目已有的 `VOLCENGINE_API_KEY`，只需在 GitHub Secrets 中加一个即可。

### 8.3 OCR 关键参数速查

| 参数 | 默认 | 说明 |
|------|------|------|
| `--from` | — | diff 基准分支（如 `origin/main`） |
| `--to` | — | diff 目标分支（如 PR 分支） |
| `--format` | text | 输出格式：`text`（人类可读）或 `json`（机器可读） |
| `--audience` | human | `human`（显示进度）或 `agent`（仅摘要） |
| `--exclude` | — | gitignore 风格排除模式，逗号分隔 |
| `--concurrency` | 8 | 最大并发文件审查数 |
| `--timeout` | 10 | 并发任务超时（分钟） |
| `--preview` | false | 只预览将审查的文件列表，不调 LLM（调试用） |

### 8.4 项目级规则示例（任务 3，可选）

```json
{
  "rules": [
    {
      "path": "prisma/schema.prisma",
      "rule": "检查是否修改了上游 wrong-notebook 已有的 model 字段。所有新功能必须以新增 model 挂接，不改原有 model 的任何字段。如果 diff 显示原有 model 的字段被修改或删除，标记为严重问题。"
    },
    {
      "path": "**/*.ts",
      "rule": "检查是否有 API Key、密码、Token 等敏感信息硬编码到源码中。敏感信息只能放在 .env 文件中。"
    },
    {
      "path": "src/**/*.ts",
      "rule": "检查新增的 API 路由是否有基本的错误处理（try-catch + 返回错误状态码）。"
    }
  ],
  "exclude": [
    "node_modules/**",
    ".next/**",
    "data/**",
    "playwright-report/**",
    "test-results/**",
    "study/**"
  ]
}
```

### 8.5 调试技巧

- **先预览审查范围**：`ocr review --from origin/main --to <分支> --preview`（不调 LLM，只看会审哪些文件）
- **测试 LLM 连通性**：`ocr llm test`
- **查看生效规则**：`ocr rules check src/app/nana/capture/page.tsx`
- **单提交审查**：`ocr review --commit <sha> --format json`

### 8.6 与现有 CI 的关系

| workflow | 触发 | 作用 | 本轮是否改动 |
|----------|------|------|:---:|
| `ci.yml` | push main / PR main | 单元测试 → 集成测试 → 构建 → E2E | ❌ 不改 |
| `build-and-push.yml` | push main | 构建 + 测试容器 + 推 GHCR | ❌ 不改 |
| `smoke-test.yml` | 手动触发 | 生产环境冒烟测试 | ❌ 不改 |
| `release.yml` | tag push | 发布 Release | ❌ 不改 |
| `build-docker.yml` | — | Docker 构建 | ❌ 不改 |
| **`ai-code-review.yml`** | **PR（所有分支）** | **AI 代码审查** | **✅ 新增** |

---

## 9. 与项目规范的对齐

| 项目规范 | 对齐情况 |
|---------|---------|
| 铁律 1（破坏性操作须确认） | ✅ 不涉及数据库/文件删除 |
| 铁律 3（不改上游表结构） | ✅ 不涉及 Prisma；规则文件可检查此项 |
| 铁律 4（密钥不入 git） | ✅ API Key 放 GitHub Secrets |
| 铁律 5（遇错停下来） | ✅ `continue-on-error` 仅指审查失败不阻塞 PR；workflow 自身报错会显示 |
| 铁律 6（显式失败不掩盖） | ✅ workflow 失败会在 Actions 面板显示红色 |
| 三代理框架（audit-agent 只指出不修改） | ✅ OCR 理念一致：只审查不改代码 |
| CI 测试容器门禁（GitHub Actions 执行） | ✅ 不影响现有测试容器门禁 |
