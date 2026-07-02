# 移动端性能修复 · 第一轮执行计划

> 基于 `doc/auditlog/mobile-perf-audit-2026-07-02.md`
> 评审反馈：旧测试账号数据直接清理。第一轮优先：路由反馈 / Canvas memo / 题图加载复核。

---

## 第一轮 3 项（2026-07-02 已执行）

### 1. ActionCard 即时 pressed 反馈（P0-2）

**文件**：`src/components/nana/shared/action-card.tsx`

**改动**：
- 从纯 `<Link>` 改为 `"use client"` + `useRouter` + `useState`
- 点击后立即 `setPressed(true)` → 卡片 `scale-[0.97]` + `bg-[#F5EFE6]` + `opacity-90`
- pressed 态保持到路由切换完成（组件 unmount），消除 300-800ms 感知延迟

**验证**：真机 slow 3G throttle 下点击卡片 → 即时视觉反馈 → 不白屏

### 2. KnowledgeMapCanvas React.memo（P0-4）

**文件**：`src/components/nana/knowledge-map/knowledge-map-canvas.tsx`

**改动**：`export default memo(KnowledgeMapCanvas)`，1 行

**验证**：React DevTools Profiler 确认浮层打/关、切视图时不 re-render

### 3. 题图 blob URL 解码缓存（P1-4）

**文件**：`src/components/nana/knowledge-map/recent-cases-list.tsx`

**改动**：
- 新增 `blobUrlCache` Map（caseId → blob URL）
- `base64ToBlobUrl()` 转换函数
- `applyCase()` 中先查 blob URL 缓存，命中直接用，不命中转换后缓存
- `<img src={blobUrl}>` 替代 `<img src={base64}>`，浏览器无需重复解码

**验证**：Chrome Performance 录制确认重开同题图无 Decode Image 事件

---

## 数据清理（2026-07-02 已执行）

- 服务器：`119.28.42.208`，备份至 `/opt/nana/data/dev.db.backup-*`
- 清理范围：测试账号 `lujingpingly2006@126.com` 的 Case/Artifact/CaseKnowledgeTag
- 清理结果：删除 5 Case / 10 Artifact / 2 CaseKnowledgeTag → 清后均为 0
- 不受影响：KnowledgeNode=48、KnowledgeEdge、Mainline、StudentNodeState 等图谱数据

---

## 第二轮预告（待启动）

| # | 项 | 优先级 |
|---|-----|:------:|
| 4 | 首页+地图页数据缓存去重 | P0-3 |
| 5 | bundle 拆包 + lazy load | P1-1 |
| 6 | 缩略图端点 | P1-2 |
