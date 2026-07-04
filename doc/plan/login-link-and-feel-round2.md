# 登录链路专项 + 低风险体感修复 · 开发计划

> 关联规格: doc/plan/mobile-smoothness-round2-2026-07-03.md（修订版，本轮只取子集）
> 调研依据: doc/research/手机慢调研报告.md
> 计划日期: 2026-07-04
> 预计影响: `src/app/login/page.tsx`、`src/app/nana/page.tsx`、`next.config.ts`、`package.json`

---

## 1. 大白话概述

孩子在手机上打开应用，从登录到看到首页入口卡，中间会卡几秒。我们这轮只做四件小事：

1. **登录成功直接进 /nana**——跳过上游首页那一步多余跳转，省掉一次页面加载。
2. **登录按钮即时反馈**——点了"进入"后按钮立刻变成"正在进入…"并锁住，防止连点。开发环境能看到每一步花了多久。
3. **/nana 首屏三入口先出来**——不等地图 API 返回就把三个入口卡显示出来，底下的统计信息慢慢加载。
4. **跑一次 bundle 分析**——只出报告，不拆包，搞清楚 2.67MB 里面到底什么占大头。

**为什么做这些**：调研报告指出，最大的杠杆是 base64→COS 和 PWA，但那些风险高、改动大。本轮只挑低风险、马上能感知到改善的事，先把"登录到看到入口"这段链路磨顺。

---

## 2. 任务分解

### 任务 1：登录成功后直跳 /nana（⚠️上游文件修改）

- [ ] 把 `src/app/login/page.tsx` 里 `router.push("/")` 改成 `router.push("/nana")`
- [ ] commit message 标注 `⚠️上游文件修改`

**现状**：登录成功后跳到上游首页 `/`（一个 28KB 的大页面），用户还要再点一次才到 `/nana`。
**改后**：登录成功直接进 `/nana`，少一次页面加载和重定向。

---

### 任务 2：登录按钮即时反馈 + 耗时埋点

- [ ] 登录提交后按钮 `disabled`，文字变成"正在进入…"
- [ ] 防重复提交（`loading` 状态已在，加 `useRef` 锁防止极速双击）
- [ ] 开发环境 `console` 输出 signIn 耗时和跳转耗时

**现状**：登录提交后按钮只变灰（`disabled={loggingIn}`），没有文字反馈，用户不知道发生了什么。
**改后**：点"进入"后按钮立刻显示"正在进入…"，开发环境能看到：
- signIn() 从调用到返回花了多久
- signIn 返回到 /nana 页面渲染花了多久

#### 技术细节

```tsx
// src/app/login/page.tsx — handleSubmit 内

const submitLock = useRef(false);  // 防极速双击

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (submitLock.current || loggingIn) return;  // 双重锁
  submitLock.current = true;

  const signInStart = performance.now();
  if (process.env.NODE_ENV === 'development') {
    console.log('[login-timing] signIn start');
  }

  // ... 现有 signIn 逻辑 ...

  const signInEnd = performance.now();
  if (process.env.NODE_ENV === 'development') {
    console.log(`[login-timing] signIn took ${(signInEnd - signInStart).toFixed(0)}ms`);
  }

  router.push("/nana");

  if (process.env.NODE_ENV === 'development') {
    console.log('[login-timing] router.push("/nana") called');
  }
};
```

**按钮文字**：`loggingIn ? "正在进入…" : "进入"`

---

### 任务 3：/nana 首屏三入口先显示

- [ ] 去掉 `loading` 初始值 `true`，改为 `false`
- [ ] 底部统计区在 mapData 为 `null` 时不显示骨架，直接显示空态提示或不显示
- [ ] map API 返回后自然更新底部区域（recap 或 empty hint）

**现状**：
```tsx
const [loading, setLoading] = useState(true);  // ← 初始 true，显示骨架
// ...
{loading ? <骨架> : hasRecords ? <recap> : <EmptyHint />}
```
三个 ActionCard 其实**已经是始终渲染**的（第 94-120 行），但底部骨架在 map API 返回前一直闪着，给用户"页面还没好"的感觉。

**改后**：
```tsx
const [loading, setLoading] = useState(false);  // ← 初始 false
// ...
// mapData 为 null 且 loading 为 false 时，直接显示 EmptyHint（不闪骨架）
// map API 返回后，hasRecords 变化，底部自然更新
{loading ? (
  <骨架 />
) : hasRecords ? (
  <recap 提示 />
) : (
  <EmptyHint />
)}
```

**效果**：
- 页面一出来就有三个入口卡 + "不急，先拍一道试试"的空态提示
- map API 在后台加载，返回后底部自动更新
- 用户不需要等 map API 就能点入口开始操作

**注意**：`useEffect` 内的 `setLoading(true)` 保留——session 加载后触发 map API 时短暂显示骨架是合理的（此时三入口已可见，骨架在下方不影响操作）。

#### 关于 useEffect 中 setLoading(true) 的处理

为了彻底消除"空态闪 → 骨架闪 → recap"的三段跳，更好的做法是：

```tsx
// 去掉 loading 状态，改用 mapData 是否为 null 来判断
// mapData === null → 还没拿到数据 → 底部不显示（或显示极淡占位）
// mapData !== null → 有数据 → 显示 recap 或 empty hint
```

但这样改动稍大。**本轮保守做法**：只改初始值 `true` → `false`，保留现有逻辑。session 加载后 useEffect 会 `setLoading(true)` 短暂显示骨架，但这在三入口已经可见之后，不影响操作。

---

### 任务 4：Bundle 分析（只输出报告，不拆包）

- [ ] 安装 `@next/bundle-analyzer` 为 devDependency
- [ ] 在 `next.config.ts` 加 bundle analyzer wrapper
- [ ] 运行 `ANALYZE=1 npm.cmd run build`
- [ ] 把分析结果写入 `doc/research/bundle-analysis-2026-07-04.md`
- [ ] 识别 2.67MB 里最大的 shared chunk 和重依赖
- [ ] 不新增大依赖，不做 PWA，不做对象存储迁移

#### 技术细节

```ts
// next.config.ts 顶部加
import withBundleAnalyzer from '@next/bundle-analyzer';

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === '1',
});

// export default 的对象包一层
export default analyzer({
  // ... 现有 next.config 内容 ...
});
```

```bash
# 安装
npm.cmd install -D @next/bundle-analyzer

# 运行分析
set ANALYZE=1 && npm.cmd run build
```

**分析报告应包含**：
- client 端 chunk 列表（按大小降序，top 10）
- server 端 chunk 列表（按大小降序，top 10）
- 最大的 shared chunk 里包含哪些模块
- 重依赖识别（recharts、katex、react-markdown、react-image-crop、lucide-react 等）
- 调研报告建议的 `optimizePackageImports` 可行性评估（`lucide-react`、`date-fns`）

**调研报告关键发现（供分析参考）**：
- App Router 已按路由段自动 code splitting，2.67MB 说明有巨大的 shared chunk 或重依赖被 eager import
- `"use client"` 不等于不 SSR——73 个客户端组件本身不是问题，问题在它们全被打进了客户端 bundle
- 常见"隐形 2MB"来源：图标库 barrel import、moment（你们用的是 date-fns ✓）、整个 UI 组件库、相机/录音/canvas 重逻辑打进首屏

---

## 3. 文件变更清单

| 文件 | 操作 | 说明 | 上游文件? |
|------|------|------|:---:|
| `src/app/login/page.tsx` | 修改 | ① `router.push("/")` → `router.push("/nana")` ② 按钮反馈 ③ 耗时埋点 ④ 防重复提交 | ⚠️是 |
| `src/app/nana/page.tsx` | 修改 | `loading` 初始值 `true` → `false` | 否（nana 自有文件） |
| `next.config.ts` | 修改 | 加 bundle analyzer wrapper | 否（项目级配置） |
| `package.json` | 修改 | 加 `@next/bundle-analyzer` devDependency | 否 |
| `doc/research/bundle-analysis-2026-07-04.md` | 新增 | bundle 分析报告 | 否 |

---

## 4. 验收标准

### 手动验收（手机浏览器）

- [ ] **登录直跳**：手机上登录成功后直接进入 `/nana`，不经过 `/` 首页
- [ ] **按钮反馈**：点"进入"后按钮文字变成"正在进入…"，按钮灰掉不可再点
- [ ] **防重复提交**：快速连点登录按钮，只触发一次 signIn
- [ ] **首屏三入口**：/nana 页面打开后三个入口卡（拍一道题、知识地图、周末小检查）立刻可见可点，不等地图 API
- [ ] **底部异步更新**：地图 API 返回后底部区域自然更新（有记录显示 recap 提示，无记录显示 empty hint）

### 开发环境 console 验收

- [ ] 登录提交时 console 输出 `[login-timing] signIn start`
- [ ] signIn 返回后 console 输出 `[login-timing] signIn took XXXms`
- [ ] 跳转时 console 输出 `[login-timing] router.push("/nana") called`

### 构建验收

- [ ] `npm.cmd run build` 通过（不含 ANALYZE）
- [ ] `ANALYZE=1 npm.cmd run build` 通过，生成 `.next/analyze/` 报告
- [ ] `doc/research/bundle-analysis-2026-07-04.md` 已填写，包含 top 10 chunk 和重依赖识别

### Git 收口

- [ ] `git status` 干净
- [ ] commit message 标注 `⚠️上游文件修改`（login/page.tsx）
- [ ] 按独立意图拆 commit：
  - commit 1: `feat(login): 登录后直跳 /nana + 按钮即时反馈 ⚠️上游文件修改`
  - commit 2: `perf(nana): 首屏三入口不等 map API`
  - commit 3: `chore: bundle analyzer 配置 + 分析报告`

---

## 5. 风险与注意事项

| 风险 | 影响 | 缓解 |
|------|------|------|
| login/page.tsx 是上游文件，同步上游时可能冲突 | 低 | commit message 标注 `⚠️上游文件修改`，只改 1 行跳转目标 + 加反馈逻辑 |
| `loading` 初始值改 `false` 后，有记录用户会先看到 EmptyHint 再闪到 recap | 低 | 三入口已可见不影响操作；如闪动明显可在后续轮次改为 `mapData === null ? null : ...` |
| bundle analyzer 改了 next.config.ts，可能影响生产构建 | 低 | analyzer 只在 `ANALYZE=1` 时启用，正常 build 不受影响 |
| `@next/bundle-analyzer` 与 Next.js 16 兼容性 | 低 | 该库是 Vercel 官方维护，与 Next.js 版本同步更新 |

---

## 6. 技术附录

### A. login/page.tsx 现有 handleSubmit 结构

```tsx
// 现有（约第 20-45 行）
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoggingIn(true);
  setError(null);
  try {
    const result = await signIn("credentials", {
      redirect: false,
      username,
      password,
    });
    if (result?.error) {
      setError("账号或密码不对，再试试？");
      setLoggingIn(false);
      return;
    }
    router.push("/");  // ← 改成 "/nana"
  } catch {
    setError("网络有点问题，再试一次？");
    setLoggingIn(false);
  }
};
```

### B. 改后的 handleSubmit 伪代码

```tsx
const submitLock = useRef(false);

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (submitLock.current) return;        // 防极速双击
  submitLock.current = true;
  setLoggingIn(true);
  setError(null);

  const t0 = performance.now();
  if (process.env.NODE_ENV === 'development') {
    console.log('[login-timing] signIn start');
  }

  try {
    const result = await signIn("credentials", {
      redirect: false,
      username,
      password,
    });

    if (process.env.NODE_ENV === 'development') {
      console.log(`[login-timing] signIn took ${(performance.now() - t0).toFixed(0)}ms`);
    }

    if (result?.error) {
      setError("账号或密码不对，再试试？");
      setLoggingIn(false);
      submitLock.current = false;        // 失败后允许重试
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[login-timing] router.push("/nana") called');
    }
    router.push("/nana");
  } catch {
    setError("网络有点问题，再试一次？");
    setLoggingIn(false);
    submitLock.current = false;
  }
};
```

### C. 按钮文字改法

```tsx
// 现有
<Button disabled={loggingIn}>
  {loggingIn ? "..." : "进入"}
</Button>

// 改后
<Button disabled={loggingIn}>
  {loggingIn ? "正在进入…" : "进入"}
</Button>
```

### D. /nana page.tsx 改法

```tsx
// 第 47 行
// 现有
const [loading, setLoading] = useState(true);
// 改后
const [loading, setLoading] = useState(false);
```

仅此一行改动。`useEffect` 内的 `setLoading(true)` 保留不动。

### E. bundle analyzer next.config.ts 改法

```ts
// 现有（约第 1-3 行）
import type { NextConfig } from "next";

// 改后
import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";

const analyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "1",
});
```

```ts
// 现有（末尾）
export default nextConfig;

// 改后
export default analyzer(nextConfig);
```

### F. 调研报告中与本轮相关的关键结论

1. **App Router 已自动按路由段 code splitting**——2.67MB 说明有巨大的 shared chunk 或重依赖被 eager import，不是 73 个 `"use client"` 本身的问题
2. **`"use client"` 不等于不 SSR**——客户端组件默认仍 SSR，`"use client"` 只是标记 JS 要打进客户端 bundle
3. **第一步永远是定位**——`ANALYZE=1 next build` 看火焰图，别凭感觉
4. **常见"隐形 2MB"来源**：图标库 barrel import、整个 UI 组件库、相机/录音/canvas 重逻辑打进首屏
5. **`optimizePackageImports`** 可做 tree-shaking 优化（`lucide-react`、`date-fns`），但本轮只评估不实施
6. **中国 4G 环境**：gzip 900KB 首包要好几秒，确保腾讯云开了 Brotli 压缩

---

## 7. 本轮不做（明确暂缓）

以下项来自 mobile-smoothness-round2 计划，本轮**不做**，留待后续轮次：

| 暂缓项 | 原计划编号 | 暂缓原因 |
|--------|:---:|------|
| Web Worker 压图 | P0-E | 改动大、兼容性测试成本高 |
| PWA / Service Worker | P2-B | 需独立轮次，微信环境支持差 |
| base64 → COS 对象存储 | 调研报告第4节 | 涉及前后端全链路改动 |
| 上传进度反馈 | P1-D | 依赖 base64→COS 先做 |
| 大规模 Server/Client 拆分 | P1-A | 改动面大，需独立轮次 |
| 100dvh + viewport-fit | P0-A | 可与本轮并行但不纳入本轮范围 |
| 保存后浮动卡 | P0-C | 涉及交互重设计 |
| animate-slide-up CSS | P0-D | 可顺带做但非本轮核心 |
| 录音权限预检 | P1-C | 非登录链路 |
| map API 数据共享 | P1-B | 非本轮优先级 |

---

> 本计划等待用户确认后由 execute-agent 接手执行。
