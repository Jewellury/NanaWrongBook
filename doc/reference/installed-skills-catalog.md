# 已安装 Skill 清单

> 整理日期: 2026-06-19
> 用途: 速查当前环境可用的 skill，避免遗忘
> 维护: 新装/卸载 skill 后更新本表

---

## 开发流程类

| Skill | 用途 | 触发方式 |
|-------|------|----------|
| `plan` | 计划代理，产出 `doc/plan/<feature>-plan.md` | `/plan <需求>` |
| `execute` | 执行代理，按计划实现代码 | `/execute <计划名>` |
| `audit` | 审计代理，审查代码质量与计划一致性 | `/audit <计划名>` |
| `check` | 代码 diff/PR/issue 审查、发布前检查 | 看看代码/检查一下/合并前 |
| `verify` | 验证代码变更是否实际生效 | 验证 PR/确认修复/手动测试 |
| `hunt` | 排查报错/崩溃/回归，找根因 | 排查/报错/不工作/回归 |
| `think` | 出方案/分析架构/价值判断 | 出方案/怎么设计/值不值得 |

## Superpowers 类（everything-claude-code 插件）

| Skill | 用途 |
|-------|------|
| `everything-claude-code:plan` | 重述需求→评估风险→分步计划，等用户确认后才碰代码 |
| `everything-claude-code:code-review` | 代码审查（Go/Python/通用） |
| `everything-claude-code:tdd` | 测试先行工作流，强制红→绿→重构 |
| `everything-claude-code:go-review` | Go 代码专项审查 |
| `everything-claude-code:python-review` | Python 代码专项审查 |
| `everything-claude-code:security-review` | 安全漏洞检测 |
| `everything-claude-code:skill-create` | 从 git 历史分析编码模式，生成 SKILL.md |
| `everything-claude-code:evolve` | 将本能聚合成 skill/command/agent |
| `everything-claude-code:e2e` | Playwright E2E 测试生成与运行 |

## 设计/前端类

| Skill | 用途 |
|-------|------|
| `frontend-design` | 生产级前端界面，创造性、非模板化输出 |
| `design` | UI/组件/排版/截图驱动视觉设计 |
| `animate` | 动画/微交互/过渡效果 |
| `arrange` | 布局/间距/视觉层次优化 |
| `colorize` | 为单色界面增加色彩层次 |
| `distill` | 极简简化，去噪 |
| `polish` | 发布前最终质量打磨 |
| `typeset` | 字体/排印/可读性优化 |
| `wireframe-sketch` | 网格背景+marker 笔触手绘线框 |

## 研究/写作类

| Skill | 用途 |
|-------|------|
| `learn` | 六阶段深度研究→产出结构化文章 |
| `khazix-writer` | 数字生命卡兹克风格公众号长文 |
| `write` | 中英文润色/去 AI 味/审稿 |
| `deep-research` | 多源深度搜索→对抗验证→引用报告 |
| `hv-analysis` | 横纵分析法深度研究（产品/公司/概念） |
| `grill-me` | 拷问式需求压力测试，暴露盲区 |

## 记忆/上下文类

| Skill | 用途 |
|-------|------|
| `claude-mem:mem-search` | 跨会话持久记忆搜索 |
| `claude-mem:make-plan` | 分阶段实施计划（文档发现→设计→分步） |
| `claude-mem:do` | 执行分阶段计划 |
| `context-mode:context-mode` | 上下文模式工具，防上下文溢出 |

## 代码质量类

| Skill | 用途 |
|-------|------|
| `code-review` | PR 审查 |
| `review` | PR 审查（另一个入口） |
| `simplify` | 代码重构简化，去冗余 |
| `security-review` | 安全审查当前分支变更 |
| `health` | 配置/指令/agent 健康度审计 |

## 项目初始化类

| Skill | 用途 |
|-------|------|
| `init` | 初始化 CLAUDE.md，生成代码库文档 |
| `onboard` | 设计新用户引导流程和空状态 |
| `teach-impeccable` | 一次性设置项目设计规范到 AI 配置文件 |

## 幻灯片/演示类（deck-* 系列 20+）

| 类别 | 代表性 skill |
|------|-------------|
| 通用 | `deck-simple`, `deck-open-slide-canvas`, `deck-presenter-mode` |
| 风格化 | `deck-obsidian-claude`, `deck-hermes-cyber`, `deck-guizang-editorial` |
| 商业 | `deck-pitch`, `deck-product-launch`, `deck-blueprint` |
| 小红书 | `deck-xhs-pastel`, `deck-xhs-post`, `deck-xhs-white` |

## 可视化/图表类

| Skill | 用途 |
|-------|------|
| `frame-data-chart-nyt` | NYT 编辑级图表（折线/柱/范围带） |
| `frame-flowchart-sticky` | SVG 便利贴流程图 |
| `motion-frames` | 纯 CSS 循环动效（旋转环/地球仪/计时器） |
| `sprite-animation` | 像素美术+kinetic 字体解说帧 |
| `video-hyperframes` | Remotion 兼容连续帧动画 |

## 社交媒体卡片类

| Skill | 用途 |
|-------|------|
| `card-twitter` | 推特金句/数据卡 |
| `card-xiaohongshu` | 小红书知识卡片，多张联排 |
| `social-carousel` | 三张方形卡片轮播 |
| `social-reddit-card` | 拟真 Reddit 帖子卡 |
| `social-spotify-card` | Spotify Now Playing 风格卡 |
| `social-x-post-card` | 拟真 X 推文卡片 |
| `poster-hero` | 竖版海报/朋友圈分享图 |

## 页面/落地页类

| Skill | 用途 |
|-------|------|
| `saas-landing` | SaaS 单页落地页 |
| `pricing-page` | 三档定价+特性对比+FAQ |
| `waitlist-page` | 极简预发布等待列表 |
| `prototype-web` | 可点击的功能性 Web 原型 |
| `web-proto-brutalist` | Swiss industrial-print 风 |
| `web-proto-editorial` | Editorial-minimalist 风 |
| `web-proto-soft` | Apple 调性 |

## 仪表板/数据类

| Skill | 用途 |
|-------|------|
| `dashboard` | 固定侧栏+顶栏+KPI 网格+图表 |
| `live-dashboard` | Notion 风团队仪表板 |
| `data-report` | CSV/Excel/JSON → 可视化报告 |
| `finance-report` | 财务报告（KPI+收入/烧钱图+P&L） |
| `social-media-dashboard` | 多平台社媒分析 |
| `social-media-matrix` | 电影感多平台社媒分析 |
| `flowai-team-dashboard` | 团队管理后台三 tab |
| `kanban-board` | To do/In progress/In review/Done |

## 文档/排版类

| Skill | 用途 |
|-------|------|
| `kami` | 专业文档排版（简历/白皮书/PPT/落地页） |
| `doc-kami-parchment` | 暖羊皮纸底+墨蓝单色 accent |
| `docs-page` | 三栏文档页 |
| `article-magazine` | Substack/Medium 高级感长文排版 |
| `blog-post` | 杂志感长文（masthead+hero+figures） |
| `magazine-poster` | Sunday-paper 风格大字海报 |
| `digital-eguide` | 两页跨页电子指南 |

## 邮件/HR/运营类

| Skill | 用途 |
|-------|------|
| `email-marketing` | 产品发布邮件 |
| `invoice` | 标准发票 |
| `resume-modern` | 现代极简简历 A4 单页 |
| `hr-onboarding` | 首周日程+buddy+学习路径 |
| `meeting-notes` | 会议纪要 |
| `team-okrs` | 季度 OKR banner |
| `weekly-update` | 6-8 页横向滑动周报 |
| `pm-spec` | 产品需求规格 |
| `eng-runbook` | 服务概述+alerts+dashboards+操作命令 |

## 移动端/设备类

| Skill | 用途 |
|-------|------|
| `mobile-app` | 像素级 iPhone 15 Pro 边框截图 |
| `mobile-onboarding` | 三手机框并排引导页 |
| `mockup-device-3d` | iPhone+MacBook 3D 展架 |
| `gamified-app` | 游戏化任务应用三屏 |

## 特效/视觉类

| Skill | 用途 |
|-------|------|
| `frame-glitch-title` | 数字故障/像散偏移标题 |
| `frame-light-leak-cinema` | 胶片漏光+颗粒噪点 16:9 |
| `frame-liquid-bg-hero` | WebGL 流体置换背景 |
| `frame-logo-outro` | Logo 分块组装入场+glow |
| `frame-macos-notification` | 拟真 macOS 通知 banner |
| `vfx-text-cursor` | 光标拖光+彩色像散射线 |

## 金融类

| Skill | 用途 |
|-------|------|
| `wind-find-finance-skill` | 万得金融能力发现与安装路由 |
| `wind-mcp-skill` | 万得 Wind 金融数据查询 |

---

## 使用注意

1. **Superpowers 类 skill 需要 `.claude/agents/` 定义才能被 agent 自动调用**。当前项目只有 `.claude/commands/`（斜杠命令），没有 agent 定义，所以 superpowers skill 只能在对话中显式调用，不会被子代理自动触发。

2. **本表仅供参考**，实际可用 skill 以系统 prompt 中的注册清单为准。环境变化时需更新。

3. **skill 的触发依赖特定关键词**，详见各 skill 描述中的触发词列表。

---

> 整理自 2026-06-19 系统 prompt skill 注册清单
> 注：部分 deck/social/frame 类 skill 数量较多，本表按类别分组，未逐条列出全部 80+ skill
