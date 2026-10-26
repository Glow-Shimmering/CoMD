import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = path.resolve('.');
const destination = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('../../outputs/CoMD-0.3.2');
await fs.mkdir(destination, { recursive: true });
const artifacts = [
  ['CoMD-0.3.2-mac-arm64.dmg','CoMD-0.3.2-macOS-AppleSilicon.dmg'],
  ['CoMD-0.3.2-mac-arm64.zip','CoMD-0.3.2-macOS-AppleSilicon.zip'],
  ['CoMD-0.3.2-Windows-x64-Setup.exe','CoMD-0.3.2-Windows-x64-Setup.exe'],
  ['CoMD-0.3.2-win-x64.zip','CoMD-0.3.2-Windows-x64-Portable.zip']
];
for (const [source, target] of artifacts) await fs.copyFile(path.join(root, 'release', '0.3.2', source), path.join(destination, target));
await fs.copyFile('build/icon.png', path.join(destination, 'CoMD-icon.png'));
await fs.copyFile('test-results/CoMD-light-live.png', path.join(destination, 'CoMD-light.png'));
await fs.copyFile('test-results/CoMD-dark-reading.png', path.join(destination, 'CoMD-dark.png'));
await fs.copyFile('test-results/CoMD-outline.png', path.join(destination, 'CoMD-outline.png'));
await fs.copyFile('test-results/CoMD-folder-html.png', path.join(destination, 'CoMD-folder-html.png'));
await fs.copyFile('test-results/CoMD-recent.png', path.join(destination, 'CoMD-recent.png'));
await fs.copyFile('test-results/CoMD-updates.png', path.join(destination, 'CoMD-updates.png'));
await fs.copyFile('docs/RELEASING.md', path.join(destination, '发布指南.md'));
await fs.copyFile('test-results/desktop-report.json', 'docs/validation-report.json');
await fs.copyFile('docs/VALIDATION.md', path.join(destination, '验证说明.md'));
const usage = `# CoMD 0.3.2

专注文字，自在表达。

0.3.2：新增启动后自动检查更新、手动检查、版本说明与平台安装包下载入口。

## 安装

**Mac（M 系列，macOS 13+）**：打开 CoMD-0.3.2-macOS-AppleSilicon.dmg，将 CoMD 拖入 Applications，然后从启动台/应用程序打开。ZIP 是同一应用的压缩版本。

**Windows（x64，Windows 10/11）**：运行 CoMD-0.3.2-Windows-x64-Setup.exe。若不想安装，解压 Portable.zip，进入目录双击 CoMD.exe；不要单独移动 EXE，旁边的资源文件必须一起保留。

当前版本未使用商业发布证书：Mac 为本机 ad-hoc 签名，未做 Apple 公证；Windows 安装包未签名。系统可能出现开发者身份提示。确认来源为本次交付后，可使用系统的“仍要打开/仍要运行”流程，不必关闭全局安全保护。

## 开始写作

按 Cmd/Ctrl+O 打开 Markdown，Cmd/Ctrl+N 新建，Cmd/Ctrl+S 保存。支持实时排版、源码、双栏和阅读四种模式。表格、图片与公式在双栏/阅读模式中完整显示。

Cmd/Ctrl+Shift+O 打开文件夹，在“文件”侧栏展开目录，点击文件打开新标签页；文件夹可刷新，重启后恢复。点击“打开文件夹”下方的“最近打开”，搜索并选择最近使用的文件或文件夹；已打开文档通过顶部标签切换。“大纲”展示标题树。点击标题左侧箭头折叠/展开下级，点击标题文字跳转；切换文档会保留本次运行中的折叠状态。

双栏支持双向滚动同步。Markdown 中的常见 HTML 标签（div、span、table、details、font 等）及颜色、字体、对齐等行内样式在双栏/阅读/导出中显示；实时和源码模式保留标签。脚本、iframe 和页面样式表不执行。

已命名文件默认自动保存，未命名文档作为本机草稿恢复。文件被其他程序修改时会暂停自动保存并提示选择。右上角菜单可以导出 PDF/HTML，设置中可调整主题与字号。

AI 为可选功能：配置自己的兼容 API、模型 ID 和 API Key，选中文字后点击 AI 编辑。仅在手动发送时上传选区和要求；生成结果需接受后才替换原文。不附带模型额度，不能直接使用 Codex 订阅。

## 检查更新

默认启动约 10 秒后检查 GitHub 最新正式版本，运行期间每 6 小时复查。发现新版时，点击右上角“发现新版本”，或进入设置 → 更新。可以手动检查、关闭自动检查、查看更新说明及下载安装包。检查不发送文档内容；下载安装需手动确认。

0.3.1 及更早版本需要先手动安装本次 0.3.2，之后才能检查后续版本。维护者发布时使用 v0.3.2 这样的标签，上传安装包并设为正式的最新 Release；详见发布指南.md。

## 验证与源码

Mac 版已在本机 Apple Silicon 实际启动并进行交互测试。Windows 版已完成交叉构建、文件结构与 EXE 元信息检查，尚未在 Windows 真机运行。真实 AI 服务尚未连接；接口及审阅流程通过本地模拟服务测试。

Source.zip 包含全部源码、锁定依赖、测试和构建脚本，不包含 node_modules。详细说明见源码内 README.md。SHA256SUMS.txt 可用于核对文件完整性。
`;
await fs.writeFile(path.join(destination, '使用说明.md'), usage);
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'comd-source-'));
try {
  const sourceRoot = path.join(stage, 'CoMD'); await fs.mkdir(sourceRoot);
  for (const entry of ['src','electron','scripts','tests','docs','.github','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','.gitignore','README.md','LICENSE','THIRD-PARTY-NOTICES.txt']) await fs.cp(path.join(root,entry),path.join(sourceRoot,entry),{recursive:true});
  await fs.mkdir(path.join(sourceRoot,'build'));
  for (const icon of ['icon.svg','icon.png','icon.icns','icon.ico']) await fs.copyFile(path.join(root,'build',icon),path.join(sourceRoot,'build',icon));
  const zip = path.join(destination,'CoMD-0.3.2-Source.zip');
  execFileSync('ditto',['-c','-k','--keepParent',sourceRoot,zip]);
} finally { await fs.rm(stage,{recursive:true,force:true}); }
const names = (await fs.readdir(destination)).filter(name => !['SHA256SUMS.txt'].includes(name)).sort();
let sums = '';
for (const name of names) { const bytes = await fs.readFile(path.join(destination,name)); sums += `${crypto.createHash('sha256').update(bytes).digest('hex')}  ${name}\n`; console.log(`${name}: ${(bytes.length/1048576).toFixed(2)} MB`); }
await fs.writeFile(path.join(destination, 'SHA256SUMS.txt'), sums);
console.log('Delivery directory:',destination);
