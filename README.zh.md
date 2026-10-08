# dsh-delivery-board

[English](README.md) · [中文](README.zh.md)

需求从分析交给设计、再交给开发和测试，每交接一次就丢一点信息：现在谁负责、怎样才算完成、哪里还卡着。到了周五，还得有人手工拼一份客户周报。

**dsh-delivery-board** 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）插件，把交付看板、交接记录和周报放进仓库里的同一个 `delivery.json`。

```bash
dsh plugin --profile web add github:jerryxff26-alt/dsh-delivery-board
```

桌面版：在插件管理中安装同一个 GitHub 来源 `github:jerryxff26-alt/dsh-delivery-board`。（上面的 CLI 命令已验证；桌面插件管理流程未单独验证。）

已在 DSH **0.2.0-rc.2**（开发者预览版）上测试，无运行时依赖。

## 演示

![虚构演示：问题 → 阶段看板 → 交接审计 → 周报/HTML → 安装](docs/demo/demo.gif)

*约 31 秒无声说明（虚构 ACME：痛点 → 完整看板 → 拖拽换阶段 → 编辑 → 交接/归档 → 周报 → 安装）。需要下载可看 [MP4](docs/demo/demo.mp4)。*


## 功能

- **阶段流水线 + 卡片**：每张卡有负责人、截止日期、验收标准和完成定义（DoD）。
- **交接审计**：卡片跨阶段移动时自动记录交接（谁、从哪到哪、备注）。
- **周报**：生成 Markdown 客户周报：流水线快照、本周交接、未关闭的风险/阻塞。
- **本地可编辑看板**：`/delivery open` 在 `127.0.0.1` 上提供鼠标拖拽看板（拖到其他阶段列即可移动），保存回同一个 JSON；归档/恢复保留历史。无障碍回退：编辑卡片里的 Stage。
- **离线 HTML 快照**：单个只读文件，没装 DSH 的同事也能打开。

![宽屏完整治理流水线看板（Plan→Live，虚构 ACME 卡片）](docs/screenshots/board.jpg)

*截图在普通笔记本视口（约 1440×900）下截取：列更紧凑，Plan→Live 尽量一屏可见、无需横向滚动。*

## 使用

在 DSH 输入框输入 `/delivery` 直接执行命令（不调用模型）：

```text
/delivery help
/delivery init {"customer":"Demo","template":"governance"}
/delivery card {"title":"API 联调","stage":"build","owner":"Alice"}
/delivery board
/delivery open
/delivery move c1 test
/delivery update {"card_id":"c1","owner":"Bob","due":"2026-10-20"}
/delivery archive c1
/delivery restore c1
/delivery weekly 2026-10-05
/delivery html
```

也可以直接用自然语言，例如“给 ACME 建一个交付项目，用 governance 模板”“把 c1 交给设计，负责人改为 Dave”“生成本周客户周报”。

## 流水线模板

| 模板 | 阶段 | 关卡 |
|---|---|---|
| `default`（ToB 交付流水线） | Client Requirements → BA Analysis → TL Design → Development → Testing → DevSecOps Launch → Live | 每阶段 1–2 个（如验收标准冻结、安全扫描通过） |
| `governance`（治理型交付流水线） | Plan → Analyze → Design → Build → Test → Deploy → Live | 侧重质量/风险/安全签核（如回滚方案就绪） |

可通过 `stages` 参数完全自定义阶段。v0.1 中关卡仅展示，由人工确认。

## 工具

| 工具 | 作用 |
|---|---|
| `delivery_init` | 初始化项目（客户 + 模板或自定义阶段） |
| `delivery_card` | 新增卡片 |
| `delivery_move` | 跨阶段移动卡片并记录交接；同阶段只改负责人时记为决策，不算交接 |
| `delivery_board` | 文本看板 |
| `delivery_open` | 本地可编辑看板 URL |
| `delivery_update` | 修改卡片信息（不移动） |
| `delivery_archive` / `delivery_restore` | 归档 / 恢复到原阶段 |
| `delivery_board_html` | 只读离线 HTML 快照 |
| `delivery_log` | 记录进展 / 风险 / 阻塞 / 决策 |
| `delivery_weekly` | 客户周报（Markdown） |

## 团队协作与安全

- 把 `delivery.json` 提交到团队共享 git 仓库，`git pull/push` 即同步；并发修改仍需正常解决冲突。
- 本地看板只绑定 `127.0.0.1`、随机端口和不可猜测的路径；URL 仅限本机使用，DSH 退出或插件卸载后失效。
- 页面数据过期时不会静默覆盖，需要点 **Refresh** 后重试。

## 开发

```bash
npm install
npm run check
npm test
```

更多细节（本地桌面开发、实现说明、已知限制）见 [English README](README.md)。

## 许可证

[MIT](LICENSE) © 2026 jerryxff26-alt
