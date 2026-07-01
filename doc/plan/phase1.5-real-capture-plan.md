# Phase 1.5 真实采集最小闭环 · 开发计划

> 关联规格: doc/spec/capture-layer-design-backlog.md（采集壳四层 artifact 模型）
> 关联参考: doc/reference/TECH_PLAN_v2.md（§采集与 AI 管线）、doc/reference/OPS_handbook.md（§4 前台措辞铁律、§6 主次铁律）
> 计划日期: 2026-07-01
> 计划代理: plan-agent
> 预计影响: `src/app/nana/capture/`、`src/components/nana/capture/`、`src/lib/image-utils.ts`（只读复用）
> 关联上游安全铁律: 铁律 3（不改上游表结构）、铁律 5（遇错停下来）

---

## 已确认决策点（评审 AI 2026-07-01 拍板）

| # | 决策 | 裁定 |
|---|------|------|
| 1 | 图/音存储方式 | **A. Base64 内联** + 硬限制 |
| 2 | 录音是否必填 | **可选**（照片必填，录音鼓励不强制，拒权限仍可保存） |
| 3 | "帮你整理"tab | **占位文案**，不调 LightFeedback |

### 硬限制（选 A 的配套约束，写入 §7.1 与后端校验）
- 图片压缩后 ≤ **1 MB**
- 单次录音时长上限 **60 秒**
- 单次保存总 payload ≤ **3 MB**（超出 → 前端阻断 + 后端 400）
- Base64 进 SQLite 是**设计债**，须落文档（见 §7.2，已升级为硬交付项）

### 评审 AI 追加的 4 项必须修正（已并入本计划）
1. **GET case 加归属校验**（见任务 G1 / §7.10）— 现状 `findUnique({where:{id}})` 无 `studentId` 过滤，任何登录用户可读任意 case；存了真实题图/录音后是真安全洞。
2. **POST case 加最小校验**（见任务 G2 / §7.11）— 类型白名单 + content 长度上限 + 整请求体积上限，超大 Base64 直接 400。
3. **§6 部署口径改成 CI 路线**（见 §6）— 废弃"服务器现场 `docker compose build`"，改为 GitHub Actions build-and-push 通过 + 服务器只 pull/up（对齐 `doc/plan/ci-image-deployment-plan.md`）。
4. **设计债落文档**（见任务 G3 / §7.2）— 同步追加到 `doc/00_CURRENT.md` 设计债表与 `doc/active_spec.md`，否则易忘。

---

## 1. 大白话概述

现在手机打开采集页（`/nana/capture`），页面是**假的**：题图是一段写死的文字不是真图，拍照按钮不打开相机，录音按钮不要麦克风权限，点保存也不会真的存进数据库。孩子会以为系统已经能用了，但其实什么都没发生。**这轮要把它变成真的。**

真实闭环要做成这样：孩子用手机**拍一道题**（或从相册选）→ 看到自己刚拍的真图 → **按住说几句**（弹出麦克风授权，真的录进去）→ 点**保存** → 系统真的存进库 → 页面说**"这道题已经收好了，可以再拍一道"**。

**关键边界**（这轮不做的事，不能让界面假装做了）：不做拍照识题（VLM）、不做语音转文字（ASR）、不做诊断、不裁图不旋转、不改数据库表结构。措辞上**绝不说"已诊断"**，只说"先收好了"，符合运营手册的措辞铁律（OPS_handbook §4）。

---

## 2. 任务分解

> 测试策略：本轮以**手机真机验收为主**（见 §4）。组件级状态机（VoiceRecorder 的 idle/recording/completed、采集页的 empty/photo/saved）建议 execute-agent 用最小单测覆盖关键分支；纯样式/措辞改动不强制 TDD。

### 任务 A：拆掉 mock，确立真实采集页状态机
- [ ] A1 在 `page.tsx` 删除对 `MOCK_QUESTION` / `MOCK_TRANSCRIPT` 的导入与使用；`mock-data.ts` 中仅保留 `joinTranscript` 这类纯函数，或整体标注 deprecated（涉及文件: `src/components/nana/capture/mock-data.ts`、`src/app/nana/capture/page.tsx`）
- [ ] A2 定义采集页主状态机：`empty → photoTaken → (recording*) → saving → saved → reset(empty)`（*录音可选）（涉及文件: `src/app/nana/capture/page.tsx`）

### 任务 B：真实题图采集（替代文字 mock）
- [ ] B1 用 `<input type="file" accept="image/*" capture="environment">` 让手机调起后置相机或相册（涉及文件: 新增 `src/components/nana/capture/question-image-capture.tsx`，或就地改 `question-image-viewer.tsx`）
- [ ] B2 选图后调用既有 `processImageFile`/`compressImage`（`src/lib/image-utils.ts`）压缩成 ≤1MB Base64，存入页面 state，并在题图区**显示真实图片预览**（`<img src={base64}>`）（涉及文件: 同上 + `src/lib/image-utils.ts` 只读复用）
- [ ] B3 空状态（未拍照）显示"先拍一下这道题"的占位 + 拍照入口；去掉原"题目一直在这儿 ✦"等 mock 浮标文案（涉及文件: 题图组件）

### 任务 C：真实录音（要权限、真录音、不做转写）
- [ ] C1 在 `voice-recorder.tsx` 用 `navigator.mediaDevices.getUserMedia({ audio: true })` 请求麦克风权限，失败要停下来明确提示（不能静默）（涉及文件: `src/components/nana/capture/voice-recorder.tsx`）
- [ ] C2 用 `MediaRecorder` 收集音频 chunk，停止时合成一个 `Blob`（webm/opus），保留在页面 state 供保存使用（涉及文件: 同上）
- [ ] C3 保留三态 UI（idle/recording/completed）与现有"说说看 / 正在听你说 / 我听完了"措辞；**录音完成文案改为"录音收好了，转写稍后接入"**，不再播 mock 逐字稿（涉及文件: 同上）
- [ ] C4 移除 `MockAsrProvider` 默认行为（不再 `streamTranscribe(new Blob())`）；`AsrProvider` 接口保留为第 5 阶段替换缝（涉及文件: 同上）

### 任务 D：保存进库（接通 createCase）
- [ ] D1 在采集页点"保存"时调用 `createCase(artifacts)`（`src/lib/nana/nana-api-client.ts:34`，已就绪但当前是死代码）（涉及文件: `src/app/nana/capture/page.tsx`）
- [ ] D2 组装 artifacts（按 §7.1 用户选定的方案）：至少 `question_image`（Base64）+ `transcript`（"尚未转写"）；如选 A/B 且有录音，再加 `audio_note`/`audio_meta`（涉及文件: 同上）
- [ ] D3 保存成功后显示成功态："这道题已经收好了，可以再拍一道"，并将页面**重置回 empty 状态**、`captureCount +1`（涉及文件: 同上）
- [ ] D4 保存失败要显式报错（铁律 6：不静默），文案用"没存成功，再试一次"，不暴露技术错误（涉及文件: 同上）

### 任务 E：能力边界措辞（守措辞铁律）
- [ ] E1 全页排查并清除"诊断 / 已诊断 / 薄弱 / 得分 / 掌握"等负向/越界词（OPS_handbook §4）（涉及文件: 全采集页相关组件）
- [ ] E2 "帮你整理"tab 在本轮：无 ASR、无真实逐字稿 → 改为温和提示"先把材料收好，等多拍几道再一起看规律"，**不再调 LightFeedback 关键词接口**（因为 transcript 恒为空，调了也没意义；见 §7.4）（涉及文件: `src/app/nana/capture/page.tsx`、`src/components/nana/capture/light-feedback.tsx` 本轮不渲染或弱化）

### 任务 F：真机验收 + 部署
- [ ] F1 本地 `npm.cmd run build` 通过 + 本地手机访问内网隧道/部署 dev 跑通真机（涉及文件: 无，验证步骤）
- [ ] F2 部署到 `https://nana.nanatop.xyz`（生产，main 分支）后用真机走完整流程，确认数据库里真有 case + artifacts（涉及文件: 无，验证步骤；部署本身按 AGENTS 部署门禁走，见 §6）

### 任务 G：后端加固 + 设计债登记（评审 AI 追加，必做）
- [ ] G1 **GET case 加归属校验**：`src/app/api/nana/cases/[id]/route.ts:25` 的 `findUnique({where:{id}})` 改为 `findFirst({where:{id, studentId: session.user.id}})`，命中不到一律返回 **404**（不泄露 case 是否存在）。涉及文件: `src/app/api/nana/cases/[id]/route.ts`。现有单测若断言"任意用户可读"需同步更新。
- [ ] G2 **POST case 加最小校验**：`src/app/api/nana/cases/route.ts` 在现有"非空数组"校验后追加：① `type` 白名单 `["question_image","audio_note","audio_meta","transcript"]`；② 单条 `content.length` 上限（建议 2 MB，覆盖 1.5 MB Base64 图）；③ 请求 artifacts 总条数上限（建议 ≤ 8）；④ 任一不满足返回 **400** + 明确原因。涉及文件: `src/app/api/nana/cases/route.ts`。详见 §7.11。
- [ ] G3 **设计债落文档**：把"二进制 artifact 以 Base64 内联 SQLite，case > 100 条或单库 > 50 MB 前须迁对象存储"追加到 `doc/00_CURRENT.md` 设计债表 + `doc/active_spec.md` 设计债节。涉及文件: `doc/00_CURRENT.md`、`doc/active_spec.md`（详见 §7.2）。

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/app/nana/capture/page.tsx` | 修改 | 主状态机重写：empty/photo/saved；接 createCase；移除 mock；保存门禁（无图禁保存）；成功/失败文案；三 tab 重排 |
| `src/components/nana/capture/question-image-viewer.tsx` | 修改/拆分 | 从"纯文字题卡"改为"支持真实图片预览 + 空状态入口"。如改动量大，建议拆出 `question-image-capture.tsx`（见下行） |
| `src/components/nana/capture/question-image-capture.tsx` | 新增（建议） | 专责：`<input capture>` + 选图 + 压缩成 Base64 + 预览。把题图采集职责从 viewer 剥离，避免单文件臃肿 |
| `src/components/nana/capture/voice-recorder.tsx` | 修改 | 接 `getUserMedia`+`MediaRecorder`；移除 MockAsrProvider 默认播报；录音完成文案改"录音收好了，转写稍后接入"；把录音 Blob 通过新增回调上抛给父页 |
| `src/components/nana/capture/transcription-panel.tsx` | 修改（小） | 本轮 transcript 恒为"尚未转写"；tab 内显示该占位，或禁用编辑。组件本身通用，不重写 |
| `src/components/nana/capture/light-feedback.tsx` | 修改（小） | 本轮不渲染真实反馈（无逐字稿）；改为占位文案，或由父页控制是否挂载 |
| `src/components/nana/capture/mock-data.ts` | 修改/删除 | 删除 `MOCK_QUESTION`/`MOCK_TRANSCRIPT`/`MOCK_FEEDBACK`；若 `joinTranscript` 仍被引用则保留该纯函数，否则整文件删 |
| `src/lib/nana/nana-api-client.ts` | 不改 | `createCase` 已就绪，本轮只是首次被调用（死代码激活） |
| `src/lib/image-utils.ts` | 不改（只读复用） | `compressImage`/`processImageFile` 直接复用，不修改 |
| `src/app/api/nana/cases/route.ts` | 修改（评审追加 G2） | 加类型白名单 + content 长度上限 + 总条数上限，超限 400（详见 §7.11） |
| `src/app/api/nana/cases/[id]/route.ts` | 修改（评审追加 G1） | `findUnique({where:{id}})` → `findFirst({where:{id, studentId}})`，归属不匹配返回 404（详见 §7.10） |
| `prisma/schema.prisma` | 不改 | 铁律 3：不改上游表结构 |
| 后端新增上传接口 | 不新增 | 见 §7.1（除非用户选 C，已裁定选 A） |
| `doc/00_CURRENT.md` | 修改（评审追加 G3） | 设计债表追加一条 Base64 内联迁移项 |
| `doc/active_spec.md` | 修改（评审追加 G3） | 设计债节追加一条 Base64 内联迁移项 |

---

## 4. 验收标准

> 测试策略：本轮核心是**真机行为**，逻辑模块（状态机、保存门禁、Base64 组装）建议补单测；样式措辞以人工走查为主。

### 4.1 手机真机清单（对应工单验收项）
用手机访问 `https://nana.nanatop.xyz/nana/capture`（已登录），逐项验证：

- [ ] **初始页面不显示 mock 题**（不再有写死的"第 3 题"文字卡，而是"先拍一下这道题"占位）
- [ ] **点拍照能调起手机相机/相册**（`capture="environment"` 生效）
- [ ] **选图后显示真实题图**（看到自己拍的照片，不是文字）
- [ ] **点录音弹出麦克风权限**（系统授权对话框出现）
- [ ] **录音中有明确状态**（"正在听你说" + 波形动画）
- [ ] **停止后显示"录音收好了"**（不再播 mock 逐字稿）
- [ ] **点保存后 `POST /api/nana/cases` 成功**（Network 面板看到 201）
- [ ] **刷新后数据库存在 case 和 artifacts**（用 prisma studio 或 SQL 查 `Case`/`Artifact` 表确认；含 `question_image`，可选含 `audio_note`/`audio_meta`，`transcript`="尚未转写"）
- [ ] **没有照片时不能保存**（保存按钮 disabled 或点击提示"先拍一下这道题"）
- [ ] **没有登录时按现有鉴权处理**（未登录 → 跳 `/login`，符合 `src/middleware.ts` + `route.ts` 的 401）

### 4.2 措辞走查（守 OPS_handbook §4）
- [ ] 全页无"诊断 / 已诊断 / 薄弱 / 得分 / 掌握 / 失败"等词
- [ ] 保存成功提示为"这道题已经收好了，可以再拍一道"类温和措辞
- [ ] "帮你整理"tab 不假装已分析，显示"先把材料收好，等多拍几道再一起看规律"

### 4.3 后端加固验收（评审 AI 追加）
- [ ] **GET case 归属校验**：用 A 账号登录创建 case，换 B 账号（或无关联用户）请求 `GET /api/nana/cases/{A的id}` → 返回 **404**（不是 200，也不是 403 避免枚举）
- [ ] **POST case 类型白名单**：传一个 `type: "evil"` 的 artifact → 返回 **400**
- [ ] **POST case 体积上限**：传一条 content 超过 2 MB 的 artifact → 返回 **400**，数据库无写入
- [ ] **POST case 正常路径不回归**：合规 artifacts（图 + 音 + meta + transcript）仍返回 201
- [ ] 现有 case 相关单测 `npm run test:all` 仍 110/110 退出码 0（归属校验改动后若有断言失效须同步更新，不留红灯）

### 4.4 文档交付验收（评审 AI 追加）
- [ ] `doc/00_CURRENT.md` 设计债表含"Base64 内联 SQLite 待迁对象存储"条目（含触发阈值 100 条 / 50 MB）
- [ ] `doc/active_spec.md` 设计债节含同一条目

### 4.5 自动化测试（建议，非强制）
- [ ] `VoiceRecorder`：getUserMedia 成功/失败分支、MediaRecorder 产出 Blob 的单测（mock mediaDevices）
- [ ] 采集页：保存门禁（无图禁保存）单测
- [ ] `npm run test:all` 仍 110/110 退出码 0（不回归）

---

## 5. 风险与注意事项

### 5.1 上游文件冲突风险（重点）
本计划改的文件**全是 `src/` 下 nana 自有目录**（`src/app/nana/`、`src/components/nana/capture/`），属于"追加挂接"范围，**不碰 wrong-notebook 原有文件**，符合铁律 3 与目录原则。`src/lib/image-utils.ts` 是**只读复用**（不改），零冲突风险。

### 5.2 HTTPS 与 getUserMedia（硬性前置）
`getUserMedia`（麦克风/相机）**只在安全上下文（HTTPS 或 localhost）可用**。生产域名 `https://nana.nanatop.xyz` 已是 HTTPS ✅。注意：
- 本地 dev 用 `localhost` 也算安全上下文 ✅
- 若用内网 IP（如 `http://192.168.x.x:3000`）手机访问，**getUserMedia 会被浏览器拒绝**——本地真机调试需走 localhost 或临时隧道

### 5.3 移动浏览器兼容性
- `capture="environment"`：iOS Safari + Android Chrome 现代版均支持，会优先调起后置相机；不支持时降级为普通文件选择（可从相册选）✅
- `MediaRecorder` + webm/opus：Android Chrome 全面支持；**iOS Safari 较新版本（14.3+）支持但可能用 audio/mp4 容器**，execute-agent 需用 `MediaRecorder.mimeType` 动态探测，不要写死 webm
- 若目标机型有已知不支持，**停下来问用户**（铁律 5），不要猜测降级

### 5.4 Base64 体积 / SQLite 膨胀（选 A 时）
- 图片已由 `compressImage` 压到 ≤1MB，Base64 后约 +33% ≈ 1.3MB/图
- 音频 webm/opus 极小（60 秒约几百 KB），Base64 后仍可控
- **建议设录音时长上限（60–90 秒）**，单条 case 控制在 ~2MB 以内
- 这是**设计债**（见 §7.2），case 量级上来前必须迁对象存储，否则 SQLite 查询/备份会变慢

### 5.5 权限拒绝处理
用户拒麦克风权限时：**显式提示**"没拿到麦克风权限，可以在浏览器设置里打开"——不静默、不假装录到了（铁律 6）。保存仍应允许（录音可选，见 §7.3）。

### 5.6 死代码激活风险
`createCase` 一直没被调用过，本轮是首次接通。execute-agent 应**先用一条最小 artifacts 手测**（如只传一个 transcript artifact）确认 201 返回，再接完整图/音，避免一次接太多定位不了问题。

---

## 6. 部署计划（本轮是部署型任务，按 plan-agent §部署专项要求）

> 本计划本身不含部署代码改动；但工单目标是在生产域名跑通，故列部署门禁。
> **部署路线以 `doc/plan/ci-image-deployment-plan.md` 为准（CI 镜像部署）**，废弃"服务器现场 `docker compose build`"。实际部署由 execute-agent 在代码完成后、按 AGENTS §部署发布门禁 + CI 方案执行。

- **部署目标分支**：`main`（生产）。dev 跑通后合 main。临时部署 dev 须用户明确确认并标注"临时例外"。
- **构建验证命令**：`npm.cmd run build`（本地生产构建必须通过）
- **CI 构建门禁（线上口径）**：GitHub Actions `build-and-push` workflow 必须全绿——`npm ci` → `prisma generate` → `npm run build` → `docker compose -f docker-compose.test.yml up`（全量测试容器）→ `docker build` → 推送 GHCR 三个 tag（sha-<短sha> + 时间戳 + latest）。**任一步失败 → 不推送镜像、不部署**（对齐 CI 方案 §6/§10）。
- **服务器操作**：**只 `docker compose -f docker-compose.prod.yml pull && up -d`，禁止现场 `docker compose build`**（CI 方案 §16 验收项："服务器不再执行 docker compose build"）。
- **Docker 验证命令（本地可选）**：若本地 Docker 可用可跑 `docker compose build --no-cache` 复验；若 Windows Docker Desktop 不稳定，**不依赖它做上线门禁**，以 CI 通过为准，并在部署日志写明"本地 Docker 未复验，以 CI 构建为准"。
- **生产环境变量清单**：`DATABASE_URL` / `NEXTAUTH_SECRET` / `NEXTAUTH_URL` / `AUTH_TRUST_HOST`（已在服务器配置，本轮无新增）；CI 需 `GITHUB_TOKEN`（自动）+ 服务器 GHCR PAT（`read:packages`，已在 `.env`）。
- **数据备份方案**：部署前在服务器跑 `bash backup.sh`（`/opt/nana/backup.sh`，`sqlite3 .backup`）。**备份失败不得继续部署**（CI 方案 §9）。
- **回滚方案**：改服务器 `.env` 的 `NANA_IMAGE=ghcr.io/jewellury/nanawrongbook:sha-<上一短sha>` 后 `docker compose -f docker-compose.prod.yml up -d` 切 tag（不删历史）。`git reset --hard` 按铁律「高危操作特别警告」须单独向用户说明会永久丢掉什么。
- **外部状态变更清单**：本轮**无** DNS/Caddy/证书/防火墙变更（域名与证书已就绪，CI 方案 §11 前提已满足）。
- **失败停止条件**：本地 build 失败、CI 任一步失败、服务器备份失败、服务器 pull/up 失败——任一发生**停止部署、回本地修**，绝不在服务器现场热修源码（AGENTS §服务器构建失败后不得现场热修）。
- **分支/commit 一致性**：部署日志须记录本地分支/commit、origin/main commit、CI 构建对应 commit、服务器镜像 tag，确认一致。

---

## 7. 技术附录

### 7.1 架构决策：二进制（图/音）如何变成 `Artifact.content`（String）

`Artifact.content` 是单个 String，且**全仓库无上传/存储端点**，工单又禁止改库结构。需在以下三选项中由用户拍板：

#### Option A — Base64 内联（✅ 评审 AI 已拍板采用）
- **图**：`compressImage(file)` → Base64 JPEG（≤ **1 MB** 硬限制）→ 直接存 `Artifact.content`，`type: "question_image"`
- **音**：`MediaRecorder` Blob → `FileReader` 转 Base64 → 存 `type: "audio_note"`；另存一条 `type: "audio_meta"`（content 形如 `"durationSec=60;mime=audio/webm;sizeBytes=184320"`）。**单次录音上限 60 秒**（前端到点自动停 + 后端体积兜底）。
- **transcript**：`type: "transcript"`，content = `"尚未转写"`
- **单次保存总 payload ≤ 3 MB**（前端组装后先估体积，超限提示"材料太大，请重新拍/录短一些"不发送；后端 §7.11 再兜底 400）
- 优点：不加端点、不改库、真正最小；且**保留了真实音频**，第 5 阶段 ASR 可回溯转写
- 缺点：Base64 进 SQLite 有 ~33% 体积开销，case 多了会拖慢查询/备份（**设计债，已升级为硬交付项，见 §7.2**）

#### Option B — 只存 audio_meta（不存音频字节）
- 图同 A；音**只存时长等元数据**（`audio_meta`），**丢弃音频字节**
- 优点：DB 体积最小
- 缺点：录音关页面即丢失，第 5 阶段 ASR 拿不到历史音频回溯转写

#### Option C — 新增上传接口
- 新增 `POST /api/nana/upload`：写文件到 `public/uploads/`，返回 URL；`content` 存 URL
- 优点：最干净、URL 可直接 `<img src>`
- 缺点：超出"最小闭环"范围；要考虑路径安全、文件清理、`public/` 进 git 等问题；本轮工单明确"不改 DB 结构"但未禁止加端点——仍属扩范围

**plan-agent 推荐 A**，理由：最小闭环 + 不改库 + 不加端点 + 为 ASR 留真实音频。**评审 AI 2026-07-01 确认采用 A，并追加硬限制（图 ≤1MB / 音 ≤60s / 总 payload ≤3MB）。**

#### Option B / Option C — 已否决
- B（只存 audio_meta 丢音频字节）：第 5 阶段 ASR 无法回溯转写，评审未选。
- C（新增上传接口）：超出最小闭环范围，评审未选。如未来 case 量级上升迁对象存储时再评估独立上传服务。

### 7.2 设计债登记（✅ 升级为硬交付项，任务 G3）
执行日志**必须**把以下条目追加到 `doc/00_CURRENT.md` 设计债表 + `doc/active_spec.md` 设计债节（两处都写，避免只看一个文件时漏掉）：

> **[设计债] 二进制 artifact 以 Base64 内联 SQLite**
> - 现状：`question_image`/`audio_note` 的字节以 Base64 存进 `Artifact.content`（String）
> - 风险：~33% 体积开销，case 多了拖慢 SQLite 查询/备份
> - 迁移触发阈值：case 数 > **100 条**，或 `dev.db` > **50 MB**，二者先到先触发
> - 迁移方向：对象存储（如 GHCR 同生态或腾讯云 COS）+ URL 存 content + 独立清理策略
> - 引入时间：Phase 1.5（本计划）

### 7.3 录音是否为保存的前置条件？
工单把"无照片不能保存"列为硬门禁，但**未要求录音必填**。裁定：
- **照片 = 必填**（无图禁保存）
- **录音 = 可选**（鼓励但不强制；用户拒麦克风权限或跳过录音，仍可保存，artifacts 只含图 + transcript 占位）

### 7.4 "帮你整理"tab 本轮怎么处理？
现状：`LightFeedback` 把 transcript POST 到关键词规则接口。本轮 transcript 恒为"尚未转写"，调接口无意义。裁定：
- 本轮**不挂载/不调用** LightFeedback 的接口请求
- 该 tab 内容改为温和占位："先把材料收好，等多拍几道再一起看规律"
- 符合措辞铁律：不假装已分析、不报"诊断"

### 7.5 三 tab 去留
工单未要求删 tab。保留三 tab 结构，但内容调整：
- **讲讲思路**（voice）：真录音入口
- **我的话**（transcript）：显示"尚未转写"占位（无 ASR）
- **帮你整理**（feedback）：见 §7.4 占位文案

### 7.6 采集页状态机（建议契约）

```
状态: photoState  = "empty" | "photoTaken"
状态: audioState  = "idle" | "recording" | "recorded"   // recorded 即已拿到 Blob
状态: saveState   = "idle" | "saving" | "saved" | "error"

迁移:
  empty    --选图并压缩成功--> photoTaken
  photoTaken --getUserMedia+MediaRecorder--> recording --> recorded
  (任意 photoTaken) --点保存--> saving
  saving   --201--> saved(显示成功 → 自动/手动 reset 回 empty, captureCount+1)
  saving   --非2xx--> error(显示"没存成功，再试一次", 保留数据可重试)

门禁: saveState="idle" 可点保存 当且仅当 photoState==="photoTaken"
```

### 7.7 关键组件契约（伪签名，供 execute-agent 落地）

#### `QuestionImageCapture`（新增建议）
```ts
interface QuestionImageCaptureProps {
  value: string | null;                 // 当前 Base64 预览（null = 空状态）
  onChange: (base64: string | null) => void;
  // 内部: <input type="file" accept="image/*" capture="environment">
  //        onChange → compressImage(file) → onChange(base64)
}
```

#### `VoiceRecorder`（改造后）
```ts
interface VoiceRecorderProps {
  onAudioReady?: (blob: Blob, meta: { durationSec: number; mime: string }) => void;
  // 移除 onTranscriptComplete（本轮无 ASR）
  // 内部: getUserMedia({audio:true}) + MediaRecorder, mimeType 动态探测
  // 失败: 显式提示"没拿到麦克风权限…", 不静默
}
```

#### `createCase` 调用形态（方案 A）
```ts
const artifacts: ArtifactInput[] = [
  { type: "question_image", content: imageBase64, seq: 0 },
];
if (audioBlob) {
  const audioBase64 = await blobToBase64(audioBlob);
  artifacts.push({ type: "audio_note", content: audioBase64, seq: 1 });
  artifacts.push({ type: "audio_meta", content: `durationSec=${d};mime=${m};sizeBytes=${s}`, seq: 2 });
}
artifacts.push({ type: "transcript", content: "尚未转写", seq: 3 });
const created = await createCase(artifacts);   // 期望 201
```

#### blobToBase64（工具，建议放采集页就近或 image-utils）
```ts
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
```

### 7.8 浏览器 API 兼容探测（execute-agent 须做）
- `if (!navigator.mediaDevices?.getUserMedia)` → 提示"当前浏览器不支持录音"
- `if (!window.MediaRecorder)` → 同上
- `MediaRecorder.isTypeSupported('audio/webm')` 否则尝试 `'audio/mp4'`，记录到 audio_meta

### 7.9 鉴权与 studentId 归属
`/api/nana/cases` 用 `getServerSession` 取 `session.user.id` 作为 `Case.studentId`（松挂接，无 FK，符合铁律 3）。本轮无登录态改动；未登录由 `middleware` + 路由 401 兜底。

### 7.10 GET case 归属校验（任务 G1，评审 AI 追加）
**现状漏洞**：`src/app/api/nana/cases/[id]/route.ts:25` 用 `findUnique({where:{id}})`，**只校验登录不校验归属**——任何登录用户拿 id 即可读取他人 case（含真实题图/录音）。

**修正**（伪代码）：
```ts
// 改 findUnique → findFirst，where 带上 studentId
const record = await prisma.case.findFirst({
  where: { id, studentId: session.user.id },
  include: { artifacts: { orderBy: { seq: 'asc' } } },
});
if (!record) return NextResponse.json({ error: "case 不存在" }, { status: 404 });
// 关键：归属不匹配也返回 404，不返回 403，避免 case id 枚举
```
- **返回 404 而非 403**：不向未授权用户泄露"该 case 存在但不属于你"，符合最小信息泄露原则。
- **测试影响**：现有 `src/__tests__/integration/nana/case-api.test.ts` 若有"任意登录用户读任意 case"的断言，须改为"读自己 case 200 / 读他人 case 404"。execute-agent 改完须跑 `npm run test:all` 确认无红灯。

### 7.11 POST case 最小校验（任务 G2，评审 AI 追加）
**现状漏洞**：`src/app/api/nana/cases/route.ts:25` 只校验"非空数组"，对 `type`/`content` 长度无任何约束——前端压缩虽可信但不可全信（绕过前端直发可打爆 SQLite/服务器）。

**修正**（伪代码，在现有非空校验之后追加）：
```ts
const ALLOWED_TYPES = new Set(["question_image", "audio_note", "audio_meta", "transcript"]);
const MAX_CONTENT_LEN = 2 * 1024 * 1024;   // 单条 content 2 MB（覆盖 ~1.5MB Base64 图 + 余量）
const MAX_ARTIFACTS = 8;                     // 单 case artifact 条数上限

if (artifacts.length > MAX_ARTIFACTS) {
  return NextResponse.json({ error: `artifacts 条数超过 ${MAX_ARTIFACTS}` }, { status: 400 });
}
for (const a of artifacts) {
  if (!ALLOWED_TYPES.has(a.type)) {
    return NextResponse.json({ error: `非法 artifact type: ${a.type}` }, { status: 400 });
  }
  if (typeof a.content !== "string" || a.content.length > MAX_CONTENT_LEN) {
    return NextResponse.json({ error: "artifact content 过大或非字符串" }, { status: 400 });
  }
}
```
- **白名单与 §7.1 对齐**：本轮只用这 4 个 type；未来加新 type（如 `aiSummary`）时同步扩白名单。
- **阈值依据**：图 ≤1MB Base64 ≈ 1.3MB，单条上限 2MB 留余量；总 payload 3MB 上限由前端组装后预检，后端单条 2MB × 条数兜底。
- **不要吞错**：每个 400 都带可读原因，便于前端提示"材料太大，请重新拍/录短一些"（铁律 6：显式失败）。

---

## 8. 引用与对齐

- OPS_handbook §4（前台措辞铁律：术语清零、不出现负向词）— §1/§4.2/§7.4 遵守
- OPS_handbook §6（主次铁律：她备考优先）— 本轮不增加她的使用负担，只是让页面变真
- TECH_PLAN_v2 §采集与 AI 管线 — 本轮只做"采集"，管线（VLM/ASR）明确不做
- AGENTS 铁律 3（不改上游表结构）— §3 全部 nana 自有目录，schema.prisma 不动
- AGENTS 铁律 5/6（遇错停下、显式失败不掩盖）— §5.5 权限拒绝、§5.6 死代码激活、D4 保存失败均显式处理

---

> **门禁状态**：3 项决策 + 4 项评审修正已全部并入本计划。✅ 已确认可交付 execute-agent 执行。执行前需用户最终一句"开始执行 / 确认"放行（AGENTS 门禁 2：计划未经用户确认不得执行）。
