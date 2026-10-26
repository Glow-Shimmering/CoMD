# CoMD

专注文字，自在表达。基于 Electron、React、TypeScript 和 CodeMirror 6 独立实现的本地 Markdown 桌面应用。

## 0.3.3 选区高亮修复

修复源码与双栏模式中，同一行选中文字却看不到高亮的问题。调整编辑器当前行、引用与代码的背景透明度，使选区不会被覆盖；同时加强深色主题下的选区对比度。覆盖实时/源码/双栏、同行/跨行和鼠标/键盘选中的像素回归检查。

## 0.3.2 自动检查更新

默认在启动约 10 秒后检查 GitHub 最新正式 Release，运行期间每 6 小时复查。发现新版本时在标题栏显示入口，设置 → 更新可查看版本说明、下载安装包，或关闭自动检查；帮助菜单也提供手动检查。检查失败不会打断编辑，不会把断网或没有 Release 误报为已是最新版。

更新只检查版本信息，不发送文档或 API Key。下载由浏览器完成，安装仍需手动确认。本次需要先手动安装 0.3.2；0.3.1 及更早版本没有更新检查功能。发布要求见 [发布指南](docs/RELEASING.md)。

## 0.3.1 最近打开更新

侧栏移除“已打开”和最近文件列表，在“打开文件夹”下新增“最近打开”。弹窗统一展示最近使用的文件和文件夹，显示完整路径提示并支持搜索；选择文件打开标签，选择文件夹恢复目录树。历史记录在重启后保留，自动迁移旧版的最近文件与当前文件夹。

## 0.3.0 文件夹与渲染更新

- 双栏支持双向滚动同步：滚动源码或预览，另一侧按滚动比例跟随，不改变光标选区。
- Markdown 可混写 div、span、table、details、font、sub/sup 等 HTML 标签；颜色、字体、对齐等常见行内样式在双栏、阅读和导出中显示。实时/源码模式保留可编辑的 HTML 原文。
- “文档”侧栏更名为“文件”。通过“打开文件夹”或 Cmd/Ctrl+Shift+O 浏览嵌套目录并打开多个文件，支持刷新、当前文件高亮及重启后恢复根文件夹。关闭文件夹会保留已打开的标签页。
- 文件树按需读取目录，展示 Markdown 与 txt 文件，略过 .git、node_modules 和符号链接。没有新增文件、重命名或删除磁盘文件的操作。

## 0.2.1 侧栏更新

“文档”仅显示工作区与最近打开的文件；“大纲”按 H1–H6 层级展示标题。点击箭头折叠/展开下级标题，点击标题跳转正文；切换分类、侧栏和文档会保留本次运行中的折叠状态。无下级标题的条目不显示折叠按钮。

## 0.2.0 视觉更新

以白色为主、蓝色为强调色，统一应用图标、工具栏、选中状态、排版和导出样式。新图标由 C 与文字光标组成；保留深色主题，并调整为午夜蓝。

## 使用

- **macOS Apple Silicon**：打开发布目录 `release/0.3.3/` 里的 DMG，把 CoMD 拖入 Applications；也可以解压 macOS ZIP 后打开 CoMD.app。适用于 M 系列芯片，macOS 13 或更新版本。
- **Windows x64**：解压 Windows ZIP 到一个固定目录，双击 CoMD.exe。请保留同目录的 DLL、resources 等配套文件。适用于 Windows 10/11 的 x64 设备。若提供 Setup.exe，也可用安装向导安装。
- 本地编辑无需账号与网络。首次打开会显示可编辑的欢迎文档。按 Cmd/Ctrl+O 打开自己的文件，Cmd/Ctrl+S 保存。

这是 0.3.3 选区高亮修复版。macOS 使用本机 ad-hoc 签名，未进行 Apple Developer ID 签名/公证；Windows 未使用商业代码签名证书。系统可能显示未识别开发者的提示。确认文件来自本次构建后，按系统提供的“仍要打开/仍要运行”流程处理；不要关闭整个系统的安全保护。

## 功能

| 功能 | 状态 |
| --- | --- |
| 实时排版、源码、双栏、阅读 | 已实现 |
| 标题、强调、引用、代码、任务列表 | 已实现；表格/图片/公式完整渲染在双栏与阅读模式 |
| 文件夹树、本地多标签、最近文件/文件夹搜索、分层大纲折叠与跳转、查找替换 | 已实现 |
| 双栏双向滚动、Markdown 内嵌 HTML 与行内样式 | 已实现 |
| 深浅主题、跟随系统、字号、专注模式 | 已实现 |
| 自动/手动检查 GitHub 正式版本、安装包下载入口 | 已实现；需手动安装 |
| 自动保存、未命名草稿恢复 | 已实现 |
| 外部修改检测、冲突暂停、另存副本、明确覆盖 | 已实现 |
| UTF-8 BOM 与 CRLF 保留、上一版备份 | 已实现 |
| HTML / PDF 导出 | 已实现 |
| AI 选区修改、审阅接受、加密保存 Key | 已实现；需自备 API 服务 |

AI 接口为兼容 `POST /chat/completions` 的服务。设置填写 API 基础地址（例如以 `/v1` 结尾）、模型 ID 与 API Key。按下“发送修改要求”才会发送选区文本和要求；不会自动上传整个文档。API Key 通过 Electron `safeStorage` 使用系统加密能力保存。CoMD 不附带模型额度，也不复用 Codex 订阅。

## 文档与隐私

- 用户打开的文件保留在原来的位置；读取用户选择的文件夹目录，只有显式打开或另存的文件会被读写。
- 应用数据在 macOS 的 `~/Library/Application Support/CoMD`，Windows 的 `%APPDATA%/CoMD`。
- `workspace.json` 包含当前文档草稿和偏好，`backups` 保存每个已写入文件的上一版，`ai.json` 保存 API 地址、模型和加密密钥。
- 草稿和备份是本机明文文件，不属于端到端加密存储。
- 无遥测、无文档自动上传。默认自动检查会请求 GitHub Release 信息（包含常规网络信息及应用版本），可在设置中关闭。Markdown 中远程 HTTPS 图片在预览时会访问图片源；本地图片限文档目录及子目录。
- 允许常见 HTML 排版标签与白名单内的行内样式；过滤脚本、事件处理器、iframe、页面样式表及可覆盖应用界面的定位样式。自定义 class 样式表和 JavaScript 不执行。只接受有效 UTF-8 文本，单文件限制 20 MB。

## 开发与构建

使用 Node.js 24 LTS 或满足依赖要求的更新版本。依赖版本记录在 `package-lock.json`。

```bash
npm ci
npm exec -- install-electron
npm run icons
node scripts/notices.mjs
npm run build
npm run desktop
```

开发时两个终端分别运行：

```bash
npm run dev
# macOS/Linux 第二个终端
COMD_DEV_URL=http://127.0.0.1:5173 npm run desktop
# PowerShell 第二个终端
$env:COMD_DEV_URL='http://127.0.0.1:5173'; npm run desktop
```

```bash
npm test
npm run test:e2e
npm run dist:mac           # 在 macOS 上，arm64 DMG 和 ZIP
npm run dist:win           # Windows x64 ZIP，可交叉打包
npm run dist:win:installer # Windows x64 NSIS 安装器，推荐 Windows runner
```

若运行时已下载并校验，可给 electron-builder 传入 `--config.electronDist=build/cache`。发行脚本不会发布到任何服务器。GitHub Actions 配置只在手动触发时运行，构建产物保存在 Actions artifacts，不自动发布 Release。

## 验证范围

`tests/*.test.cjs` 验证 BOM/换行、备份、外部修改冲突、非 UTF-8 拒绝、目录边界、历史记录迁移、更新版本比较/平台匹配/调度/超时。`tests/desktop.mjs` 使用真实 Electron 窗口和临时数据目录，验证实际选区像素、启动自动检查、更新设置与失败恢复、最近文件/文件夹搜索与恢复、文件夹与路径边界、HTML 混排和过滤、双栏双向滚动、大纲分层折叠、文档间状态保持、输入、磁盘保存、冲突、图片/公式、HTML/PDF、标签页撤销、重启恢复，以及本机模拟 API 的 AI 修改流程。测试报告与截图位于 `test-results/`。

真实 API 服务需要用户自行配置后测试；Windows 在本机只能完成构建和包结构验证，不能代替 Windows 真机验收。自动保存对外部写入有检查，但不提供跨进程文件锁，避免与另一个编辑器持续同时写同一文档。首版未提供 Mermaid 图渲染、云同步、协同编辑或静默安装更新。

## 代码

- `electron/main.cjs`：桌面窗口、菜单、隔离 IPC、文件授权、AI、导出。
- `electron/files.cjs`：原子写入、编码、冲突、备份。
- `src/Editor.tsx`：CodeMirror 与实时 Markdown 装饰。
- `electron/updates.cjs`：GitHub 版本检查、定时调度与安装包匹配。
- `src/UpdateSettings.tsx`：更新设置、状态、版本说明与下载入口。
- `electron/recent.cjs`：最近文件/文件夹排序、去重与旧版迁移。
- `src/RecentPicker.tsx`：最近打开弹窗与搜索。
- `electron/folders.cjs`：文件夹授权边界与目录读取。
- `src/FileTree.tsx`：按需展开的文件夹树。
- `src/Outline.tsx`：分层大纲、独立折叠与标题跳转。
- `src/markdown.ts`：安全渲染、数学公式、图片与导出。
- `src/App.tsx`：工作区、标签、草稿、设置和 AI 审阅。
- `src/styles.css`：云白/午夜蓝主题和排版。

MIT License。开源依赖声明见 `THIRD-PARTY-NOTICES.txt`。实现参考开源组件公开 API，没有提取、复用或重新分发 Codex 的专有编辑器代码。

参考资料：[CodeMirror decorations](https://codemirror.net/examples/decoration/)、[Electron security](https://www.electronjs.org/docs/latest/tutorial/security)、[electron-builder](https://www.electron.build/)。
