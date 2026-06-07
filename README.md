# 消防整改闭环助手 MVP

面向物业、园区、消防维保公司的轻量整改闭环试点工具。它不替换客户原有后台，而是通过群机器人、H5 整改链接、复核链接、文件证据和闭环包，把维保报告里的隐患变成可执行流程。

上线前请先逐项核对 [LAUNCH_CHECKLIST.md](D:/1pro/strong-workflow/LAUNCH_CHECKLIST.md)，并用 [RISK_REGISTER.md](D:/1pro/strong-workflow/RISK_REGISTER.md) 做上线评审。这两份文件覆盖公网 HTTPS、机器人、真实数据、人员名单、手机端测试、备份、自动催办、PDF 闭环包、当前已知不足和阻塞上线风险。

上线运行包：

```text
DEPLOYMENT.md：Windows 服务 / PM2 / Nginx / Cloudflare Tunnel / Node HTTPS 部署说明
CI_CD.md：Docker Compose 与 GitHub Actions 自动化构建/镜像发布流程
ROBOT_INTEGRATION_RECORD.md：真实企业微信/钉钉机器人联调记录
PILOT_DRILL_RECORD.md：30 条隐患端到端试点演练记录
samples/customer-hazards-template.csv：真实客户 CSV 模板样例，含 30 条隐患
```

## 端口与配置

本地固定配置在 `.env.local`，可参考 `.env.example`。

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 后端监听地址 |
| `PORT` | `5174` | 生产服务和 API 端口 |
| `PUBLIC_BASE_URL` | `http://127.0.0.1:5174` | 生成整改/复核/上传文件公开链接时使用 |
| `HTTPS_CERT_FILE` | 空 | HTTPS 证书文件路径，配置后由 Node 直接启用 HTTPS |
| `HTTPS_KEY_FILE` | 空 | HTTPS 私钥文件路径 |
| `VITE_API_BASE` | `http://127.0.0.1:5174/api` | 开发前端访问 API 的地址 |
| `DATA_FILE` | `data/hazards.json` | 隐患数据落盘位置 |
| `NOTIFICATION_FILE` | `data/notifications.json` | 机器人通知日志落盘位置 |
| `PROJECT_CONFIG_FILE` | `data/project-config.json` | 客户项目配置落盘位置，含客户名、项目名、默认期限、责任人/复核人名单 |
| `UPLOAD_DIR` | `server/uploads` | 整改图片/文件上传目录 |
| `MAX_UPLOAD_MB` | `15` | 单文件上传大小上限 |
| `ALLOWED_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174` | CORS 白名单 |
| `WECOM_WEBHOOK_URL` | 空 | 企业微信群机器人 Webhook |
| `DINGTALK_WEBHOOK_URL` | 空 | 钉钉机器人 Webhook |
| `DINGTALK_SECRET` | 空 | 钉钉机器人加签密钥 |
| `ENABLE_REMINDER_JOB` | `false` | 是否启用自动催办定时任务 |
| `REMINDER_INTERVAL_MINUTES` | `60` | 自动催办扫描间隔 |

## 启动

```powershell
npm install
npm run build
npm run server
```

打开：

```text
http://127.0.0.1:5174
```

健康检查：

```text
http://127.0.0.1:5174/api/health
```

最近通知日志：

```text
http://127.0.0.1:5174/api/notifications
```

开发模式：

```powershell
npm run dev
npm run server
```

开发前端端口固定为 `5173`，后端/API 端口固定为 `5174`。

生产运行可参考 [DEPLOYMENT.md](D:/1pro/strong-workflow/DEPLOYMENT.md)，其中包含 PM2、Windows 服务、Nginx、Cloudflare Tunnel 和 Node 直接 HTTPS 三种公网路径。

## 试点流程

1. 打开页面，先查看“配置与上线检查”，确认端口、公开链接、上传目录和机器人状态。
2. 点击“真实模板”，载入 30 条更接近客户现场的试点隐患。
3. 选择一条隐患，使用责任人/复核人下拉名单补齐人员和期限。
4. 点击“生成整改链接”，系统发送机器人通知。
5. 点击“复制整改链接”或“复制复核链接”，可直接粘贴到企业微信或钉钉群。
6. 打开整改页，上传整改图片或文件；图片证据会在证据区显示缩略图。
7. 可在左侧选择多条隐患，批量设置责任人、复核人和期限。
8. 打开复核页，复核通过或驳回。
9. 点击“导出闭环包”生成 HTML 归档包，点击“PDF闭环包”打开打印页并另存为 PDF。
10. 需要发群时，可直接复制整改、复核、催办群消息文案。

演示数据入口：

```text
生成30条试点：通用模拟数据
真实模板：青浦智造产业园消防维保试点，30 条真实化点位数据
```

真实试点导入可使用：

```text
samples/customer-hazards-template.csv
```

## 下一家客户复用

这版已把客户项目配置从浏览器本地存储升级为后端持久化文件，并支持配置导入/导出。实施下一家客户时建议按这个顺序走：

1. 在“客户初始化向导”选择客户模板库：园区/物业消防维保、制造工厂 EHS、商业物业/商户整改。
2. 在“项目初始化”里配置客户名称、项目名称、维保负责人、默认整改期限、责任人名单和复核人名单。
3. 点击“导出配置”，保存为该客户的 v2 项目配置包；系统仍兼容上一版 v1 配置包和裸配置 JSON。
4. 下一家客户部署后，点击“导入配置”，直接恢复客户组织和默认规则。
5. 客户 Excel 先另存为 CSV，上传后检查字段映射；系统会自动识别常见表头，也允许手动选择。
6. 阻断问题必须处理后才能导入，包括缺点位、缺标题/描述、编号重复、日期格式错误。
7. CSV 中出现的新责任人/复核人会提示，可一键加入项目名单。
8. CSV 确认导入后，系统会自动选中本次导入隐患，生成批量分派建议，并生成导入演练记录。
9. 运维升级时使用 `scripts\update.ps1`，脚本会先备份隐患、通知日志、项目配置和上传文件，再拉取代码、构建、重启 Docker、跑健康检查。

模板支持按隐患类型/关键词自动建议责任人。当前内置规则示例：

```text
防火门 / 闭门器 / 顺序器 -> 外包维修
商户 / 餐饮 / 灭火器 -> 商户负责人
喷淋 / 遮挡 / 货物堆放 -> 租户或仓储主管
消防通道 / 疏散 / 占用 / 堵塞 -> 物业工程
设备 / 电气 / 配电 -> 设备维修
```

规则会随 v2 项目配置包导入导出。CSV 导入时，如果客户表格没有填责任人，系统会先按关键词规则逐条预填责任人、复核人和期限，再生成批量分派建议。

当前规则链路的保护点：

```text
配置包导入时，规则里的责任人/复核人会自动补进项目名单
期限天数只接受 1-365 天，异常值会回落到模板默认期限
CSV 预览会提示每行命中的模板规则；未命中时提示将使用默认责任人
报告文本快拆、CSV 导入、手动生成整改链接都会复用同一套关键词规则
导入演练记录会记录规则命中条数，便于客户现场复盘
规则命中质量面板会统计最近导入中命中最多的规则、未命中的隐患和从未命中的规则，用来反向优化客户模板
规则优化建议会从未命中隐患中提取高频设施/类型关键词，生成新增规则建议，并支持一键加入当前客户模板
建议规则会先做冲突检测，提示关键词重叠和潜在抢单风险；高风险建议会禁止一键加入，避免扰乱责任人分派逻辑
建议规则加入前可用小编辑器调整规则名、关键词、责任人、复核人和期限，冲突风险会随编辑实时刷新
```

快速更新命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\update.ps1
```

建议上线当天按 [PILOT_DRILL_RECORD.md](D:/1pro/strong-workflow/PILOT_DRILL_RECORD.md) 逐项记录导入、分派、整改、复核、催办和 PDF 导出结果。

## 状态机保护

当前前端和后端 API 已做基础状态保护。日常字段编辑使用单条 `PATCH /api/hazards/:id`，流程动作使用 `POST /api/hazards/:id/actions`，避免普通操作全量覆盖隐患文件：

```text
待分派：不能提交整改证据，不能上传整改文件
待整改：可以提交/上传整改证据，提交后进入待复核
待复核：可以复核通过或驳回，不能重复提交证据
已驳回：可以重新提交/上传证据，提交后回到待复核
已逾期：可以重新提交/上传证据，提交后回到待复核
已闭环：不能重新分派、上传、驳回或催办
没有整改后证据：不能复核通过
```

批量导入、重置演示和试点模板初始化仍会使用全量写入，这是为了保留试点接入效率；日常编辑、分派、整改、复核、驳回和催办已经改为单条保存。

## 备份与健康检查

备份当前隐患数据和上传文件：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
```

备份包会包含 `data/hazards.json`、`data/notifications.json`、`data/project-config.json` 和 `server/uploads`。

恢复指定备份包。恢复前默认会先自动做一次当前数据备份：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 -ArchivePath backups\strong-workflow-YYYYMMDD-HHMMSS.zip
```

健康检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\health-check.ps1
```

健康检查会输出 JSON。若机器人未配置，会把当前模式标记为 `dry-run` 问题项，正式上线前需要处理。

## 机器人配置

企业微信：

```powershell
$env:WECOM_WEBHOOK_URL='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key'
npm run server
```

钉钉：

```powershell
$env:DINGTALK_WEBHOOK_URL='https://oapi.dingtalk.com/robot/send?access_token=你的access_token'
$env:DINGTALK_SECRET='SECxxxxxxxx'
npm run server
```

未配置机器人时，通知接口会返回 `dryRun: true`，不会真实发送外部消息。

每次通知都会写入 `data/notifications.json`。配置面板会展示最近通知状态和最近失败记录；上线前如果仍是 `dry-run`，说明还没有接真实机器人。

真实联调请使用 [ROBOT_INTEGRATION_RECORD.md](D:/1pro/strong-workflow/ROBOT_INTEGRATION_RECORD.md) 记录。至少要验证 `/api/notify`、生成整改链接、提交整改证据、复核通过、驳回和催办 6 个场景。

## HTTPS 与自动催办

若由 Node 直接提供 HTTPS：

```powershell
$env:HOST='0.0.0.0'
$env:PORT='443'
$env:PUBLIC_BASE_URL='https://xf-flow.example.com'
$env:HTTPS_CERT_FILE='certs/fullchain.pem'
$env:HTTPS_KEY_FILE='certs/privkey.pem'
npm run server
```

若前面使用 Nginx、宝塔、Cloudflare Tunnel 等反向代理，Node 仍可监听 `127.0.0.1:5174`，只需把 `PUBLIC_BASE_URL` 和 `ALLOWED_ORIGINS` 改成公网 HTTPS 域名。

自动催办：

```powershell
$env:ENABLE_REMINDER_JOB='true'
$env:REMINDER_INTERVAL_MINUTES='60'
npm run server
```

也可以手动触发：

```text
POST http://127.0.0.1:5174/api/reminders/run
```

自动催办会写入 `lastReminderAt`、`reminderCount` 和 `escalationLevel`，普通定时扫描按 24 小时频控，手动“跑催办”会强制扫描。

## 当前边界

这版适合跑 1 个真实物业/园区/维保项目的 MVP 试点，不是完整 SaaS。还没有做账号体系、多租户隔离、数据库、文件病毒扫描、HTTPS、公网域名和不可篡改审计。若要进入正式商用，这些需要进入下一阶段。
