# 发布 CoMD 与更新检查

## 0.3.2 的安装包

交付目录为 `outputs/CoMD-0.3.2`（工作区根目录下），构建原件在项目内的 `release/0.3.2`。

1. 打开 https://github.com/Glow-Shimmering/CoMD/releases/new 。
2. 创建标签 `v0.3.2`，Target 选择包含 0.3.2 的 `main` 提交；标题填 `CoMD v0.3.2｜自动检查更新`。
3. 粘贴下方发布说明，上传 Mac DMG、Windows Setup.exe；可加上便携 ZIP、源码包与 SHA256SUMS.txt。
4. 等待附件全部上传。使用正式发布（不勾选 pre-release），设为 Latest，再点击 Publish release。
5. 在设置 → 更新点击“检查更新”。已安装 0.3.2 时应显示“当前无需更新”；未来更高版本发布后才会显示升级提示。

首次启用需要手动安装 0.3.2。0.3.1 和更早的应用没有检查更新代码，发布 Release 本身不会让旧应用自动获得这个功能。

## 后续版本约定

- `package.json`、锁文件与发布标签使用相同的三段数字版本，标签可加 `v`（例如 `v0.3.3`）。发布前更新构建与交付脚本的版本路径。
- 只读取 GitHub `/releases/latest` 正式发布，不读取草稿、预发布或普通 Git 标签。没有公开正式版本会显示“暂无可用的发布信息”。
- Mac ARM64 优先匹配 `CoMD-版本-macOS-AppleSilicon.dmg` 或 `CoMD-版本-mac-arm64.dmg`，其次匹配对应 ZIP。
- Windows x64 优先匹配 `CoMD-版本-Windows-x64-Setup.exe`，其次匹配 `CoMD-版本-Windows-x64-Portable.zip` 或 `CoMD-版本-win-x64.zip`。
- 如果缺少当前平台的附件，应用仍提示新版并提供发布页面入口，不会拿另一平台的包代替。
- 不需要额外上传 latest.yml。当前功能负责版本检查及打开官方安装包链接，由用户手动安装；没有静默覆盖、重启安装或应用内下载。
- GitHub Actions 目前只负责手动触发构建并上传 Actions artifacts，不会自动创建 Release。

## 0.3.2 发布说明（可直接复制）

CoMD v0.3.2 新增自动检查更新功能。

- 启动后后台检查新版本，运行期间每 6 小时自动复查。
- 发现新版时在标题栏显示提示，可查看更新说明并下载对应系统的安装包。
- 设置新增“更新”页面，支持手动检查和关闭自动检查；帮助菜单也可手动检查。
- 检查过程不发送文档内容；网络异常不打断编辑，支持重试。
- 保留最近文件/文件夹、文件树、大纲折叠、HTML 混排与双栏双向滚动等功能。

Mac M 系列下载 AppleSilicon.dmg；Windows x64 下载 Setup.exe，免安装使用 Portable.zip。0.3.1 及更早版本请先手动安装本次更新，之后即可检查后续版本。

更新检查不会自动安装。Mac 使用 ad-hoc 签名且未公证，Windows 安装包未签名。Windows 已完成构建与包结构检查，尚未在 Windows 真机验证。

接口参考：[GitHub Latest Release](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)、[Electron net](https://www.electronjs.org/docs/latest/api/net)。
