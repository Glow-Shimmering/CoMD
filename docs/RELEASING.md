# 发布 CoMD 与更新检查

## 0.3.5 的安装包

交付目录为 `outputs/CoMD-0.3.5`（工作区根目录下），构建原件在项目内的 `release/0.3.5`。

发布前先确认本次 0.3.5 代码已提交并推送到 GitHub 的 `main`。仅生成或上传安装包不会更新仓库源码；不要把新标签指向旧版提交。

1. 打开 https://github.com/Glow-Shimmering/CoMD/releases/new 。
2. 创建标签 `v0.3.5`，Target 选择包含 0.3.5 的 `main` 提交；标题填 `CoMD v0.3.5｜文档搜索与替换`。
3. 粘贴下方发布说明，上传 Mac DMG、Windows Setup.exe；可加上便携 ZIP、源码包与 SHA256SUMS.txt。
4. 等待附件全部上传。使用正式发布（不勾选 pre-release），设为 Latest，再点击 Publish release。
5. 在设置 → 更新点击“检查更新”。已安装 0.3.5 时应显示“当前无需更新”；未来更高版本发布后才会显示升级提示。

首次启用需要手动安装 0.3.5。0.3.1 和更早的应用没有检查更新代码，发布 Release 本身不会让旧应用自动获得这个功能。

## 后续版本约定

- `package.json`、锁文件与发布标签使用相同的三段数字版本，标签可加 `v`（例如 `v0.3.5`）。发布前更新构建与交付脚本的版本路径。
- 只读取 GitHub `/releases/latest` 正式发布，不读取草稿、预发布或普通 Git 标签。没有公开正式版本会显示“暂无可用的发布信息”。
- Mac ARM64 优先匹配 `CoMD-版本-macOS-AppleSilicon.dmg` 或 `CoMD-版本-mac-arm64.dmg`，其次匹配对应 ZIP。
- Windows x64 优先匹配 `CoMD-版本-Windows-x64-Setup.exe`，其次匹配 `CoMD-版本-Windows-x64-Portable.zip` 或 `CoMD-版本-win-x64.zip`。
- 如果缺少当前平台的附件，应用仍提示新版并提供发布页面入口，不会拿另一平台的包代替。
- 不需要额外上传 latest.yml。当前功能负责版本检查及打开官方安装包链接，由用户手动安装；没有静默覆盖、重启安装或应用内下载。
- GitHub Actions 目前只负责手动触发构建并上传 Actions artifacts，不会自动创建 Release。

## 0.3.5 发布说明（可直接复制）

CoMD v0.3.5 新增统一的文档搜索栏，完善四种模式下的查找与替换体验。

- 点击顶栏放大镜或按 Cmd/Ctrl+F，即可搜索当前文档；选中文字后可自动填入。
- 支持匹配计数、全部高亮和当前结果定位，Enter / Shift+Enter 前后跳转，Esc 关闭。
- 阅读模式支持跨粗体、链接的连续文字匹配，自动展开命中的折叠内容。
- 双栏可切换正文/源码搜索范围，定位到对应段落；实时/源码模式支持搜索格式标记和链接地址。
- 支持区分大小写、全词匹配和正则表达式；无效表达式、无匹配和搜索超时有明确提示。
- 替换默认收起，支持单处替换、全部替换及捕获组；一次撤销可恢复全部替换。
- 搜索高亮不修改文档，不影响导出；未保存内容也参与搜索。

本次不包含文件夹全文搜索。最多展示 5000 处命中，超限时禁用全部替换；不支持匹配空字符串的正则表达式。

Mac M 系列下载 AppleSilicon.dmg；Windows x64 下载 Setup.exe，免安装使用 Portable.zip。0.3.1 及更早版本请先手动安装本次更新，之后即可检查后续版本；已安装 0.3.2 及更新版本的用户可通过“检查更新”下载本次更新。

更新检查不会自动安装。Mac 使用 ad-hoc 签名且未公证，Windows 安装包未签名。Windows 已完成构建与包结构检查，尚未在 Windows 真机验证。

接口参考：[GitHub Latest Release](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)、[Electron net](https://www.electronjs.org/docs/latest/api/net)。
