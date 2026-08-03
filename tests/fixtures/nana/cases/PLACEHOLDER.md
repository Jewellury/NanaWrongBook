# 素材组 B fixture 需求（阻塞 r3.1 任务 2.5b 完整运行）

> 本文件描述任务 2.5b（`e2e/ci/nana-sequential-capture.spec.ts`）所需的 3 张脱敏数学题图。
> r3.1 任务 2.7 需用户提供真实题图后才能完整跑通。
> 关联契约：`doc/spec/nana-v1-minimum-loop-acceptance.md`（FREEZE-001 §7.2）
> 关联计划：`doc/plan/nana-test-framework-plan.md`（r3.1 §3 任务 2.5b + 2.7）

## 需求清单

| Fixture 名 | 章节 | 内容要求 | 用途 |
|-----------|------|---------|------|
| `set-theory.jpg` | TB-003 集合的基本运算（第一章 集合与常用逻辑用语） | 集合运算题（交/并/补） | 任务 2.5b Q1（假 Provider 注册延迟 **2000ms** 最慢返回，验证晚到结果不覆盖新状态） |
| `inequality.jpg` | TB-008 一元二次不等式（第二章 一元二次函数、方程和不等式） | 一元二次不等式求解 | 任务 2.5b Q2（假 Provider 注册延迟 **500ms** 中等） |
| `function-graph.jpg` | TB-010 函数的基本性质（第三章 函数的概念与性质） | 函数图象/性质判断 | 任务 2.5b Q3（假 Provider 注册延迟 **50ms** 最快返回，验证不被 Q1/Q2 覆盖） |

> 章节 ID 取自 FREEZE-001 §7.3 当前 16 个 TextbookTopic 覆盖范围。

## 脱敏要求（FREEZE-001 §7 + §8 隐私铁律）

每张题图必须经人工目视确认无：

- 学生姓名、学校、日期
- 教师批改痕迹中的可识别信息
- 任何试卷水印或来源标识
- 手机号 / 微信号 / 班级信息
- 空白姓名栏中的实际填写内容

参考素材组 A 的脱敏流程：见 `README.md` 隐私状态段。

## mock 响应映射

`e2e/helpers/fake-provider-server.ts` 已就绪对应的 mock 响应（`MOCK_RESULTS`）：

| Fixture 名 | Mock key | 期望章节 | 期望知识节点 |
|-----------|----------|---------|------------|
| `set-theory.jpg` | `set-theory` | TB-003 | M1a-01（集合运算） |
| `inequality.jpg` | `inequality` | TB-008 | M2a-05（一元二次不等式解法） |
| `function-graph.jpg` | `function-graph` | TB-010 | M2a-13（图象法判断单调性） |

mock 响应中的 `topicId` 和 `nodeId` 必须与题图实际内容匹配（FREEZE-001 §7.2：不能给一张函数题硬配三角函数响应）。如果题图实际章节与 mock 不符，应优先调整 mock 响应或选用更匹配的题图。

## 任务 2.5b 完整运行步骤

fixture 文件放入此目录后，任务 2.5b 的 `test.fixme()` 可移除：

1. 删除 `e2e/ci/nana-sequential-capture.spec.ts` 中所有 `test.fixme(...)` 的 `.fixme`（恢复为 `test`）
2. 删除 `// @fixture-blocked: 待真实脱敏数学题图` 注释
3. 验证 mock 响应与题图实际内容匹配（必要时调整 `MOCK_RESULTS`）
4. 本地或 CI nightly 跑通：`npx playwright test --project=mobile-chrome e2e/ci/nana-sequential-capture.spec.ts`

## 当前状态

- 任务 2.5b spec 已写完结构（commit `__COMMIT_H__`），核心 test 用 `test.fixme()` 标注
- 素材组 B 三张 fixture **未提供**（AI 无法生成真实数学题图）
- 提供真实 fixture 后：删除 `test.fixme()` + 验证 mock 响应匹配即可完整跑通

## 关联文档

- FREEZE-001 §7.2：素材组 B 章节映射
- FREEZE-001 §9.1 CL-15：连续拍题竞态验收条件
- r3.1 §3 任务 2.5b：spec 设计
- r3.1 §3 任务 2.7：fixture 需求
- r3.1 表格 5.2：fixture 全偏函数题风险记录
