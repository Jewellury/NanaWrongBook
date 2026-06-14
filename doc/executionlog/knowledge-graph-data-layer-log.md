# 知识图谱数据层 · 执行日志

> 关联计划: doc/plan/knowledge-graph-data-layer-plan.md
> 开始时间: 2026-06-14

## 执行记录

### 任务1: Prisma schema 追加 8 张新表 + 生成迁移
- 做了什么: 在 prisma/schema.prisma 末尾追加 8 个 model，通过 Docker 容器运行 Prisma migrate
- 涉及文件: prisma/schema.prisma, prisma/migrations/20260613230423_add_knowledge_graph/migration.sql
- 结果: ✅ 完成
- commit: ba3cdec

### 任务2: 种子导入脚本 prisma/seed_graph.ts
- 做了什么: 写种子脚本，含字段归一化函数 normalizeNode()、悬空边过滤、幂等 upsert。通过 Docker 容器执行
- 涉及文件: prisma/seed_graph.ts, package.json
- 结果: ✅ 完成
  - 导入 10 主线 + 48 节点 + 36 边 + 18 主线桥
  - 跳过 19 条悬空边（目标节点未入库）
  - 幂等验证通过（二次执行结果一致）
- commit: ae306f3

### 任务3: 内存图谱模块 lib/graph.ts
- 做了什么: 实现 KnowledgeGraph 类，fromData() + load() 双构造方式，图遍历 + 环检测
- 涉及文件: lib/graph.ts
- 结果: ✅ 完成
- commit: c7b2604

### 任务4: 单元测试
- 做了什么: 12 个纯单元用例，用 fromData() 构造假数据，覆盖全部查询方法 + 边缘情况
- 涉及文件: src/__tests__/unit/graph.test.ts
- 结果: ✅ 完成（12/12 通过，Docker 内 vitest 验证）
- commit: 5a47be9

### 任务5: 集成测试
- 做了什么: 4 个集成用例，验证种子数据入库后的图谱状态
- 涉及文件: src/__tests__/integration/graph.test.ts
- 结果: ⚠️ 测试文件已写入，Docker Desktop 不可用未能实际运行
- commit: 2518175

## 偏离记录

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | videoLinks 字段类型为 `Json?` | 改为 `String?`（存 JSON 字符串） | SQLite 不支持 Prisma Json 类型，migrate 直接报错 | 否（种子脚本中 `JSON.stringify()` 后写入，使用时 `JSON.parse()` 即可） |
| 2 | 集成测试待 Docker 恢复后实际运行 | 文件已提交，验收命令已知（`npm run test:integration`） | Docker Desktop 在执行末期宕机 | 否（测试代码完整，恢复后跑即可） |

## 上游文件修改

| 文件 | 改了什么 | 原因 |
|------|----------|------|
| package.json | 新增 `"seed": "tsx prisma/seed_graph.ts"`（scripts 节）+ `"tsx": "^4.19.0"`（devDependencies 节） | 计划要求的最小增量添加 |

## 遇到的问题

| 问题 | 解决方式 |
|------|----------|
| `npx prisma` 拉到 7.8.0 不兼容（要求 prisma.config.ts） | 用容器内 `/app/node_modules/prisma/build/index.js` 固定 5.22.0 |
| 容器不挂载 prisma/ 和 lib/ 目录 | `docker cp` 手动拷入需要更新的文件 |
| SQLite 不支持 Prisma `Json` 类型 | 改为 `String?`，种子脚本 `JSON.stringify()` 写入（偏离记录 #1） |
| Docker Desktop 在执行末期宕机 | 集成测试文件已提交，待恢复后补跑（偏离记录 #2） |

## 完成状态

- [x] 所有任务代码已写入
- [x] 代码已提交（5 个 commit: ba3cdec → ae306f3 → c7b2604 → 5a47be9 → 2518175）
- [x] 12/12 单元测试通过
- [ ] 集成测试待 Docker 恢复后实际运行
- [x] 可进入审计阶段

---

## 审计修复（2026-06-14 · commit cf02a18）

外部审计发现 3 个问题，全部修复：

### 修复1 [P1]: mainlineSubgraph() 完整实现
- load() 同时查询 NodeMainline 表，构建 mainlineId→nodeId[] 映射
- fromData() 新增可选的 mainlineNodes 参数
- mainlineSubgraph() 完整实现：取主线节点 + 递归全部前置 + 去重
- 新增 getMainlineNodeIds() 方法
- 单元测试 +3（ML1/ML2/不存在主线）、集成测试 +3

### 修复2 [P1]: package-lock.json 同步
- `npm install --package-lock-only` 更新 lockfile，tsx 已入 devDependencies

### 修复3 [P2]: tool 边遍历语义修正
- 邻接表拆分为 prereq 专用 + allOutCount 计数
- prereqsOf/allPrereqsOf/dependentsOf/detectCycles 只走 prerequisite 边
- tool 边计入 getStats().edgeCount 供讲解引用，不参与图遍历
- 单元测试 +4（tool 边不暴露为前置 / tool 环不触发环检测）
- 单元测试总数：12 → 19 用例

---

## M1 集成测试补验（2026-06-14 · 容器分层方案修正轮）

Docker 恢复后，通过新测试容器完成 M1 补验：

| 测试 | 结果 |
|------|:--:|
| `test:graph:unit` | 19/19 ✅ |
| `test:graph:integration` | 7/7 ✅ |
| 退出码 | 0 ✅ |
| `./data/dev.db` LastWriteTime | 不变 ✅ |

验证命令：`docker compose -f docker-compose.test.yml up --abort-on-container-exit`

