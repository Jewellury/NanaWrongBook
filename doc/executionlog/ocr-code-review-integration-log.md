# OCR (Open Code Review) GitHub Actions 集成 · 执行日志

> 关联计划: `doc/plan/ocr-code-review-integration-plan.md`
> 执行日期: 2026-07-12
> 执行者: execute-agent (CatPaw)

---

## 1. 任务概述

在 GitHub Actions 中集成阿里开源的 Open Code Review (OCR) 工具，实现每次提 PR 时自动用 AI 审查代码，审查意见直接发到 PR 评论区。

**用户确认的决策**：
- 决策 1：LLM 后端选 **DeepSeek**（原生内置，成本极低）
- 决策 2：审查意见 **直接发 PR comment**（复杂度低，先用这个验证效果）

---

## 2. 执行内容

### 2.1 新增文件

| 文件 | 说明 |
|------|------|
| `.github/workflows/ai-code-review.yml` | OCR AI 代码审查 workflow，PR 触发 |

### 2.2 不修改的文件

- `ci.yml`、`build-and-push.yml`、`build-docker.yml`、`smoke-test.yml`、`release.yml` — 现有 CI workflow 全部不动
- `src/`、`prisma/`、`lib/` 下所有文件 — 零源码改动

### 2.3 未执行的项（可选，后续迭代）

- `.opencodereview/rule.json` 项目级审查规则 — 按计划建议，初期先用 OCR 默认规则验证效果，确认稳定后再加项目级规则

---

## 3. workflow 设计说明

### 触发条件
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
```
所有分支的 PR 都触发，与现有 `ci.yml`（push main / PR main）互不干扰。

### 执行流程
1. Checkout（fetch-depth: 0，OCR 需要完整 git 历史做 diff）
2. Setup Node.js 22
3. 全局安装 `@alibaba-group/open-code-review`
4. `ocr llm test` 验证 LLM 连通性（continue-on-error，失败不阻塞）
5. `git fetch origin main` 获取 diff 基准分支
6. `ocr review --from origin/main --to origin/<PR分支> --format text` 执行审查
7. 审查结果以 `## 🤖 AI Code Review (OCR)` 为标题发到 PR 评论区

### 安全特性
- `continue-on-error: true`（job 级别）— 审查失败不阻塞 PR 合并
- `if: always()`（comment 步骤）— 即使审查步骤失败，仍尝试发布已捕获的输出
- `if [ -s review-output.txt ]` — 输出为空时不发空 comment
- `permissions: contents: read + pull-requests: write` — 最小权限原则

### 排除目录
```
node_modules/**, .next/**, data/**, playwright-report/**, test-results/**, study/**
```

---

## 4. 前置条件（需用户手动完成）

### GitHub Secrets 配置

在 GitHub 仓库 `Settings → Secrets and variables → Actions` 中添加以下 3 个 Secret：

| Secret 名 | 值 | 说明 |
|-----------|-----|------|
| `OCR_LLM_TOKEN` | 你的 DeepSeek API Key | 从 [DeepSeek 平台](https://platform.deepseek.com/) 获取 |
| `OCR_LLM_URL` | `https://api.deepseek.com/v1/chat/completions` | DeepSeek API 端点 |
| `OCR_LLM_MODEL` | `deepseek-chat` | 模型名称 |

> **注意**：Secrets 配置完成后 workflow 才能正常运行。未配置前 PR 会触发 workflow 但 LLM 测试步骤会失败。

---

## 5. 验证步骤

Secrets 配置完成后，按以下步骤验证：

1. 在 GitHub 仓库创建一个测试 PR（改几行代码即可）
2. 确认 `AI Code Review (OCR)` workflow 被触发（Actions 标签页可见）
3. 确认 workflow 运行完成（绿色 ✅ 或黄色 ⚠️，不应是红色 ❌）
4. 确认 PR 评论区出现一条 `## 🤖 AI Code Review (OCR)` 开头的 comment
5. 确认现有 `CI` workflow 不受影响，照常运行
6. 确认 workflow 失败时 PR 仍可正常合并（`continue-on-error` 生效）

---

## 6. 与项目规范对齐

| 规范 | 对齐情况 |
|------|---------|
| 铁律 1（破坏性操作须确认） | ✅ 不涉及数据库/文件删除 |
| 铁律 3（不改上游表结构） | ✅ 不涉及 Prisma |
| 铁律 4（密钥不入 git） | ✅ API Key 放 GitHub Secrets |
| 铁律 5（遇错停下来） | ✅ continue-on-error 仅指审查失败不阻塞 PR |
| 铁律 6（显式失败不掩盖） | ✅ workflow 失败在 Actions 面板显示 |
| 三代理框架（audit-agent 只指出不修改） | ✅ OCR 理念一致 |
| CI 测试容器门禁 | ✅ 不影响现有测试容器门禁 |

---

## 7. 偏离记录

无偏离。完全按计划执行。

唯一调整：PR comment 增加了 `## 🤖 AI Code Review (OCR)` 标题头和工具说明链接，方便区分人工评论和 AI 评论。属于体验优化，不影响功能。

---

## 8. 下一步

- [x] 用户配置 GitHub Secrets（3 个）
- [ ] 发测试 PR 验证 workflow 正常运行
- [ ] 验证通过后考虑添加 `.opencodereview/rule.json` 项目级审查规则

---

## 9. 验证记录

### 2026-07-12 测试 PR 验证

- 测试分支: `test/ocr-review`
- 测试改动: 本文件追加验证记录小节
- 目标: 触发 `AI Code Review (OCR)` workflow，确认 PR 评论区出现 AI 审查意见
