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

### 任务 H：评审 AI 复核 4 项缺陷修复（2026-07-01）
- 做了什么: 修复评审 AI 指出的 4 个状态/UI 缺陷：
  - **P1-a 保存后录音组件不重置**：page.tsx 新增 `recorderKey` state，`<VoiceRecorder key={recorderKey}>`；换图/保存成功/重拍时 `recorderKey+1` 强制 remount，确保内部 state 回 idle
  - **P1-b 换图后旧录音跟新图保存**：`handleImageChange` 换图时同步调 `resetAudioAndRecorder()` 清 audioBlob/audioMeta + 重置录音组件，避免"新题图+旧录音"错配
  - **P2-a 60s 自动停不进 completed**：`setState("completed")` 从 `handleFinishRecording` 移进 `recorder.onstop` 统一路径，手动停/自动停都走 onstop 切 UI
  - **P2-b "我的话"tab 文案误导**：`TranscriptionPanel` 新增 `editable` prop（默认 false）；本轮渲染只读占位"录音已经收好 / 转写稍后接入"，去掉 contentEditable；未来第 5 阶段接 ASR 传 `editable` 即恢复编辑
- 涉及文件: `src/app/nana/capture/page.tsx`、`src/components/nana/capture/voice-recorder.tsx`、`src/components/nana/capture/transcription-panel.tsx`
- 结果: ✅ 完成（`npm run build` 通过，Compiled successfully in 16.4s，56/56 静态页，退出码 0）

### 任务 I：评审 AI 第二轮复核——录音资源泄漏 + 保存竞态（2026-07-01）
- 做了什么: 修复评审 AI 第二轮指出的 1 个 P1 + 1 个 P2：
  - **P1（hard stop）录音中切 tab/换图/保存致 recorder 后台泄漏**：
    - VoiceRecorder 加 `useEffect` unmount cleanup：卸载时若 recorder 在跑则 stop + 清 stream/timer + 置 `abortedRef=true`；onstop 检查 abortedRef 决定是否回写父组件（abort 时丢弃音频，避免"下一题图+上一段录音"错配）
    - VoiceRecorder 新增 `onRecordingStateChange` 回调，通知父组件是否在录音
    - page.tsx 接 `isRecording` state：录音中 tab 按钮 disabled（除 voice）、QuestionImageCapture disabled、handleSave/handleRetake 早返回 + 提示"先把话说完，再收这道题"
    - 回调改用 ref（onAudioReadyRef/onRecordingStateChangeRef），避免 useEffect cleanup 依赖闭包过期
  - **P2 保存成功延迟期间换图被旧 timeout 清空**：
    - 保存成功的 `setTimeout` 改用 `savedResetTimerRef` 句柄记录；`handleImageChange` 时 `clearTimeout` 旧 timer
    - QuestionImageCapture 新增 `disabled` prop，saving/saved/录音中禁止换图
    - page.tsx 加 unmount useEffect 清 pending timeout，防内存泄漏
- 涉及文件: `src/components/nana/capture/voice-recorder.tsx`、`src/components/nana/capture/question-image-capture.tsx`、`src/app/nana/capture/page.tsx`
- 结果: ✅ 完成（`npm run build` 通过，Compiled successfully in 16.8s，退出码 0）

### 任务 J：审计 P2 收口 + 触发 CI 门禁（2026-07-01）
- 做了什么: 按审计报告问题清单 P2×3 收口本日志：
  - "代码已提交"勾选项由"待执行"改为已提交的 5 个 commit（ea38002, a767df8, e8e8dcf, 748bc0d, 153bd17）
  - "完成状态"由迁门禁前的旧措辞（`test:all` BLOCKED）按 execute-agent.md 新模板二选一分支重述（本地 Docker 不可用→记录 + CI 兜底；GitHub Actions 测试容器通过后才允许部署）
  - "可进入审计阶段"改为反映现实：审计已完成（有条件通过），CI 门禁待跑
  - 本条任务记录即审计 P2 第 2/3 项的修复载体
- 涉及文件: `doc/executionlog/phase1.5-real-capture-log.md`（仅本文件）
- 结果: ✅ 完成（纯文档收口，无代码改动）

## 偏离记录（如有）
> 记录所有在执行中对计划做的微调。审计代理会逐条复核这些微调是否真属微调。

| # | 计划原内容 | 实际做了什么 | 原因 | 是否影响验收标准 |
|---|-----------|-------------|------|:--:|
| 1 | §3 `question-image-viewer.tsx` = 修改/拆分 | 拆出 `question-image-capture.tsx` 后，原 viewer 无任何引用，直接删除（dead code） | 拆分后 viewer 已被完全取代，保留会留下 mock 风格死代码 | 否 |
| 2 | §C voice-recorder 保留三态 UI + 现有措辞 | completed 态文案由"正在整理你说的内容…"改为计划 §C3 指定的"录音收好了，转写稍后接入" | 计划 §C3 明确要求该文案（此处不算偏离，仅备注） | 否 |
| 3 | §B1 建议新增 `question-image-capture.tsx` 或就地改 viewer | 选择新增独立组件 | 计划允许二选一，独立组件职责更清晰 | 否 |
| 4 | 计划未提 recorderKey 机制 | page.tsx 加 `recorderKey` 强制 VoiceRecorder remount（保存/换图/重拍时 +1） | 评审 AI P1-a：保存后录音组件内部 state 不重置，下一题卡在"录音收好了"。属状态一致性 bug 修复，不改变验收标准 | 否 |
| 5 | §D handleImageChange 只更新图片 | handleImageChange 同步清 audio + 重置录音组件 | 评审 AI P1-b：先录音后换图会"新题图+旧录音"错配。属数据一致性 bug 修复 | 否 |
| 6 | §C2 停止录音路径 | setState("completed") 从 handleFinishRecording 移进 recorder.onstop 统一路径 | 评审 AI P2-a：60s 自动停不走 handleFinishRecording，UI 不进 completed。属状态机分支补全 | 否 |
| 7 | §3 transcription-panel = 修改（小），组件通用不重写 | 新增 `editable` prop（默认 false），本轮只读占位；未来接 ASR 传 true 恢复编辑 | 评审 AI P2-b：本轮无 ASR，contentEditable+"轻点改"文案误导。组件仍通用（保留可编辑分支） | 否 |
| 8 | 计划未提 VoiceRecorder unmount cleanup | 加 useEffect unmount cleanup + abortedRef 标志 | 评审 AI 第二轮 P1（hard stop）：录音中切 tab/换图/保存会卸载组件，但旧 recorder 后台继续，60s 后 onstop 回写已重置的父组件 state，造成"下一题图+上一段录音"错配 + 麦克风资源泄漏。属资源/数据安全 bug 修复，不改变验收标准 | 否 |
| 9 | 计划未提 onRecordingStateChange 回调 | VoiceRecorder 新增 onRecordingStateChange，父组件据此在录音中禁 tab/换图/保存 | 同上 P1 配套：单纯 cleanup 是被动兜底，加父组件主动禁用 UI 是主动防护，双重保险防泄漏 | 否 |
| 10 | 计划未提 savedResetTimerRef | 保存成功 setTimeout 改用 ref 记录句柄，换图时 clearTimeout | 评审 AI 第二轮 P2：保存成功 1400ms 延迟期间用户重拍，新图会被旧 timeout 清空。属竞态修复 | 否 |
| 11 | §3 question-image-capture = 已有组件 | 新增 `disabled` prop | 同 P2 配套：saving/saved/录音中禁止换图的 UI 防护 | 否 |

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
- [x] 代码已提交（ea38002, a767df8, e8e8dcf, 748bc0d, 153bd17）
- [x] 本地 `npm.cmd run build` 通过（3 次：14.5s / 16.4s / 16.8s，退出码 0）
- [x] 本地相关窄范围测试已运行，或明确说明未运行原因——改动文件 ESLint exit 0、改动测试文件 tsc 零报错；集成测试 `case-api.test.ts` 因本地 Docker 不可用**未跑**
- [ ] 测试容器门禁通过（二选一）：
  - 本地 Docker 可用时：N/A（Docker Desktop 守护进程未运行）
  - 本地 Docker 不可用时：**本地 Docker Desktop 不可用，测试容器本地未跑；测试容器门禁交由 GitHub Actions 执行**
- [ ] GitHub Actions 测试容器通过后，才允许部署——⏳ 待 CI 跑（dev 合 main 后触发 `build-and-push` workflow）
- [ ] 确认测试在安全路径运行：CI 使用 test.db（`DATABASE_URL: file:./data/test/test.db`）；`./data/dev.db` 未被触碰（待 CI 跑后确认）
- [x] 审计已完成——报告 `doc/auditlog/phase1.5-real-capture-and-test-gate-audit.md`：Batch 1 ✅ 通过、Batch 2 ⚠️ 有条件通过（无 P0；P1 = CI 测试容器须跑绿；P2×3 = 本日志文档已在本轮收口）。放行权交 CI 绿灯 + 用户真机确认
