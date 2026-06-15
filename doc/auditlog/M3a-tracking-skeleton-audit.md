# M3a 追踪骨架 · 审计报告

> 关联计划: doc/plan/M3a-tracking-skeleton-plan.md
> 审计日期: 2026-06-15
> 审计基准: commit 014554f

## 审计结论（大白话）

**总体判定：✅ 通过**

M3a 八条决策全部落地——101 道真题入库无碰撞、KST-lite 祖先传播方向正确、BKT 同场不衰减、学习前沿排序截断到位。75 个测试在安全路径上全部通过、退出码 0，dev.db 未被测试触碰。DB 护栏在测试容器启动时生效。

本轮是真无偏离——计划到执行直线落地，两次外部 AI 检查点（种子文件过目、算法复核）都通过了。记一条已知限制：KST-lite gap 只传播一层 dependents，本轮所有 A 层节点都直接作答不影响，留待 M4 探针下探时补递归。

可合入 main，进 M3b 或 M4。

## 检查清单（新审计检查首跑）

### 计划一致性（8 条决策）
- [x] ① 101 道真题替换占位，seed_items_batch1.ts 结构化导入
- [x] ② items Item[] 虚拟关系不生列，migration 纯 CREATE TABLE Item
- [x] ③ KST-lite 简化版——A 层 → boundary 题 → 祖先/后代传播
- [x] ④ BKT 标准参数，T=学习转移 P(T)，同场 crossSessionT=0
- [x] ⑤ 学习前沿 tier→权重排序，截断 1-2
- [x] ⑥ 初诊 API 限单主线
- [x] ⑦ 本轮不自动判分（correct 由调用方给）
- [x] ⑧ 初诊只发 boundary，concept 不进自动判分

### 代码质量
- [x] lib/kst-lite.ts：祖先传播 + 后代 gap + tier 过滤 + 前沿排序
- [x] lib/bkt.ts：标准贝叶斯公式，slipFlag + checkSlipAbuse
- [x] API 路由：入参校验 + 鉴权 + logger
- [x] 测试 75/75：graph 26 + m2 31 + m3 18（6 KST + 12 BKT）
- [x] 集成测试 mock session 打真实 handler

### 安全性
- [x] 无密钥泄露
- [x] 无 SQL 注入风险（全 Prisma ORM）
- [x] 本轮未向生产库写入测试数据——dev.db LastWriteTime 为 10:45（迁移时间），test.db 为 12:36（测试时间），间隔 2 小时 ✅
- [x] DB 护栏断言存在且生效——guard-db.ts 在 setupFiles 首位

### 偏离复核
**无偏离**——本轮从计划到执行直线落地。计划 8 条决策、7 个 commit 全部按编号完成，无中途修改。

### 上游兼容性
- [x] 未修改 wrong-notebook 已有 Prisma 模型
- [x] KnowledgeNode 加的 `items Item[]` 是虚拟关系，不产生数据库列
- [x] Item 表是新增表，独立
- [x] package.json 新增 3 行脚本（⚠️上游文件修改）

### 测试（新审计检查）
- [x] 确认测试在安全路径运行：75/75 经 docker-compose.test.yml 通过，退出码 0，test.db 被更新，dev.db 未触碰（LastWriteTime 差 2 小时）
- [x] DB 护栏断言存在且生效
- [x] test:all 覆盖全部测试套件

## 已知限制

| # | 内容 | 严重度 | 计划 |
|---|------|--------|------|
| 1 | KST-lite gap 只传播一层直接 dependents，未递归到全部后代 | 非缺陷 | M4 探针下探时补。本轮所有 A 层节点都直接作答，一层传播已覆盖需求 |

## 安全路径复跑记录

| 测试套件 | 用例 | 结果 |
|----------|------|:--:|
| test:graph:unit | 19 | ✅ |
| test:graph:integration | 7 | ✅ |
| test:m2:unit | 15 | ✅ |
| test:m2:integration | 16 | ✅ |
| test:m3:unit (KST + BKT) | 18 | ✅ |
| **合计** | **75** | ✅ **退出码 0** |

## 现场状态

- Git 工作区：未跟踪文件（真题 md/pdf），非本轮产物
- dev.db LastWriteTime：10:45（迁移操作）
- test.db LastWriteTime：12:36（测试容器复跑）
- Docker：正常
- 护栏：生效

## 建议的后续动作

1. 合入 main
2. 起 M3b（配题灌入）或 M4（探针下探）
3. M4 补齐 KST-lite gap 递归传播
