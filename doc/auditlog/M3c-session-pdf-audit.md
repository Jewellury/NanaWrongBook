# M3c 周末编排 + 纸质包 · 审计报告

> 关联计划: doc/plan/M3c-session-pdf-plan.md
> 关联执行日志: doc/executionlog/M3c-session-pdf-log.md
> 审计日期: 2026-06-15
> 审计状态: ✅ 通过

## 一、安全路径验证

| 检查项 | 结果 | 证据 |
|--------|:--:|------|
| `docker compose -f docker-compose.test.yml up --abort-on-container-exit` 退出码 | ✅ 0 | 110/110 tests pass |
| `test.db` 被测试更新 | ✅ | `data/test/test.db` 时间戳 14:57（测试后） |
| `dev.db` 未被触碰 | ✅ | `data/dev.db` 时间戳 10:45（测试前），无 `test-m3c` 字符串 |
| 生产库无测试数据污染 | ✅ | dev.db 中 0 条 test-m3c 记录 |

## 二、偏离复核（5 条，全部确认属微调）

| # | 偏离内容 | 审计判定 | 理由 |
|---|---------|:--:|------|
| 1 | `propagateKSTToUnanswered` 未按主线过滤 | ✅ 微调 | 图谱链自然限定传播范围；参数保留供未来用 |
| 2 | `BKTParams` → `BKTConfig` 轻量化 | ✅ 微调 | 接口更干净，调用方不关心内部 pLearn0 来源 |
| 3 | 独立 `BKTConfig` 替代 bkt.ts 的 BKTParams | ✅ 微调 | 测试不需填假值，语义更准确 |
| 4 | paper-pack 加 `reason` 字段 | ✅ 微调 | 增强（非缩减）功能，打印页可区分措辞 |
| 5 | 不返回 `sessionStep` | ✅ 微调 | 符合工单"不把 8 步全软件化"原则 |

**审计结论：5 条偏离均不影响验收标准、不增删任务、不改变核心逻辑。全部合格。**

## 三、返工追溯

执行过程中出现一次返工：

- **问题**：集成测试 `m3c-flow.test.ts` 最初提交（commit `04fd47d`）包含 4 个空 `test()` 壳（body 为空注释 `// 骨架`），vitest 空 body 自动绿，但实际未验证任何东西
- **发现**：用户审查后指出 "110/110 注水了"，要求用 M2 的 `vi.mock(getServerSession)` 模式补实
- **返工**：commit `d560757` 补写 11 个真实集成测试——7 个端到端 handler 调用（session-items/submit-answers/map/paper-pack + 3 个参数校验）+ 4 个 BKT 公式验证
- **定性**：属执行疏忽（非设计错误），返工后已弥补。**正是三代理闭环要留痕的案例。**

## 四、验收标准核对

| # | 验收标准 | 状态 | 证据 |
|---|---------|:--:|------|
| 1 | POST session-items 返回 boundary 题单，学生视图无 answer | ✅ | 集成测试 1：`expect(item.answer).toBeUndefined()` |
| 2 | POST submit-answers：BKT 从既有先验 + KST 只传播未作答 + StudentNodeState 落库 | ✅ | 集成测试 2：DB 查 `studentNodeState` 验 masteryProb/status |
| 3 | GET paper-pack：frontier+gap，节点 ≤4，题量 ~6-10 | ✅ | 集成测试 4：`toBeLessThanOrEqual(4)` / `toBeLessThanOrEqual(10)` |
| 4 | 打印页：封面+练习区+答案分页+A4 @media print | ✅ | `src/app/diagnosis/paper-pack/page.tsx` 含 page-break-before |
| 5 | 措辞正向：无"错误/答错/gap"负面词 | ✅ | 措辞"这周的练习小纸条✨""咱们练练这个→""给大人的答案页" |
| 6 | test:m3c:unit + test:m3c:integration 全部通过 | ✅ | 24+11=35 新测试全绿 |
| 7 | test:all 退出码 0 | ✅ | 110/110，compose 退出码 0 |
| 8 | 端到端链路：session→题单→答案→地图→纸质包 | ✅ | 集成测试 1-4 顺序执行验证 |

## 五、设计债确认（在册）

| # | 设计债 | 影响 | 计划解决 |
|---|--------|------|---------|
| 1 | **slipFlag "连续两次"需持久化 slip 历史** | 当前 `StudentNodeState.slipFlag` 只有单 boolean，无法追踪历史。首诊不触发此判定，复诊时需 `slipCount` 或 slip 历史数组 | 后续轮次给 `StudentNodeState` 追加 `slipCount Int` 字段 |
| 2 | **`/initial` 一步式建议废弃** | `POST /api/diagnosis/initial`（M3a）与 `POST /api/diagnosis/submit-answers`（M3c）存在两条初诊路径，且 `/initial` 的 KST→BKT 链路仍有双重计数问题（M3c 修正未回植）。长期维护两套会分叉 | `/initial` 加 deprecation 标记，复诊轮次稳定后移除 |

## 六、已知限制（延续 M3a）

- **KST gap 一层传播**：`propagateKSTToUnanswered` 只沿 `dependentsOf()` 传播一层后代，不递归。递归下探 → M4
- **不调 LLM**：本轮无 AI 判分/Newman 追问/解析生成
- **单主线诊断**：沿用决策⑥，不跨主线

## 七、总体评定

| 维度 | 结论 |
|------|------|
| 计划符合度 | ✅ 7/7 任务完成，8/8 验收达标 |
| 安全路径 | ✅ compose 跑，test.db 写，dev.db 未碰 |
| 代码质量 | ✅ 纯逻辑函数 5 个（测试先行）、API 3 个、打印页 1 个，零上游文件修改 |
| 核心修正落地 | ✅ 双重计数修复（`applyBKTToAnswers` 第 101 行 `pLearn0 = existing?.masteryProb ?? 0.5`）|
| BKT 数字正确 | ✅ 集成测试用区间断言、公式现算，无硬编码 |
| 偏离控制 | ✅ 5 条全部微调，无大偏离 |
| 设计债 | ✅ 2 笔在册（slipFlag 持久化、/initial 废弃） |

**审计结论：M3c 通过。可合 main、更新 progress/active_spec。**
