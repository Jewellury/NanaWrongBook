# 第 1 阶段执行计划：采集基础壳

> 性质：`/plan` 阶段产出。面向 execute-agent 的可执行规格。
> 依赖总纲：`nana-master-plan.md`、`nana-development-phases.md` §1
> 产生日期：2026-06-27
> 预计工期：5 个 commit / ~1-2 周

---

## 0. 前置条件

开始前确认：
- [ ] `git status` — 工作区干净，在 `dev` 分支
- [ ] 以下文档已读：`doc/reference/TECH_PLAN_v2.md`（P1-P5 原则）、`doc/reference/OPS_handbook.md` §4（前台措辞铁律）、`doc/plan/frontend-architecture-plan.md` §3-4（路由/组件组织 + 碰不得清单）
- [ ] `npm run test:all` 通过（基线通过）
- [ ] 无未提交的变更（除本计划的产出外）

---

## 1. 拆分策略（4 个 commit）

```
Commit ①: Prisma schema + case API             (数据层 + API 层)
Commit ②: 场景入口首页 + nana layout            (前端路由 + 首页)
Commit ③: 采集壳 UI + 组件                       (前端核心交互)
Commit ④: 单题轻反馈 API + UI                    (子任务)
```

每个 commit 独立可验证。顺序依赖：①→②→③→④。

---

## 2. Commit ①：Case/Artifact API（数据层 + API 层）

### 2.1 Prisma Schema 追加

在 `prisma/schema.prisma` **末尾**追加以下两个 model：

```prisma
// ============================================================
// 第 1 阶段：采集壳（个性化数学诊断辅导系统 · 增量）
// 全部新增表，不改 wrong-notebook 已有模型
// ============================================================

model Case {
  id        String     @id @default(cuid())
  studentId String     // → 上游 User.id（不改其表，与 mistakeId 同款处理）
  createdAt DateTime   @default(now())
  artifacts Artifact[]
}

model Artifact {
  id       String @id @default(cuid())
  caseId   String
  case     Case   @relation(fields: [caseId], references: [id])
  type     String // "image" | "audio" | "transcript" | "aiSummary"
  content  String // URL（image/audio）或纯文本（transcript/aiSummary）
  seq      Int    @default(0) // 同类型多 artifact 的顺序
  createdAt DateTime @default(now())

  @@index([caseId])
}
```

**设计说明**：
- `content` 统一存文本：图片/音频存 URL，逐字稿/AI 提要存纯文本
- `type` + `seq` 支持同 case 多条 artifact（如多张题图、多段录音）
- `studentId` 不加 Prisma relation（不改上游 User 表），用 comment 标注
- `@@index([caseId])` 加速 case → artifact 查询

### 2.2 API 路由：POST /api/nana/cases

**文件**：`src/app/api/nana/cases/route.ts`

**请求**：
```typescript
// POST /api/nana/cases
{
  artifacts: Array<{
    type: "image" | "audio" | "transcript" | "aiSummary";
    content: string;
    seq?: number;
  }>
}
```

**响应**（201）：
```typescript
{
  id: string;
  studentId: string;
  createdAt: string;
  artifacts: Array<{
    id: string;
    type: string;
    content: string;
    seq: number;
  }>;
}
```

**错误**（400）：`{ error: "artifacts 不能为空" }`
**错误**（401）：`{ error: "未授权" }`

**Handler 模板**（遵循现有模式）：
```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";
import { unauthorized, internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:nana:cases');

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const body = await req.json();
    const { artifacts } = body;

    if (!artifacts || !Array.isArray(artifacts) || artifacts.length === 0) {
      return NextResponse.json({ error: "artifacts 不能为空" }, { status: 400 });
    }

    const record = await prisma.case.create({
      data: {
        studentId: session.user.id,
        artifacts: {
          create: artifacts.map((a: { type: string; content: string; seq?: number }) => ({
            type: a.type,
            content: a.content,
            seq: a.seq ?? 0,
          })),
        },
      },
      include: { artifacts: true },
    });

    logger.info(`case 创建成功: ${record.id}`);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    logger.error('创建 case 失败', error);
    return internalError();
  }
}
```

### 2.3 API 路由：GET /api/nana/cases/:id

**文件**：`src/app/api/nana/cases/[id]/route.ts`

**响应**（200）：同 POST 的响应结构
**错误**（404）：`{ error: "case 不存在" }` → 复用现有 404 模式

```typescript
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized();

  try {
    const { id } = await params;
    const record = await prisma.case.findUnique({
      where: { id },
      include: { artifacts: { orderBy: { seq: 'asc' } } },
    });
    if (!record) {
      return NextResponse.json({ error: "case 不存在" }, { status: 404 });
    }
    return NextResponse.json(record);
  } catch (error) {
    logger.error('读取 case 失败', error);
    return internalError();
  }
}
```

### 2.4 前端 API 客户端

**文件**：`src/lib/nana/nana-api-client.ts`

```typescript
const BASE = '/api/nana';

export async function createCase(artifacts: Array<{
  type: string; content: string; seq?: number;
}>) {
  const res = await fetch(`${BASE}/cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifacts }),
  });
  if (!res.ok) throw new Error(`createCase 失败: ${res.status}`);
  return res.json();
}

export async function getCase(id: string) {
  const res = await fetch(`${BASE}/cases/${id}`);
  if (!res.ok) throw new Error(`getCase 失败: ${res.status}`);
  return res.json();
}
```

### 2.5 测试

**文件**：`src/__tests__/unit/nana/case-api.test.ts`

单元测试：验证 createCase/getCase 的 API 客户端函数（mock fetch）

**文件**：`src/__tests__/integration/nana/case-api.test.ts`

集成测试（遵循现有诊断 API 测试模式）：
- Mock next/server、next-auth、logger、auth、api-errors
- 使用真实 PrismaClient（连接测试库）
- 测试 `POST /api/nana/cases` — 创建 case
- 测试 `GET /api/nana/cases/:id` — 读取 case
- 测试 400（缺少 artifacts）
- 测试 404（不存在的 id）

### 2.6 package.json scripts 追加

```json
"test:nana:unit": "vitest run src/__tests__/unit/nana",
"test:nana:integration": "vitest run src/__tests__/integration/nana"
```

同时更新 `test:all` 脚本以包含 nana 测试。

### 2.7 Commit ① 验收

- [ ] `prisma migrate dev` 成功（两步确认：用户确认后执行）
- [ ] `POST /api/nana/cases` — curl 创建 case 返回 201 + id
- [ ] `GET /api/nana/cases/:id` — 返回 case + artifacts
- [ ] `test:nana:unit` 通过
- [ ] `test:nana:integration` 通过（测试容器）
- [ ] 不修改上游 model（`git diff prisma/schema.prisma` 只显示末尾追加）

---

## 3. Commit ②：场景入口首页 + /nana Layout

### 3.1 段级 Layout

**文件**：`src/app/nana/layout.tsx`

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function NanaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return <div className="nana-layout min-h-screen bg-[#FBF7F0]">{children}</div>;
}
```

**设计说明**：
- 服务端鉴权：未登录直接重定向到 `/login`
- 背景色：`bg-[#FBF7F0]`（设计基底的奶油暖白色 `--bg`）
- 无额外导航栏（首页设计极简，只有两个行动卡 + recap bar）
- 不修改上游根 layout

### 3.2 首页

**文件**：`src/app/nana/page.tsx`

**注意**：这是一个 **客户端组件**（"use client"），因为需要从 map API 异步加载数据并展示交互状态。

**布局（从 `02-home.html` mockup 翻译）**：

```
┌────────────────────────────────┐
│  嗨，今天想从哪开始？           │  ← 手写体问候
│  不急，挑一个就好。            │  ← 副标题
│                                │
│  ┌─── 拍一下这道题 ─────────┐  │  ← 行动卡 1（绿色图标）
│  │ 把刚卡住的那道拍进来    │  │
│  └──────────────────────────┘  │
│  ┌─── 补一段你当时怎么想的 ─┐  │  ← 行动卡 2（琥珀色图标）
│  │ 说说看就好，想到哪说到哪│  │
│  └──────────────────────────┘  │
│                                │
│  ✦ 上次你点亮了：函数的定义域   │  ← recap bar（有记录态时显示）
│  你的地图上已经有 5 个光点了   │
│  → 看看我的知识地图            │
│                                │
│  ⭐ 你的光点地图还空着，       │  ← 空状态提示（无记录态时显示）
│  第一道题，会点亮第一个光点。  │
└────────────────────────────────┘
```

**状态逻辑**：
- 页面加载时调用 `GET /api/diagnosis/map` 获取 StudentNodeState 列表
- 如果 `states.length > 0`：显示有记录态（recap bar + 地图链接）
- 如果 `states.length === 0`：显示空状态（星级提示）
- 两个行动卡始终显示

**组件**：
- `ActionCard` — 行动卡组件（props: title, description, icon, href）
- `RecapBar` — 回顾条（props: latestNodeName, totalLitCount）
- `EmptyHint` — 空提示

**CSS**：
- 使用内联 Tailwind utility classes（Tailwind v4 无 config.ts）
- 设计系统色值用 `bg-[#xxx]` / `text-[#xxx]` / `border-[#xxx]`
- 自定义动画用 CSS-in-JS 或 inline style object（Home mockup 的 glowring pulse 动画）

**文案例行检查（P4）**：
| 位置 | 正确 | 错误示范 |
|------|------|---------|
| 行动卡标题 | "拍一下这道题" | "录入新错题" |
| 行动卡标题 | "补一段你当时怎么想的" | "口述归因录音" |
| 按钮提示 | "不急，挑一个就好" | "你还有 12 题未处理" |
| Recap bar | "上次你点亮了：XX" | "上次正确率 62%" |
| 空状态 | "第一道题，会点亮第一个光点" | "你还没有任何数据" |

### 3.3 首页 → 采集壳入口

从首页"拍一下这道题"行动卡 → `<Link href="/nana/capture">`。
这是依赖 `src/app/nana/capture/page.tsx` 必须存在的链接——在 Commit ③ 创建该页面之前，此链接可能跳转 404，但架构上是独立的。

**可选**：先创建 `src/app/nana/capture/page.tsx` 占位页（"功能建设中"），等 Commit ③ 再替换完整内容。

### 3.4 Commit ② 验收

- [ ] `/nana` 页面可访问，通过鉴权
- [ ] 有记录态：显示 recap bar + 两个行动卡 + 地图链接
- [ ] 空状态：显示两个行动卡 + 空提示
- [ ] 措辞守 P4（对照上方例行检查表）
- [ ] 行动卡可点击跳转 `/nana/capture`
- [ ] 布局在 390px 宽度不崩
- [ ] 未登录用户重定向到 `/login`
- [ ] 零上游文件修改

---

## 4. Commit ③：采集壳 UI + 组件

### 4.1 采集页布局

**文件**：`src/app/nana/capture/page.tsx`（"use client"）

**布局结构（从 `03-capture.html` mockup 翻译，但帧 4 需按审计调整）**：

```
┌────────────────────────────────┐
│  ← 返回  这道题        重拍 📷 │  ← 顶栏
├────────────────────────────────┤
│                                │
│       题图区域（固定不可滚动）   │  ← 上半屏（~52% 高度）
│    ┌──────────────────────┐    │
│    │  第 3 题              │    │
│    │  已知函数 f(x) = ...  │    │
│    │  (1) 求定义域与值域   │    │
│    └──────────────────────┘    │
│        题目一直在这儿 ✦        │
├────────────────────────────────┤
│ [讲讲思路] [我的话] [帮你整理]  │  ← 三 tab
├────────────────────────────────┤
│                                │
│       下半屏（ta b 内容区）      │
│                                │
│   - 讲讲思路：录音按钮 / 波形   │
│   - 我的话：逐字稿编辑          │
│   - 帮你整理：轻反馈区         │
│                                │
└────────────────────────────────┘
```

### 4.2 组件列表

#### QuestionImageViewer

**文件**：`src/components/nana/capture/question-image-viewer.tsx`

```
用途：展示题图，固定不可滚动
Props: { imageUrl: string; alt?: string }
渲染：<div class="imgwrap"> → <img> 或 mock 题面卡片
```

**阶段说明**：本阶段先使用 mock 题面数据（从 `03-capture.html` 硬编码的"第 3 题 / 已知函数 f(x) = x²−2x−3"）。真实题图上传在第 5 阶段（ASR/VLM 接通）。

#### VoiceRecorder

**文件**：`src/components/nana/capture/voice-recorder.tsx`

```
用途：录音控件壳
Props: { onTranscriptComplete?: (text: string) => void }
状态：idle → recording → completed

渲染：
- idle：圆形录音按钮 + "说说看" 文案
- recording：波形动画 + 实时转写文字流 + "我听完了" 按钮
- completed：调用 onTranscriptComplete 传递转写文本

AsrProvider 抽象接口（在本组件内部定义，供第 5 阶段切换真实 ASR）：
  interface AsrProvider {
    streamTranscribe(audio: Blob, onText: (t: string) => void): Promise<void>;
    fileTranscribe(audio: Blob): Promise<string>;
  }
  本阶段使用 MockAsrProvider：延迟 2-3 秒后返回预定义文本。
```

#### TranscriptionPanel

**文件**：`src/components/nana/capture/transcription-panel.tsx`

```
用途：逐字稿展示和编辑
Props: { text: string; onChange?: (text: string) => void }
渲染：<div contentEditable> 或 <textarea>，可逐句编辑
```

#### LightFeedback

**文件**：`src/components/nana/capture/light-feedback.tsx`

```
用途：单题轻反馈展示区（详见 Commit ④，本 commit 先搭建显示位置）
Props: { feedback?: { hint: string; relatedTags: string[] } | null }
状态：
  - null / undefined → 显示骨架或空白
  - 有反馈 → 展示提示文案

渲染文案模板（来自 mock 规则）：
  "收到这道题。你谈到[关键词]可能和[知识点]有关——这只是初步线索，不是最终判断。再拍几道后我们一起看。"
```

**注意**：本 commit 只搭建 UI 位置和骨架。真实反馈逻辑在 Commit ④ 实现。

### 4.3 Tab 切换逻辑

```
当前 tab 状态: "voice" | "transcript" | "feedback"

流程自动切换：
1. 用户到达采集页 → 默认 tab = "voice"（讲讲思路）
2. 用户点击录音按钮 → 进入录音中状态（仍在 voice tab）
3. 用户点击"我听完了" → 自动切换到 tab = "feedback"（帮你整理），同时触发：
   a. 生成 mock 逐字稿 → 存入 transcript tab
   b. 生成 mock 轻反馈 → 在 feedback tab 显示（带 0.3s fade-in 动画）
4. 用户可随时手动切换 tab 查看/编辑逐字稿

"继续拍一道"按钮：
  - 在 feedback tab 底部显示
  - 点击后重置采集页状态（清空题图/录音/反馈，保留已拍计数）
  - 已拍计数显示："已拍 2 道"
```

### 4.4 Mock 数据

本阶段所有数据为硬编码 mock，定义在 `src/components/nana/capture/mock-data.ts`：

```typescript
export const MOCK_QUESTION = {
  stem: "已知函数 f(x) = x² − 2x − 3\n(1) 求函数的定义域与值域；\n(2) 求 f(x) 的最小值，并指出此时 x 的取值。",
};

export const MOCK_TRANSCRIPT = [
  "嗯…这道题我先看了定义域，",
  "因为它就是个多项式，x 好像什么都能取，",
  "然后值域我有点不确定，我想配成完全平方但配到一半就乱了…",
];

export const MOCK_FEEDBACK = {
  hint: "你想到先看定义域，也想到配完全平方——方向很对。你说的'配到一半就乱了'可能和配方法的步骤有关。这只是初步线索，再拍几道后我们一起看。",
  relatedTags: ["配方法"],
};
```

### 4.5 HTML Mockup 调整落实

根据审计结果，将 `03-capture.html` 的帧 4 从"帮你整理→一起点亮配方法"改为：

| 原内容 | 改为 |
|--------|------|
| "下一个光点" tag + "一起点亮「配方法」"按钮 | "收到这道题" + 不确定性线索文案 + "再拍一道"按钮 |
| 教学讲解（"它能写成 (x-1)²-4..."） | "方向很对，这些我都帮你记下来了" |
| 没有累积提示 | 已拍计数 + 累积 N≥3 时显示"拍了 N 道了，开始诊断？" |
| 没有"再拍一道"流程 | "再拍一道"按钮 + （N≥3 时）"开始诊断"按钮 |

### 4.6 Commit ③ 验收

- [ ] `/nana/capture` 页面可访问（通过鉴权）
- [ ] 题图区域固定在上半屏，不随下半屏滚动
- [ ] 录音前：显示录音按钮 + "说说看"文案
- [ ] 录音中：波形动画 + mock 转写文字逐行出现 + "我听完了"按钮
- [ ] 录音后：自动切换到"帮你整理"tab + 轻反馈动画（0.3s fade-in）
- [ ] "我的话"tab 可编辑逐字稿（contentEditable）
- [ ] "再拍一道"按钮可重置状态，已拍计数递增
- [ ] 累积 3 道后显示"开始诊断"链接（链接暂定 `/nana/session`——预备第 3 阶段）
- [ ] 布局在 390px 手机宽度不崩

---

## 5. Commit ④：单题轻反馈 API + 完善的反馈 UI

### 5.1 轻反馈 API（规则版 stub）

**文件**：`src/app/api/nana/cases/[id]/feedback/route.ts`

**请求**（POST）：
```typescript
{
  transcript: string;   // 逐字稿文本
  aiSummary?: string;   // AI 提要（可选，本阶段可能为空）
}
```

**响应**（200）：
```typescript
{
  hint: string;
  relatedTags: string[];
  isPreliminary: true;   // 始终为 true，标识"不是终诊"
}
```

**规则版逻辑**（不调 LLM，纯关键词匹配）：
- 搭配"定义域"、"值域" → hint = "你谈到定义域/值域相关的判断，可能和函数的定义域优先意识有关"
- 搭配"完全平方"、"配方"、"平方" → hint = "你提到的配方法是一种重要工具，可能和完全平方公式的灵活运用有关"
- 搭配"算错"、"不会"、"不懂" → hint = ""没关系，这反而帮我们发现了需要关注的地方"
- 无匹配 → hint = "收到这道题。你谈到的这些都帮你记下来了，再拍几道后我们一起看看有没有规律"

```typescript
const KEYWORD_RULES = [
  { keywords: ["完全平方", "配方", "平方"], hint: "你提到配方法——可能和完全平方公式的灵活运用有关。这只是初步线索，不是最终判断。" },
  { keywords: ["定义域", "值域"], hint: "你谈到定义域/值域相关的判断——可能和函数的定义域优先意识有关。这只是初步线索，不是最终判断。" },
  { keywords: ["算错", "算不对", "算不出来"], hint: "没关系，这反而帮我们找到了需要关注的地方。再拍几道后我们一起看看。" },
];
```

**文件**：`src/app/api/nana/cases/[id]/feedback/route.ts`（完整的 POST handler）

遵循现有 API 模式：鉴权 → 校验 → 规则匹配 → 返回 JSON。

### 5.2 LightFeedback 组件完善

**文件**：`src/components/nana/capture/light-feedback.tsx`

将 Commit ③ 的骨架完善为真实组件：

```
Props: { transcript: string; caseId?: string }
行为：
  - 转录完成后自动调用 POST /api/nana/cases/:id/feedback
  - 显示返回的 hint 文字（带 fade-in 动画）
  - 底部显示 relatedTags 作为标签（仅装饰，不可点击）
  - 始终显示"不是终诊"标识
  - "再拍一道"按钮

状态：
  - loading: 显示"正在看你的描述…"（≤1s）
  - loaded: 显示 hint + tags + 按钮
  - error: 显示"这条先记下来了"（fallback）
```

### 5.3 测试

**文件**：`src/__tests__/unit/nana/feedback-rules.test.ts`

测试关键词匹配规则的边界情况：
- 匹配"配方法"关键词 → 返回配方法 hint
- 多关键词匹配 → 优先第一个
- 无关键词匹配 → 返回默认 hint
- 空字符串 → 返回默认 hint

**文件**：`src/__tests__/integration/nana/feedback-api.test.ts`

API 集成测试：
- `POST /api/nana/cases/:id/feedback` — 返回 hint
- 校验 transcript 缺失 → 400

### 5.4 Commit ④ 验收

- [ ] `POST /api/nana/cases/:id/feedback` — 输入逐字稿返回 hint
- [ ] 关键词规则正确触发（"配方"→配方法 hint、"定义域"→定义域 hint）
- [ ] 无匹配时返回默认 hint
- [ ] 前端 3 秒内出现轻反馈文字（带 fade-in）
- [ ] 始终显示"只是初步线索"或等价措辞
- [ ] 不出现"终诊""诊断结论""判断"等词
- [ ] 不出现掌握度/百分比/分数
- [ ] `test:nana:unit` 通过 + `test:nana:integration` 通过
- [ ] 整体流程走通：首页 → 采集壳 → 拍题(mock) → 录音(mock) → 逐字稿 → 轻反馈 → 再拍一道

---

## 6. 文件变更总清单

### 新增文件

| 文件 | 所属 Commit | 说明 |
|------|:--:|------|
| `prisma/schema.prisma`（末尾追加） | ① | Case + Artifact 两个 model |
| `src/app/api/nana/cases/route.ts` | ① | POST 创建 case |
| `src/app/api/nana/cases/[id]/route.ts` | ① | GET 读取 case |
| `src/lib/nana/nana-api-client.ts` | ① | 前端 API 客户端 |
| `src/app/nana/layout.tsx` | ② | 段级鉴权 layout |
| `src/app/nana/page.tsx` | ② | 场景入口首页 |
| `src/app/nana/capture/page.tsx` | ③ | 采集壳主页面 |
| `src/components/nana/capture/question-image-viewer.tsx` | ③ | 题图查看器 |
| `src/components/nana/capture/voice-recorder.tsx` | ③ | 录音控件壳 |
| `src/components/nana/capture/transcription-panel.tsx` | ③ | 逐字稿面板 |
| `src/components/nana/capture/light-feedback.tsx` | ③ → ④ | 轻反馈组件 |
| `src/components/nana/capture/mock-data.ts` | ③ | mock 数据源 |
| `src/app/api/nana/cases/[id]/feedback/route.ts` | ④ | 轻反馈 API |
| `src/__tests__/unit/nana/case-api.test.ts` | ① | case API 客户端单测 |
| `src/__tests__/unit/nana/feedback-rules.test.ts` | ④ | 反馈规则单测 |
| `src/__tests__/integration/nana/case-api.test.ts` | ① | case API 集成测 |
| `src/__tests__/integration/nana/feedback-api.test.ts` | ④ | feedback API 集成测 |
| `src/__tests__/setup/nana/` | ① | 测试辅助（如需要） |

### 修改文件

| 文件 | 所属 Commit | 修改内容 |
|------|:--:|----------|
| `package.json` | ① | 追加 `test:nana:unit` / `test:nana:integration`，更新 `test:all` |

### 碰不得的文件（再次确认）

| 文件 | 理由 |
|------|------|
| `src/app/layout.tsx` | 根 layout，绝不修改 |
| `src/app/globals.css` | 全局样式，绝不修改 |
| `src/app/page.tsx` | 首页，绝不修改 |
| `src/lib/auth.ts` | Auth 配置，只 import 不改 |
| `src/lib/prisma.ts` | Prisma client，只 import 不改 |
| `src/components/ui/*` | UI 组件库，只 import 不改 |
| 所有上游已有 model | 铁律 3 |

---

## 7. 验收标准汇总（全阶段通过条件）

- [ ] **Commit ①** ✅ — Prisma 迁移 + case API 全通过（测试容器）
- [ ] **Commit ②** ✅ — `/nana` 首页双状态（有记录/空状态）通过鉴权
- [ ] **Commit ③** ✅ — 采集壳完整交互流（拍题→录音→逐字稿→轻反馈→再拍）
- [ ] **Commit ④** ✅ — 规则版轻反馈 + 关键词匹配 + 全链路走通
- [ ] **措辞全局检查** ✅ — 无"错""失败""得分""未掌握""正确率"等词
- [ ] **零上游修改** ✅ — `git diff --name-only` 仅含新增文件和 `package.json` 追加
- [ ] **测试通过** ✅ — `npm run test:all` 退出码 0
- [ ] **production build 通过** ✅ — `npm run build` 无错误

---

> 本文档可直接传给 execute-agent 按照 commit 拆分顺序逐段实现。
> 开始前用户确认：Prisma migration 属于破坏性操作（铁律 1），需用户明确同意后再执行 commit ① 的 migration。
