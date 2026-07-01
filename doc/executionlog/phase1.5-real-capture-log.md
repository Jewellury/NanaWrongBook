# Phase 1.5 真实采集最小闭环 · 执行日志

> 关联计划: doc/plan/phase1.5-real-capture-plan.md
> 开始时间: 2026-07-01

## 执行记录

### 任务 G1：GET case 归属校验
- 做了什么: `src/app/api/nana/cases/[id]/route.ts` 的 `findUnique({where:{id}})` 改为 `findFirst({where:{id, studentId: session.user.id}})`；不存在或归属不匹配一律返回 404（不返回 403，避免 case id 枚举）
- 涉及文件: `src/app/api/nana/cases/[id]/route.ts`
- 结果: ✅ 完成（构建通过）

### 任务 G2：POST case 最小校验
- 做了什么: `src/app/api/nana/cases/route.ts` 在现有非空校验后追加：① type 白名单 `["question_image","audio_note","audio_meta","transcript"]`；② 单条 content 长度上限 2MB；③ artifacts 条数上限 8；任一不满足返回 400 + 可读原因
- 涉及文件: `src/app/api/nana/cases/route.ts`
- 结果: ✅ 完成（构建通过）

### 任务 G（测试更新）：集成测试同步 G1/G2 行为
- 做了什么: `src/__tests__/integration/nana/case-api.test.ts` 更新——happy path 的 `type:'image'` 改为 `type:'question_image'`（白名单合规）；新增 G2 校验测试（非白名单 type→400、旧 type image→400、content 超 2MB→400、content 非字符串→400、条数超 8→400、合规全量 artifacts 仍 201）；新增 G1 归属测试（跨用户读取返回 404，通过 `mockResolvedValueOnce` 切换身份）
- 涉及文件: `src/__tests__/integration/nana/case-api.test.ts`
- 结果: ⚠️ 待测试容器验证（Docker Desktop 未运行，见"遇到的问题"）

### 任务 A：拆掉 mock + 确立状态机
- 做了什么: page.tsx 删除对 MOCK_QUESTION/MOCK_TRANSCRIPT 的导入与使用；删除 mock-data.ts（joinTranscript 不再被引用，整文件删）；删除已死的 question-image-viewer.tsx（被拆出的 question-image-capture.tsx 取代）；确立采集页状态机 photoState(empty/photoTaken) + saveState(idle/saving/saved/error)
- 涉及文件: `src/app/nana/capture/page.tsx`（重写）、`src/components/nana/capture/mock-data.ts`（删除）、`src/components/nana/capture/question-image-viewer.tsx`（删除）
- 结果: ✅ 完成（构建通过）

### 任务 B：真实题图采集
- 做了什么: 新增 `question-image-capture.tsx`——`<input type="file" accept="image/*" capture="environment">` 调起后置相机/相册；选图后调 `processImageFile`（image-utils.ts 只读复用）压缩成 ≤1MB Base64；空状态显示"先拍一下这道题"+ 拍照入口；已拍照显示真实 `<img>` 预览 + "重拍一张"入口
- 涉及文件: `src/components/nana/capture/question-image-capture.tsx`（新增）、`src/lib/image-utils.ts`（只读复用，未改）
- 结果: ✅ 完成（构建通过，capture 属性无 React 警告）

### 任务 C：真实录音
- 做了什么: 重写 `voice-recorder.tsx`——`getUserMedia({audio:true})` 请求麦克风，拒绝显式提示"没拿到麦克风权限…不录音也能保存"；`MediaRecorder` 收集音频，mimeType 动态探测（webm→mp4，记录进 audio_meta）；60 秒自动停；移除 MockAsrProvider 默认播报；保留 AsrProvider 接口缝（第 5 阶段替换）；新增回调 `onAudioReady(blob, meta)`；完成态文案"录音收好了，转写稍后接入"
- 涉及文件: `src/components/nana/capture/voice-recorder.tsx`（重写）
- 结果: ✅ 完成（构建通过）

### 任务 D：保存进库（接通 createCase）
- 做了什么: page.tsx 保存按钮接通 `createCase(artifacts)`；按 §7.7 方案 A 组装 artifacts（question_image + 可选 audio_note/audio_meta + transcript="尚未转写"）；前端 3MB payload 预检（超限提示"材料太大"不发送）；成功→"这道题已经收好了，可以再拍一道" + 重置 + captureCount+1；失败→"没存成功，再试一次"（保留数据可重试）；无照片禁保存
- 涉及文件: `src/app/nana/capture/page.tsx`
- 结果: ✅ 完成（构建通过；createCase 为首次激活的死代码）

### 任务 E：能力边界措辞
- 做了什么: 全页排查并清除"诊断/薄弱/得分/掌握"；"帮你整理"tab 占位"先把材料收好，等多拍几道再一起看规律"，不渲染/不调 LightFeedback（transcript 恒"尚未转写"）；"开始诊断？"改为温和"回首页看看"
- 涉及文件: `src/app/nana/capture/page.tsx`、`src/components/nana/capture/light-feedback.tsx`（保留为 Phase 5 缝，本轮不挂载）
- 结果: ✅ 完成（措辞走查通过）

### 任务 F1：本地构建
- 做了什么: `npm.cmd run build` 验证生产构建
- 涉及文件: 无（验证步骤）
- 结果: ✅ 完成（Compiled successfully in 14.5s，56/56 静态页生成，TypeScript 检查通过）

### 任务 F2：真机/部署验收
- 做了什么: （需用户在真机 + 服务器执行）
- 涉及文件: 无（验证步骤）
- 结果: ⬜ 延后至用户（需真机 + 服务器）

### 任务 G3：设计债落文档
- 做了什么: 在 `doc/00_CURRENT.md` 设计债表 + `doc/active_spec.md` 设计债节各追加一条"二进制 artifact 以 Base64 内联 SQLite（Phase 1.5 引入）"，含迁移阈值（case>100 或 dev.db>50MB）与迁移方向（对象存储 + URL）
- 涉及文件: `doc/00_CURRENT.md`、`doc/active_spec.md`
- 结果: ✅ 完成（两处均已追加）

## 偏离记录（如有）
> 记录所有在执行中对计划做的微调。审计代理会逐条复核这些微调是否真属微调。

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | §3 `question-image-viewer.tsx` = 修改/拆分 | 拆出 `question-image-capture.tsx` 后，原 viewer 无任何引用，直接删除（dead code） | 拆分后 viewer 已被完全取代，保留会留下 mock 风格死代码 | 否 |
| 2 | §C voice-recorder 保留三态 UI + 现有措辞 | completed 态文案由"正在整理你说的内容…"改为计划 §C3 指定的"录音收好了，转写稍后接入" | 计划 §C3 明确要求该文案（此处不算偏离，仅备注） | 否 |
| 3 | §B1 建议新增 `question-image-capture.tsx` 或就地改 viewer | 选择新增独立组件 | 计划允许二选一，独立组件职责更清晰 | 否 |

## 上游文件修改（如有）
| 文件 | 改了什么 | 原因 |
|------|----------|------|
| （无） | 本轮所有改动均在 nana 自有目录（`src/app/nana/`、`src/components/nana/capture/`、`src/app/api/nana/cases/`），未修改 wrong-notebook 上游文件 | 铁律 3 |

## 遇到的问题
| 问题 | 解决方式 |
|------|----------|
| Docker Desktop 守护进程未运行，测试容器无法启动 | ⚠️ **测试未运行（BLOCKED）**。按铁律 5/6 不退回 prod 容器、不跳过测试。已完成本地构建 + ESLint + tsc 验证（仅针对改动文件）。需用户启动 Docker Desktop 后运行 `docker compose -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from test` |
| 仓库预存 245 个 ESLint 问题 + 部分测试 tsc 报错（seed-admin/diagnosis-orchestrator/gemini-retry 等） | 均为上游/既有问题，非本轮引入。改动文件 ESLint 零报错（exit 0）、改动测试文件 tsc 零报错 |

## 完成状态
- [x] 所有代码任务完成（A–E + G1–G3 + F1）
- [ ] 代码已提交（commit: 见下方 git 收口，待执行）
- [ ] `test:all` 通过 —— ⚠️ **BLOCKED**：Docker Desktop 守护进程未运行，测试容器无法启动。需用户启动 Docker 后重跑
- [ ] 确认测试在安全路径运行 —— 同上 BLOCKED
- [x] F2 真机/部署验收 —— 延后至用户（需真机 + 服务器）
- [ ] 可进入审计阶段 —— 待测试容器验证通过后
