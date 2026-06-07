# CI/CD 自动化构建与部署方案

本文说明 strong-workflow 的自动化构建、镜像发布和服务器更新流程。

## 1. 当前流水线

GitHub Actions 文件：

```text
.github/workflows/ci-cd.yml
```

触发条件：

```text
push main
push v2/rapid-iteration
push v* tag
pull_request main / v2/rapid-iteration
workflow_dispatch 手动触发
```

流水线步骤：

```text
1. checkout
2. setup node 22
3. npm ci
4. npm run build
5. docker build
6. 本地或测试环境执行 npm run e2e:docker
7. 非 PR 时推送镜像到 GHCR
```

镜像地址：

```text
ghcr.io/wwujie9/strong-workflow
```

## 2. 本地 Docker 快速部署

首次启动：

```powershell
cd D:\1pro\strong-workflow
powershell -ExecutionPolicy Bypass -File scripts\docker-up.ps1 -Build
```

检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\docker-health.ps1
docker compose ps
npm run e2e:docker
```

停止：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\docker-down.ps1
```

重新构建并启动：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\docker-up.ps1 -Build
```

拉取代码、备份、构建、重启和健康检查一体化更新：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
```

## 3. 生产服务器源码部署流程

适合客户服务器无法访问 GHCR，或希望从源码构建的场景：

```powershell
cd D:\1pro\strong-workflow
git pull
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
powershell -ExecutionPolicy Bypass -File scripts\docker-up.ps1 -Build
powershell -ExecutionPolicy Bypass -File scripts\docker-health.ps1
npm run e2e:docker
```

推荐直接使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
```

回滚方式：

```powershell
git log --oneline
git checkout <上一版本commit>
powershell -ExecutionPolicy Bypass -File scripts\docker-up.ps1 -Build
```

数据回滚使用：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 -ArchivePath backups\strong-workflow-YYYYMMDD-HHMMSS.zip
```

## 4. GHCR 镜像部署流程

适合服务器可以登录 GitHub Container Registry 的场景。

登录：

```powershell
docker login ghcr.io
```

拉取：

```powershell
docker pull ghcr.io/wwujie9/strong-workflow:v0.2.0
```

仓库已提供 `docker-compose.prod.yml`，用于直接拉 GHCR 镜像：

```powershell
$env:APP_VERSION='v0.2.0'
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

## 5. 推荐发布节奏

开发分支：

```text
v2/rapid-iteration
```

稳定后合入：

```powershell
git checkout main
git merge v2/rapid-iteration
git push origin main
```

打版本：

```powershell
git tag v0.2.0
git push origin v0.2.0
```

上线前：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
docker compose ps
powershell -ExecutionPolicy Bypass -File scripts\docker-health.ps1
npm run e2e:docker
```

上线后：

```powershell
docker compose logs -f strong-workflow
```

## 6. 持久化与备份

Compose 挂载：

```text
./data:/app/data
./server/uploads:/app/server/uploads
```

这些数据不会随镜像重建丢失：

```text
data/hazards.json
data/notifications.json
data/project-config.json
server/uploads/
```

每天至少执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
```

## 7. 自动化部署后续建议

后续可以继续补：

```text
GitHub Actions SSH 到服务器执行 docker compose pull/up
按 tag 自动发布 production
按 v2/rapid-iteration 自动发布 staging
服务健康失败时回滚
备份成功后才允许更新容器
把 npm run e2e:docker 作为 staging 必过门槛
```

首个真实试点建议先保持“人工确认后执行部署脚本”，避免自动发布误覆盖客户现场数据。
