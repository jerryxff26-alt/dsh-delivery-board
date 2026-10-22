# dsh-delivery-board

[English](README.md) · [中文](README.zh.md)

> **Codebase-native delivery context.**  
> 交付状态与源码同仓同源：人与模型共享同一份上下文。

从 Plan 到需求、设计、开发、测试再到上线，交付状态如果和代码不在一起，人和 Agent 就很难对齐：谁负责、怎样算完成、哪里卡住，往往散落在交接和口头同步里。

**dsh-delivery-board** 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）插件：把阶段流水线、交接留痕和客户周报写入仓库内的交付状态。看板、审计与周报只是同一份状态的不同视图，不是另一套独立服务。

目标很明确：基于 codebase 完成整条交付生命周期，让 PM、研发、测试和 AI agent 共用同一个 Source of Truth。

```bash
dsh plugin --profile web add github:jerryxff26-alt/dsh-delivery-board
```

桌面版：在插件管理中安装同一个 GitHub 来源 `github:jerryxff26-alt/dsh-delivery-board`。（上面的 CLI 命令已验证；桌面插件管理流程未单独验证。）

已在 DSH **0.2.1-rc.2**（开发者预览版；亦兼容 **0.2.0-rc.2**）上测试，无运行时依赖。通过 `engines.dsh` 声明供 DSH 0.2.1+ 做兼容性检查。

## 演示

![虚构演示：痛点 → 阶段看板 → 交接审计 → 周报/HTML → 安装](docs/demo/demo.gif)

*约 19 秒无声演示（英文叠字 · 虚构数据）。需要下载可看 [MP4](docs/demo/demo.mp4)。*

## 设计原则

- **Delivery state 是一等公民**：阶段、负责人、验收标准（AC）、完成定义（DoD）、交接与阻塞，都留在仓库里，跟随 Git 演进。
- **视图解耦**：本地看板、交接审计、客户周报、离线 HTML，都是同一份交付状态的 Projection。
- **通过 DSH 操作**：用 `/delivery` 或自然语言推进阶段、补 AC、记阻塞、出周报；不必把 JSON 当成日常手工编辑界面。
- **边界清晰**：不重造企业级项目管理平台，只把当前仓库交付真正需要的上下文留在 codebase 里。

## 你能得到什么

- **阶段流水线 + 卡片**：每张卡有负责人、截止日期、验收标准和完成定义（DoD）。初始化后仍可增删改阶段（删除时若该阶段仍有卡片，需先 `migrate_to` 迁走）。
- **交接审计**：卡片跨阶段移动时自动记录交接（谁、从哪到哪、备注）。
- **周报**：生成 Markdown 客户周报：流水线快照、本周交接、未关闭的风险/阻塞（已 resolve 的不展示）。可选填写下周计划；为空则省略该节。
- **本地可编辑看板**：`/delivery Open the editable board` 在 `127.0.0.1` 上提供鼠标拖拽看板，保存回同一份交付状态；归档/恢复、风险/阻塞记录，以及可勾选的关卡清单均可在看板操作。无障碍回退：编辑卡片里的 Stage。看板界面文案会跟随浏览器语言（中文环境优先 zh-CN）。
- **离线 HTML 快照**：单个只读文件，没装 DSH 的同事也能打开。

![宽屏完整治理流水线看板（Plan→Live，虚构 ACME 卡片）](docs/screenshots/board.jpg)

<details>
<summary>卡片编辑与归档视图</summary>

![卡片编辑：标题、负责人、截止日期、阶段、验收标准与完成定义](docs/screenshots/card-editor.jpg)

![归档视图：保留卡片详情与恢复到原阶段按钮](docs/screenshots/archive.jpg)

</details>

## 快速开始

```bash
dsh plugin --profile web add github:jerryxff26-alt/dsh-delivery-board
```

然后在会话里：

```text
/delivery Initialize a governance delivery board for ACME
/delivery Open the editable board
```

高级、确定性命令（不经过模型）：`/delivery-admin help`。

## Skill 与工具

`/delivery` skill 会先读仓库上下文、找缺口，再提出阶段与卡片方案；得到确认后才通过 `delivery_*` 工具写入。**模型负责推理；工具负责落盘。**

| 模板 | 阶段 | 关卡 |
|---|---|---|
| `default`（ToB 交付流水线） | Client Requirements → BA Analysis → TL Design → Development → Testing → DevSecOps Launch → Live | 每阶段 1–2 个（如验收标准冻结、安全扫描通过） |
| `governance`（治理型交付流水线） | Plan → Analyze → Design → Build → Test → Deploy → Live | 侧重质量/风险/安全签核（如回滚方案就绪） |

可通过 `stages` 参数完全自定义阶段。关卡是**可勾选跟踪的清单**，持久化在交付状态中，**不会强制拦截**卡片移动。

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
| `delivery_resolve` | 按 logs 下标将未关闭的风险/阻塞标记为已解决 |
| `delivery_gate` | 勾选/切换阶段关卡清单项（可跟踪，非硬拦截） |
| `delivery_stage_add` / `delivery_stage_update` / `delivery_stage_remove` | 初始化后演进流水线（有卡片时删除需 `migrate_to`） |
| `delivery_weekly` | 客户周报（Markdown） |

## 团队协作与安全

- 交付状态默认落盘为仓库内文件（默认名 `delivery.json`，可配置），提交到团队共享 git 仓库后 `git pull/push` 即可同步；并发修改仍需正常解决冲突。
- 本地看板只绑定 `127.0.0.1`、随机端口和不可猜测的路径；URL 仅限本机使用，DSH 退出或插件卸载后失效。
- 页面数据过期时不会静默覆盖，需要点 **Refresh** 后重试。

## 开发

```bash
npm install
npm run check
npm test               # 领域、HTML、命令、存储、HTTP、插件与 skill 测试
npm run test:desktop   # 可选：再加桌面 SDK 上的 skill 注册/加载测试
```

本地桌面开发（macOS，已在 DSH 0.2.1-rc.2 验证）：

```bash
DSH_CLI="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"
"$DSH_CLI" plugin --profile desktop add "link:$PWD" --offline --ignore-scripts
```

安装或改动 link 插件后请完全退出并重开 DSH，确认 **Plugins → dsh-delivery-board** 为 **Running**。`--dump-config` 适用于 CLI 管理的 profile（如 `web`），不适用于 desktop profile。若应用路径不同，可设 `DSH_DESKTOP_APP`。

### 实现说明

- 插件契约 `name / inject / Config / apply`；工具经 `defineTool`；捆绑的 `skills/delivery/SKILL.md` 经 `ctx.skills.register` 注册。工具输出渲染为 `ContentBlock[]`。
- 领域逻辑（`lib/delivery.js`）与 HTML 渲染（`lib/board-html.js`）为纯函数；写入都走 `lib/store.js` 与 `ctx.fs`。
- 周报交接覆盖从 `week_start` 起连续七个本地日历日（默认本周一）。仅列出未关闭风险/阻塞；`next_week` 有内容时才输出「下周」节。
- 阶段关卡为可跟踪清单（`gateDone`），**不**拦截移动。
- 初始化后可用工具或 `/delivery-admin` 增删改阶段；删除仍有卡片的阶段必须提供 `migrate_to`。
- HTML 中用户内容均转义（有测试覆盖）。

## 路线图

- 把可编辑看板嵌进 DSH，而不是本地 URL
- 可强制拦截移动的硬关卡、多项目汇总
- 周报与工具消息的更完整 i18n（看板界面已跟随浏览器语言）

## 已知限制

- DSH 为开发者预览。兼容声明：`engines.dsh >=0.2.0-rc.2 <0.3.0`（DSH 0.2.1+ 优先读取）；peers `@deepseek-ai/dsh-tools >=0.2.0-rc.2 <0.3.0`、`@deepseek-ai/schemastery ~3.18.5`（由宿主提供，optional）。已在 0.2.1-rc.2 冒烟验证；此前在 0.2.0-rc.2 验证过。
- 无甘特排期、自动批量归档、硬拦截关卡或实时多用户同步。
- 拖拽（以及编辑 → 阶段回退）在本地浏览器 harness 中检查过；不做完整键盘/移动端/WCAG 声明。
- 关卡清单只是进度跟踪；移动卡片不要求关卡全部勾选。

## 许可证

[MIT](LICENSE) © 2026 jerryxff26-alt
