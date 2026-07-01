# Codex Memory Decision: CI 镜像部署与真实采集门禁

Date: 2026-07-01
Status: adopted
Type: decision

## Context

NanaWrongBook 需要让孩子用手机访问真实链接测试拍题和录音。用户在 Windows 上开发，本地 Docker Desktop 多次卡在 Starting engine；本地隧道又受 VPN/代理/DNS 影响，稳定性不够。项目已经迁移到腾讯云香港服务器 + Caddy HTTPS + GHCR 镜像部署。

Phase 1.5 把 `/nana/capture` 从 mock 页面改成真实采集壳：真拍照、可选真录音、调用 Case/Artifact API 存库，但暂不接 ASR/VLM/诊断。

## Decision

1. 生产部署采用 CI 镜像路线：GitHub Actions 运行测试容器、构建生产镜像并推送 GHCR；腾讯云服务器只执行 pull/up，不在服务器现场 build。
2. Windows 本地 Docker Desktop 不再作为上线硬门禁；本地 Docker 不可用时必须明说，不能宣称测试容器已通过。
3. GitHub Actions 的测试容器仍是硬门禁；CI 不绿不得合入 `main` 或部署。
4. 禁止用生产容器或生产 SQLite 跑测试。
5. Phase 1.5 真实采集壳只做收集闭环，不说“诊断完成”；诊断反馈闭环另行设计。
6. 录音组件必须同时有主动 UI 禁用和被动 unmount cleanup，防止旧 MediaRecorder 后台回写污染新 case。

## Rationale

- 用户的核心测试场景必须在手机公网链接上完成，本地 Docker 问题不应反复阻塞上线。
- CI runner 与服务器环境比 Windows 本机更稳定，也更接近可审计发布流程。
- “服务器只跑不编译”降低 2C2G 服务器资源压力，并让失败前移到 CI。
- 真实采集壳先验证“孩子愿不愿意拍题并说想法”，不应被 ASR/VLM/诊断全链路拖大范围。

## Alternatives Rejected

- 继续要求本地 Docker 作为硬门禁：与用户机器长期不稳定事实冲突。
- 服务器现场 build：已经遇到依赖、网络、类型修复未合入 main 等发布风险。
- 用生产容器跑测试：会污染生产 SQLite，违反隔离原则。
- Phase 1.5 同时接 ASR/VLM/诊断：扩大 MVP 范围，增加上线风险。

## Consequences

- 本地验证重点是 `npm.cmd run build` 和可跑则跑的局部测试；最终质量闸门看 GitHub Actions。
- 需要关注 CI 配置漂移，确保测试容器真的使用 test.db 护栏。
- Base64 内联 SQLite 是 Phase 1.5 的临时设计债，超过阈值要迁移对象存储。
- 真机验收必须包含手机拍照、录音权限、保存入库、无 mock 残留。

## Revisit Conditions

- 本地 Docker Desktop 以后长期稳定，且用户希望恢复本地测试容器硬门禁。
- GitHub Actions 成本、权限或可用性成为瓶颈。
- case 数超过 100 或 `dev.db` 超过 50 MB。
- Phase 1.5 上线后发现录音/拍照真机兼容性问题高发。
