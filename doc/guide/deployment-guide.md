# 真实验证部署指南

> 目标：让外甥女本周末能用手机访问 `/nana` 全链路。
> 方案：本地 Docker + Cloudflare Tunnel（数据不出电脑，无需云服务器）。

---

## Step 1：在你电脑上启动应用

```bash
# 进入项目目录
cd E:\nana

# 确保 .env 文件存在（已有则跳过）
# 确保环境变量包含正确的 DATABASE_URL

# 启动生产容器
docker compose up -d

# 确认启动成功
docker compose logs --tail=10
# 应显示：Server is running on http://localhost:3000

# 本地验证：浏览器打开 http://localhost:3000
# 确认能正常访问
```

**注意**：如果 3000 端口已被占用，需在 `docker-compose.yml` 中调整映射端口（如 `3002:3000`），并相应调整 tunnel 的目标地址。

---

## Step 2：安装 Cloudflare Tunnel

```bash
# 下载 cloudflared（Windows）
# 1. 浏览器打开 https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
# 2. 下载 Windows 64-bit 版本（cloudflared-windows-amd64.exe）
# 3. 重命名为 cloudflared.exe，放到 C:\Windows\System32\ 或任意 PATH 目录

# 验证安装
cloudflared --version
```

如果下载慢，可以用 winget：
```bash
winget install cloudflare.cloudflared
```

---

## Step 3：启动 Tunnel（不需要注册 Cloudflare 账号）

```bash
# 启动临时隧道（免费，无需任何配置）
cloudflared tunnel --url http://localhost:3000
```

输出示例：
```
2026-06-28T20:00:00Z INF +--------------------------------------------------------------------------------------------+
2026-06-28T20:00:00Z INF |  Your quick Tunnel has been created! Visit it at:                                          |
2026-06-28T20:00:00Z INF |    https://nana-xxx-yyy.trycloudflare.com                                                  |
2026-06-28T20:00:00Z INF +--------------------------------------------------------------------------------------------+
```

**关键**：这个命令会一直运行保持隧道连通。关掉它隧道就断了。

---

## Step 4：验证访问

1. 在你手机上打开浏览器
2. 输入上面生成的 `https://nana-xxx-yyy.trycloudflare.com`
3. 确认能正常访问 `/nana` 首页
4. 把网址添加到手机桌面（PWA）：
   - iPhone：分享按钮 → "添加到主屏幕"
   - Android：菜单 → "添加到主屏幕"
5. 确认离线图标正常显示

---

## Step 5：验证全链路（你自己先走一遍）

| 步骤 | 操作 | 预期 | 结果 |
|------|------|------|:--:|
| 1 | 打开 `/nana` | 看到首页（问候 + 两个行动卡） | |
| 2 | 点击"拍一下这道题" | 进入采集壳，题图显示 mock 题目 | |
| 3 | 点击录音按钮 | 波形动画 + mock 转写文字 | |
| 4 | 点击"我听完了" | 自动跳转到轻反馈（3 秒内） | |
| 5 | 点击"再拍一道" | 计数递增，重置状态 | |
| 6 | 回到首页，点击"看看我的知识地图" | 进入知识地图页 | |
| 7 | 回到首页，点击"做个周末小检查" | 进入 session 列表页 | |
| 8 | 点击"先从函数这条线看看" | 开始答题 | |
| 9 | 答完题 → 核对 → 提交 | 跳转报告页 | |
| 10 | 报告页 → "生成纸质包" | 纸质包预览（可打印） | |

---

## 使用时的注意事项

### 她使用时你的电脑需要保持开机 + 联网
- Docker 容器和 Tunnel 都跑在你的电脑上
- 她周末用的时候，你的电脑不能关机、不能休眠

### Tunnel URL 每次重启会变
- 每次运行 `cloudflared tunnel --url http://localhost:3000` 会生成新的随机 URL
- 建议：**每次她用时你开机启动 Tunnel，把新 URL 发她微信**
- 或者研究 Cloudflare 永久隧道（需域名），——首期用临时隧道就够了

### 数据安全
- 她的所有数据存在你电脑的 `./data/dev.db` 中
- Tunnel 只做 HTTPS 代理，不存储数据
- 云服务商（Cloudflare）只能看到加密流量，看不到内容
- 不存在第三方服务器上的用户数据

### 日志查看
```bash
# 查看应用日志
docker compose logs -f

# 查看 Tunnel 日志（在运行 cloudflared 的终端窗口）
# 标准输出即日志
```

---

## 附录：启用 HTTPS 支持（可选）

如果遇到 PWA 安装问题（部分浏览器要求 HTTPS 才能安装 PWA），Tunnel 本身已经提供 HTTPS，所以这部分通常不需要额外配置。

### 如果 Tunnel 不稳定

```bash
# 使用备用隧道方案：bore（更简单，但加密较弱）
npm install -g bore-cli
bore local 3000 --to bore.pub

# 或使用 Serveo（SSH 隧道，不需要安装）
ssh -R 80:localhost:3000 serveo.net
```

**推荐优先用 Cloudflare Tunnel**——加密更可靠，线路更稳定。
