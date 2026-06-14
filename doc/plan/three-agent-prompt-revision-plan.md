# 三代理 command 文件修订建议 · 提案

> 性质：流程改进提案（改的是 `.claude/commands/*.md` 这套核心机器 + 两处结构性代码护栏）。
> 评审人：外部参谋长。落地方式：本提案当 `/plan`，用户确认后由项目 AI 走 `/execute → /audit`，command 改动与代码护栏同一轮提交，全程可 `git revert`。
> 触发来源：M2 生产库污染事故复盘（doc/reference/M2-prod-contamination-postmortem.md）+ 用户希望引入 TDD / 技能规范化。

---

## 0. 已具备、不要重复加（先对账）

`execute.md` 在事故修复时已补入以下，**保留不动**：
- 完成状态 checklist：`test:all` 经 compose 跑、退出码 0、确认安全路径（`./data/test/test.db` 更新、`./data/dev.db` 未动）。
- 工作流 #4：测试只走测试容器，`docker exec wrong-notebook npx vitest` 明令禁止，测试容器坏了就修、不退而用 prod。
- 工作流 #5：新增 `test:*` 脚本要同步 `test:all`。

本提案只补**真正的缺口**，并把其中靠人自觉的部分换成结构性拦截。

---

## 1. 最高优先：两处结构性护栏（代码，胜过任何 checklist）

事故的根因是两类"靠人记"：①测试可能连到生产库；②静态测试清单会漏更新。下面两招从结构上让这两类事故**不可能再发生**，比在提示词里加多少条都管用。

### 1A. DB 护栏断言——测试禁止连生产库
新增 `src/__tests__/setup/guard-db.ts`（或并入现有 vitest setup）：

```typescript
// 任何测试启动前执行：DATABASE_URL 指向生产库就直接崩，拒绝运行
const url = process.env.DATABASE_URL ?? '';
if (url.includes('dev.db') || !url.includes('test')) {
  throw new Error(
    `🛑 测试禁止连接非测试库。当前 DATABASE_URL="${url}"。` +
    `测试只能写 ./data/test/test.db。`
  );
}
```

在 `vitest.config.ts` 的 `setupFiles` 里挂上它。
**效果**：无论在哪个容器、谁手滑跑了 `docker exec`，只要 DB 不是 test 库，测试**第一秒就崩**，根本写不进生产库。这一条单独就能堵死 M2 那次事故。

### 1B. 测试自动发现——干掉"静态清单漏更新"
事故另一半是 compose 的 command 是**手写的脚本清单**，M2 新增脚本后忘了加。
建议：让 compose 跑**一条会自动发现全部测试**的命令，而不是逐个列：

- `package.json` 把 `test:all` 改成（或新增）`"test:all": "vitest run"`（vitest 默认按 `vitest.config.ts` 的 include 自动跑全部 `*.test.ts`）；
- `docker-compose.test.yml` 的 command 末段改为只调 `npm run test:all`，不再逐行列 `test:graph:* && test:m2:*`。

**效果**：以后新增任何测试文件，compose **零改动**就会自动跑到。"忘了同步"这个类别从此消失。
（granular 脚本 `test:graph:* / test:m2:*` 保留给本地快测，不影响。）

> 说明：1A/1B 是**小的代码任务**，建议单独成一个 commit，照常走 execute/audit。落地前确认 `.env.test` 的 `DATABASE_URL` 确实是 `file:/app/data/test.db`（已核实）。

---

## 2. `/audit` 补两条检查（提示词真正的缺口）

复盘暴露：审计模板的"测试"节只问"跑没跑过、过没过"，没问"**在哪个库过的**"——正是 27/27 绿了却漏掉污染的那个洞。

在 `audit.md` 的「检查清单」里：

**「测试」节追加：**
```markdown
- [ ] 确认测试在安全路径运行：对照执行日志，最后一次成功的测试是经 docker-compose.test.yml 跑的，写入 ./data/test/test.db，./data/dev.db 未被触碰
- [ ] 本轮新增的测试已被 test:all 自动覆盖（运行 test:all 时能看到新测试执行）
- [ ] DB 护栏断言（src/__tests__/setup/guard-db.ts）存在且生效
```

**「安全性」节追加：**
```markdown
- [ ] 本轮未向生产库 ./data/dev.db 写入任何数据（必要时抽查关键表行数）
```

---

## 3. 选择性 TDD（回应你的需求，保持克制）

不搞"全量 TDD"——schema、样板 CRUD 上强推 TDD 是浪费，劲该留给内容（图谱/配题）。只在**逻辑重**的地方测试先行。

### 3A. `plan.md` —「验收标准」模板加一行注记
```markdown
> 测试策略：逻辑重的模块（状态机、错因归因规则、图遍历、BKT 计算）应在本节标注"测试先行"；
> 纯样板（Prisma schema、直通 CRUD 路由）测试后置即可，不强制 TDD。
```

### 3B. `execute.md` —「工作流」加一步（接在第 1 步后）
```markdown
2. 对计划中标注"测试先行"的任务：先写出会失败的测试 → 再写实现让它转绿 → 重构。
   其余任务可测试后置。无论先后，完成判定都以测试在安全路径上真跑通为准。
```
（原工作流后续步骤顺延编号。）

---

## 4. 关于"在三代理里调用 superpowers 技能"

**不建议**给三个 agent 笼统加"请用 superpowers 技能规范开发"。理由：①技能在子 agent 会话里未必加载得到，硬依赖会时灵时不灵；②"何时调哪个"不明确会降低这套框架最值钱的"可预测、可门禁"；③白吃 context。这次事故也不是技能不足造成的，别用上一道伤口的形状选药。

**若仍想试**：只挑 **1 个**、只在 `/audit` 试、只跑 **M3 一轮**再评估。可在 `audit.md` 工作流加一条**可选**注记（不设硬门禁）：
```markdown
（可选·M3 试用）写报告前，可调用 code-review 技能对 git diff 做一遍补充扫描，
其发现并入「问题清单」，但最终判定仍以本模板的检查清单为准。
```
试完用得顺再考虑标准化；用不顺直接删掉这行即可，零负担。

---

## 5. 落地顺序与回退

| 步 | 动作 | 可回退性 |
|---|------|---------|
| 1 | 用户确认本提案 | — |
| 2 | 代码护栏 1A+1B（单独 commit，走 execute/audit） | `git revert` |
| 3 | 改 plan.md / execute.md / audit.md（同轮提交） | `git revert` |
| 4 | M3 起按新规跑，顺带试 §4 可选技能 | 删注记即可 |

**风险**：command 文件改动不影响任何已交付代码；DB 护栏唯一风险是误伤——只要 `.env.test` 指向 test 库（已核实）就不会误伤。建议护栏落地后，**故意用 dev.db 的 URL 跑一次**，确认它如期崩、报错信息清楚，再收工。
