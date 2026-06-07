# 消防整改闭环助手部署与公网接入说明

本文用于试点项目上线前的部署确认，覆盖 Windows 服务、PM2、Nginx 反向代理、Cloudflare Tunnel 和 Node 直接 HTTPS 三种公网路径。

## 1. 推荐运行方式

首个真实试点推荐：

```text
Node 服务监听 127.0.0.1:5174
前置 Nginx / 宝塔 / Cloudflare Tunnel 提供公网 HTTPS
PUBLIC_BASE_URL 使用公网 HTTPS 域名
```

这样可以避免 Node 直接占用 443 端口，也方便证书续期和网关层限流。

## 2. 基础准备

服务器建议：

```text
Windows Server 2019/2022 或 Windows 10/11
Node.js 20 LTS 或 22 LTS
磁盘剩余空间不少于 20GB
服务器可以访问企业微信/钉钉机器人接口
```

首次安装：

```powershell
cd D:\1pro\strong-workflow
npm install
npm run build
```

准备 `.env.local`：

```powershell
HOST=127.0.0.1
PORT=5174
PUBLIC_BASE_URL=https://xf-flow.example.com
VITE_API_BASE=https://xf-flow.example.com/api
DATA_FILE=data/hazards.json
UPLOAD_DIR=server/uploads
MAX_UPLOAD_MB=15
ALLOWED_ORIGINS=https://xf-flow.example.com,http://127.0.0.1:5173,http://localhost:5173
ENABLE_REMINDER_JOB=true
REMINDER_INTERVAL_MINUTES=60
```

## 3. 手动启动

适合开发、自测或上线前临时演示：

```powershell
cd D:\1pro\strong-workflow
npm run server
```

检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\health-check.ps1
```

## 4. Docker Compose 启动

适合本地 Docker Desktop、测试服务器和后续标准化部署。生产镜像使用单容器模式：Express 提供 API 和前端静态产物，`data/` 与 `server/uploads/` 挂载到宿主机，方便备份和迁移。

首次启动：

```powershell
cd D:\1pro\strong-workflow
Copy-Item .env.docker.example .env.docker
powershell -ExecutionPolicy Bypass -File scripts\docker-up.ps1 -Build
```

也可以直接用 Compose：

```powershell
docker compose up -d --build
```

访问：

```text
http://127.0.0.1:5174
http://127.0.0.1:5174/api/health
```

查看容器：

```powershell
docker compose ps
docker compose logs -f strong-workflow
```

停止：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\docker-down.ps1
```

健康检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\docker-health.ps1
```

Docker 运行时关键配置在 `.env.docker`：

```text
PUBLIC_BASE_URL=http://127.0.0.1:5174
DATA_FILE=/app/data/hazards.json
NOTIFICATION_FILE=/app/data/notifications.json
UPLOAD_DIR=/app/server/uploads
ALLOWED_ORIGINS=http://127.0.0.1:5174,http://localhost:5174
```

如果要绑定其他宿主机端口：

```powershell
$env:HOST_PORT='8080'
docker compose up -d
```

此时 `.env.docker` 里的 `PUBLIC_BASE_URL` 也应改成：

```text
PUBLIC_BASE_URL=http://127.0.0.1:8080
ALLOWED_ORIGINS=http://127.0.0.1:8080,http://localhost:8080
```

## 5. PM2 启动

适合试点服务器已经安装 Node 运维工具的场景。

安装 PM2：

```powershell
npm install -g pm2
```

启动：

```powershell
cd D:\1pro\strong-workflow
pm2 start server/index.js --name strong-workflow
pm2 save
```

查看状态：

```powershell
pm2 status
pm2 logs strong-workflow
```

重启：

```powershell
pm2 restart strong-workflow
```

开机自启。Windows 下推荐配合 `pm2-windows-startup`：

```powershell
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

## 6. Windows 服务启动

适合客户服务器要求“服务化运行”的场景。推荐使用 NSSM。

1. 下载 NSSM 并放到固定目录，例如 `C:\tools\nssm\nssm.exe`。
2. 创建服务：

```powershell
C:\tools\nssm\nssm.exe install StrongWorkflow
```

在弹窗里填写：

```text
Application path: C:\Program Files\nodejs\node.exe
Startup directory: D:\1pro\strong-workflow
Arguments: server/index.js
```

建议在 NSSM 的 I/O 页配置日志：

```text
Output: D:\1pro\strong-workflow\server\service.out.log
Error: D:\1pro\strong-workflow\server\service.err.log
```

启动服务：

```powershell
Start-Service StrongWorkflow
Get-Service StrongWorkflow
```

重启服务：

```powershell
Restart-Service StrongWorkflow
```

删除服务：

```powershell
Stop-Service StrongWorkflow
C:\tools\nssm\nssm.exe remove StrongWorkflow confirm
```

## 7. 公网路径 A：Nginx / 宝塔反向代理

Node 保持监听本地：

```text
http://127.0.0.1:5174
```

如果使用 Docker Compose，Nginx 仍然反代宿主机端口：

```text
http://127.0.0.1:5174
```

Nginx 示例：

```nginx
server {
    listen 443 ssl;
    server_name xf-flow.example.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    client_max_body_size 20m;

    location / {
        proxy_pass http://127.0.0.1:5174;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

上线检查：

```text
https://xf-flow.example.com
https://xf-flow.example.com/api/health
```

## 8. 公网路径 B：Cloudflare Tunnel

适合客户服务器没有公网 IP，或不方便开放入站端口的场景。

安装并登录 `cloudflared` 后，创建 tunnel：

```powershell
cloudflared tunnel create strong-workflow
cloudflared tunnel route dns strong-workflow xf-flow.example.com
```

配置 `config.yml`：

```yaml
tunnel: strong-workflow
credentials-file: C:\Users\Administrator\.cloudflared\strong-workflow.json

ingress:
  - hostname: xf-flow.example.com
    service: http://127.0.0.1:5174
  - service: http_status:404
```

启动：

```powershell
cloudflared tunnel run strong-workflow
```

安装为服务：

```powershell
cloudflared service install
```

`.env.local` 仍然要使用公网域名：

```text
PUBLIC_BASE_URL=https://xf-flow.example.com
ALLOWED_ORIGINS=https://xf-flow.example.com,http://127.0.0.1:5173,http://localhost:5173
```

## 9. 公网路径 C：Node 直接 HTTPS

仅建议在没有反向代理、且证书路径和 443 端口都能由 Node 控制时使用。

`.env.local` 示例：

```text
HOST=0.0.0.0
PORT=443
PUBLIC_BASE_URL=https://xf-flow.example.com
HTTPS_CERT_FILE=certs/fullchain.pem
HTTPS_KEY_FILE=certs/privkey.pem
ALLOWED_ORIGINS=https://xf-flow.example.com
```

启动：

```powershell
npm run server
```

注意：

```text
443 端口可能需要管理员权限。
证书过期前需要人工或自动续期。
不建议在同一台机器上同时让 Nginx 和 Node 占用 443。
```

## 10. CI/CD 自动化构建

完整 CI/CD 说明见 [CI_CD.md](D:/1pro/strong-workflow/CI_CD.md)。

仓库已提供 GitHub Actions：

```text
.github/workflows/ci-cd.yml
```

触发条件：

```text
push 到 main
push 到 v2/rapid-iteration
创建 v* tag
pull_request
手动 workflow_dispatch
```

流水线内容：

```text
npm ci
npm run build
docker build
非 PR 时推送镜像到 GHCR：ghcr.io/wwujie9/strong-workflow
```

推荐发布方式：

```powershell
git tag v0.2.0
git push origin v0.2.0
```

服务器拉取新镜像后更新：

```powershell
docker compose pull
docker compose up -d
docker compose ps
```

如果当前使用本地源码构建，不依赖 GHCR：

```powershell
git pull
docker compose up -d --build
```

如果使用 GHCR 镜像部署：

```powershell
$env:APP_VERSION='v0.2.0'
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## 11. 上线前必查

```powershell
npm run build
powershell -ExecutionPolicy Bypass -File scripts\health-check.ps1
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
```

必须确认：

```text
公网首页可以打开
/api/health 可以打开
整改链接在手机企业微信/钉钉里可以打开
上传图片后 publicUrl 可以打开
机器人不是 dry-run
PDF 闭环包可以打开并另存为 PDF
备份 zip 能生成
```

## 12. 日常运维

每天检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\health-check.ps1
```

每天备份：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
```

查看通知日志：

```text
https://xf-flow.example.com/api/notifications
```

查看服务日志：

```text
PM2：pm2 logs strong-workflow
Windows 服务：server\service.out.log 和 server\service.err.log
手动启动：当前 PowerShell 窗口
```
