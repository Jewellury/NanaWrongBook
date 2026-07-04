# 保存成功浮动卡片 · 执行日志

> 关联计划: 审计推荐方案 A（Toast 浮动卡片）
> 执行日期: 2026-07-03
> 执行者: execute-agent

## 背景

用户反馈手机端拍题提交后，"给这道题挂个知识点"按钮不可见。审计发现：
- 代码逻辑无 bug，按钮在 DOM 中
- 小屏手机（iPhone SE）flex-1 仅剩 233px，保存后底部区膨胀到 ~200px → 溢出视口
- iOS Safari `100vh` bug 让问题更严重
- `animate-slide-up` 动画从未定义过（两个组件动画一直是坏的）
- `saveMsg` 横幅与 `toast` 信息冗余

## 执行内容

### 前置修复

| 修复 | 文件 | 说明 |
|------|------|------|
| ✅ `animate-slide-up` 动画定义 | `src/app/globals.css` | `@theme { --animate-slide-up }` + `@keyframes slideUp`，修复 `recent-cases-list.tsx` 和 `knowledge-detail-card.tsx` 缺失的滑入动画 |
| ✅ `min-h-screen` → `min-h-dvh` | `src/app/nana/capture/page.tsx` | iOS Safari 动态视口高度适配 |

### Toast 浮动卡（方案 A）

**实现细节**：

1. 新增 `toastOpen` 状态，保存成功后设为 `true`（不再设 `saveMsg`）
2. 浮动卡使用 `fixed bottom-0` 定位，彻底脱离文档流溢出问题
3. 半透明遮罩层（`bg-black/15`），点击关闭浮动卡
4. 浮动卡包含：
   - ✓ 绿色确认横幅："已收好 · 识别稍后接入"
   - 琥珀色主按钮："给这道题挂个知识点" → 跳转 `?openCases=1`
   - 次要入口："去知识地图看看" / "再拍一道"
5. 信息冗余处理：`saveMsg` 和计数行在浮动卡显示时条件隐藏
6. 关闭浮动卡后回退显示文档流简化版按钮区（无 `saveMsg`）
7. `safe-area-inset-bottom` 适配（`pb-[max(1rem,env(safe-area-inset-bottom))]`）

### 更新审计报告

`doc/auditlog/audit-redesign-tag-entry-2026-07-03.md` 补充了前置修复记录和信息冗余处理设计。

## 验证

- ✅ `npm run build` 通过
- ✅ 代码风格一致
- ✅ 不涉及 DB schema 修改
- ✅ 不涉及 API 修改

## 偏离记录

无偏离。按审计推荐方案 A 执行，无额外改动。

## 下一步

- 合入 `main` 并推送
- 服务器 git pull + docker compose up -d --build
- 真机验证：拍题 → 保存 → 浮动卡片出现 → 可挂知识点 → 遮罩关闭 → 后备按钮区可见
