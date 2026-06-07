# 快速复制工作流验收手册

这份手册用于把当前消防整改闭环助手复制到下一家客户，或结合现有流量站点做入口跳转时，确认“站点能打开、流程能跑、配置能复用、交付物能导出”。

## 1. 本地 Docker 标准验收

```powershell
cd D:\1pro\strong-workflow
powershell -ExecutionPolicy Bypass -File scripts\docker-up.ps1 -Build
powershell -ExecutionPolicy Bypass -File scripts\docker-health.ps1
npm run e2e:docker
```

`npm run e2e:docker` 会验证：

```text
Docker API 健康检查
客户模板库可复用
真实试点 30 条隐患初始化
真实客户 CSV 模板样例
状态机阻断错误操作
单条分派 API
图片/文件上传
整改提交
复核通过
复核驳回与补证
自动催办
机器人 dry-run 通知与最近通知状态
项目配置导入导出
模板变更审计随配置包保留
站点首页可作为复制工作流入口
```

脚本默认会恢复原始隐患数据和项目配置，便于反复跑验收。通知日志和上传测试文件会保留，用于证明机器人 dry-run 和文件上传链路可用。

## 2. 复制到下一家客户

1. 在“项目初始化”里选择最接近的客户模板。
2. 修改客户名称、项目名称、维保负责人、责任人名单、复核人名单。
3. 导出配置包，作为该客户的初始化配置。
4. 下一家客户部署完成后导入配置包。
5. 用 `samples/customer-hazards-template.csv` 整理首批 30 条隐患。
6. 在页面完成 CSV 导入预览，确认字段映射和责任人/复核人。
7. 应用批量分派建议，复制整改群消息和复核群消息。
8. 让 1 条隐患完成整改提交、复核通过、闭环包导出。
9. 用 `npm run e2e:docker` 做部署级自动验收，再用页面做客户现场演示验收。

## 3. 结合现有流量站点

现有站点不需要重做工作流，只需要提供清晰入口：

```text
入口名称：消防隐患整改闭环
入口地址：https://你的域名/
责任人整改链接：https://你的域名/#rectify/<隐患ID>
复核人复核链接：https://你的域名/#review/<隐患ID>
```

已提供可直接复制的入口组件：

```text
integrations/existing-site-entry.html
```

使用方法：

1. 打开 [existing-site-entry.html](D:/1pro/strong-workflow/integrations/existing-site-entry.html)。
2. 将 `data-workflow-origin` 改成 strong-workflow 的公网 HTTPS 地址。
3. 将 `data-demo-hazard-id` 改成客户现场当前隐患 ID，或保留 `real-001` 作为演示入口。
4. 将整段 HTML 放到客户现有官网、内部门户、CMS 页面或公众号菜单落地页。
5. 执行 `npm run check:integration`，确认入口组件包含工作台、整改、复核和复制入口。

上线前必须确认：

```text
PUBLIC_BASE_URL 已改成公网 HTTPS 域名
ALLOWED_ORIGINS 已包含公网 HTTPS 域名
整改链接在企业微信/钉钉内置浏览器能打开
复核链接在企业微信/钉钉内置浏览器能打开
上传文件 publicUrl 能从公网访问
机器人消息里的链接不是 127.0.0.1
```

## 4. 交付判断

可以交付给客户试点的最低证据：

```text
docker-health 通过
npm run e2e:docker 通过
浏览器打开首页，能看到复制整改链接、复制复核链接、PDF闭环包、历史台账 CSV 导入、项目初始化、模板变更记录
浏览器打开 #rectify/real-001，能看到责任人整改页和上传入口
浏览器打开 #review/real-001，能看到复核人确认页、驳回补证据和复核通过
客户配置包能导入导出
30 条真实隐患能导入或初始化
至少 1 条隐患完成“分派 -> 整改 -> 复核 -> 闭环”
```
