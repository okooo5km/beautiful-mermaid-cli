# beautiful-mermaid-cli (`bm`) 技术方案

> Author: okooo5km(十里) <yetiannow@gmail.com>
> Date: 2026-04-27
> Status: **Approved v1.0** — 所有决策已确认，待实施
> Repo: github.com/okooo5km/beautiful-mermaid-cli
> License: MIT

---

## 1. 背景与目标

### 1.1 起点
`beautiful-mermaid` 是 [lukilabs](https://github.com/lukilabs/beautiful-mermaid) 开源的 Mermaid 渲染库（TypeScript），其卖点：
- 同步 SVG 渲染（基于 ELK.js 的 FakeWorker bypass）
- 双色基础 + 5 个可选 enrichment 颜色的主题系统
- 15 个内置主题，支持 Shiki VSCode 主题
- 输出 SVG / ASCII 两种格式（**无原生 PNG**）

参考站点：<https://agents.craft.do/mermaid>

### 1.2 目标
做一个名为 `bm` 的命令行工具，**纯前端技术栈**，让用户可以：
- 把 Mermaid 代码（文件 / stdin / 内联）渲染为 **SVG / PNG / ASCII**
- 复用 beautiful-mermaid 的全部主题与配色能力
- 通过 `npm i -g` / `bunx` / `npx` 一键使用，**无原生编译、无浏览器依赖**
- Node.js ≥ 18 与 Bun 双兼容

### 1.3 非目标
- 不做单二进制分发（用户只要纯 npm 包体验）
- 不内置 GUI / Web 服务
- 不去扩展 Mermaid 语法（语法 100% 委托给 beautiful-mermaid）

---

## 2. 命名

| 项 | 名称 | 说明 |
|---|---|---|
| npm 包名 | `beautiful-mermaid-cli` | 全名清晰，避免冲突 |
| 主 bin | `bm` | 简短日常使用 |
| 备用 bin | `beautiful-mermaid` | 兜底，避免与已有 `bm` (bookmark CLI) 冲突 |

> 已知冲突：DeMille/bookmark、bookmark-cli (npm) 都注册了 `bm` 命令，但它们维护停滞（2021）。我们提供双 bin 让用户自选。

---

## 3. 技术栈

| 层 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript | 与 beautiful-mermaid 一致 |
| 运行时 | Node.js ≥ 18 / Bun ≥ 1.0 | 双兼容 |
| 构建 | `tsc` 输出 ESM 到 `dist/` | 简单、Node 与 Bun 都能直接消费 |
| 渲染核心 | `beautiful-mermaid` | 直接调用 `renderMermaidSVG` / `renderMermaidASCII` |
| PNG 转换 | `@resvg/resvg-wasm` | WASM 单文件，对终端用户=纯 JS 依赖 |
| CLI 解析 | `commander` | 子命令 + flag，体积小，TS 友好 |
| 终端着色 | `picocolors` | 极轻量 |
| 测试 | `vitest` | 速度快，TS 原生 |

> **PNG 走 WASM 的关键澄清**：`@resvg/resvg-wasm` 源码是 Rust，但发布产物是 `.wasm` 文件，npm 安装时**不需要 Rust 工具链、不做原生编译**。从用户视角与体感上等价于纯 JS 依赖，跨平台无差异。

---

## 4. 架构

```
┌─────────────────────────────────────────────┐
│              bm CLI (commander)             │
│  ┌─────┐  ┌──────┐  ┌────────┐  ┌───────┐  │
│  │ run │  │themes│  │ ascii  │  │ help  │  │
│  └──┬──┘  └──────┘  └────────┘  └───────┘  │
└─────┼───────────────────────────────────────┘
      │
      ▼
┌──────────────────┐
│   IO Layer       │  file / stdin / -c inline
└────────┬─────────┘
         │ mermaid text
         ▼
┌──────────────────┐
│  Render Layer    │
│  ┌─────────────┐ │
│  │ buildOpts() │ │  解析 --theme / --bg / --fg / --shiki
│  └─────┬───────┘ │
│        ▼         │
│  ┌─────────────┐ │
│  │beautiful-   │ │  renderMermaidSVG / renderMermaidASCII
│  │mermaid      │ │
│  └─────┬───────┘ │
└────────┼─────────┘
         ▼
   ┌───────────┐
   │  format?  │
   └─┬──┬───┬──┘
     │  │   │
     ▼  ▼   ▼
   SVG  PNG ASCII
        │
        ▼
   @resvg/resvg-wasm
```

### 4.1 模块划分

```
src/
├── cli.ts              # 入口，shebang + commander 装配
├── commands/
│   ├── render.ts       # 默认/render：SVG/PNG
│   ├── ascii.ts        # ASCII/Unicode 输出
│   └── themes.ts       # 列出内置主题
├── core/
│   ├── render-svg.ts   # 包装 renderMermaidSVG
│   ├── render-png.ts   # SVG → PNG (resvg-wasm)
│   ├── render-ascii.ts # 包装 renderMermaidASCII
│   └── options.ts      # CLI flag → RenderOptions 映射
├── io/
│   ├── input.ts        # file/stdin/-c 三选一
│   └── output.ts       # file/stdout（含二进制安全）
└── utils/
    ├── format.ts       # 按 -o 扩展名 + -f flag 决定格式
    └── errors.ts       # 友好错误信息
```

---

## 5. CLI 接口设计

### 5.1 命令一览

```
bm [input] [options]              # 默认：渲染（SVG/PNG 由扩展名/--format 决定）
bm render <input> [options]       # 显式 render
bm ascii <input> [options]        # ASCII / Unicode 输出
bm themes                         # 列出 15 个内置主题
bm --help / -h
bm --version / -V
```

### 5.2 输入方式（三选一）

| 方式 | 示例 |
|---|---|
| 文件路径 | `bm diagram.mmd -o out.svg` |
| stdin | `cat diagram.mmd \| bm -o out.svg` |
| 内联代码 | `bm -c "graph LR; A-->B" -o out.svg` |

### 5.3 输出方式

| 方式 | 行为 |
|---|---|
| `-o file.svg` | 写文件，扩展名决定格式 |
| `-o file.png` | 写文件，PNG |
| 不指定 `-o` | SVG/ASCII 输出到 stdout；PNG 必须 `-o`（否则报错） |

### 5.4 完整 flag 列表

| Flag | 类型 | 说明 |
|---|---|---|
| `-o, --output <path>` | string | 输出文件路径 |
| `-f, --format <fmt>` | `svg\|png\|ascii` | 强制格式（覆盖扩展名推断） |
| `-c, --code <text>` | string | 内联 Mermaid 代码 |
| `--theme <name>` | string | 内置主题名（dark/light/dracula/...） |
| `--bg <color>` | string | 背景色 |
| `--fg <color>` | string | 前景色 |
| `--accent <color>` | string | 强调色 |
| `--line <color>` | string | 线条色 |
| `--muted <color>` | string | 弱化色 |
| `--surface <color>` | string | 表面色 |
| `--border <color>` | string | 边框色 |
| `--shiki <name>` | string | 用 Shiki VSCode 主题 |
| `--font <family>` | string | 字体族 |
| `--padding <n>` | number | 画布内边距 |
| `--node-spacing <n>` | number | 节点间距 |
| `--layer-spacing <n>` | number | 层间距 |
| `--thoroughness <n>` | number | 交叉最小化级别 |
| `--transparent` | bool | 透明背景 |
| `--scale <n>` | number | PNG 缩放倍率（仅 PNG） |
| `--width <n>` | number | PNG 输出宽度（仅 PNG） |
| `--quiet` | bool | 静默模式 |

### 5.5 ASCII 子命令额外 flag

| Flag | 类型 | 说明 |
|---|---|---|
| `--unicode` | bool | 用 Unicode 框线（默认 ASCII） |
| `--color-mode <m>` | `auto\|ansi16\|ansi256\|truecolor\|html\|none` | 着色模式 |
| `--box-padding <n>` | number | 框内边距 |

### 5.6 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 通用错误 |
| 2 | 参数错误 |
| 3 | Mermaid 解析失败 |
| 4 | IO 错误（文件不存在 / 写失败） |

---

## 6. 关键实现细节

### 6.1 Shebang & bin
`dist/cli.js` 顶部：
```js
#!/usr/bin/env node
```
`package.json`:
```json
{
  "bin": {
    "bm": "./dist/cli.js",
    "beautiful-mermaid": "./dist/cli.js"
  }
}
```
> Node 与 Bun 都遵守 `#!/usr/bin/env node`，npm/bun 全局安装时会自动 chmod +x 并放到 PATH。Bun 用户若想强制用 Bun 执行，可自行 `bun ./node_modules/.bin/bm ...`。

### 6.2 PNG 转换流程
```ts
// core/render-png.ts
import { initWasm, Resvg } from '@resvg/resvg-wasm'

let inited = false
async function ensureWasm() {
  if (inited) return
  // resvg-wasm 默认会从 npm 包内的 .wasm 文件加载
  await initWasm(/* embedded wasm */)
  inited = true
}

export async function svgToPng(svg: string, opts: { scale?: number; width?: number }) {
  await ensureWasm()
  const resvg = new Resvg(svg, {
    fitTo: opts.width
      ? { mode: 'width', value: opts.width }
      : opts.scale
        ? { mode: 'zoom', value: opts.scale }
        : { mode: 'original' },
    font: { loadSystemFonts: true },
  })
  return resvg.render().asPng() // Uint8Array
}
```
> `@resvg/resvg-wasm` 列为 `optionalDependencies` 或运行时 `await import()`，让只渲染 SVG 的用户不付出 wasm 加载成本。

### 6.3 主题/颜色解析
```ts
// core/options.ts
import { THEMES, fromShikiTheme, DEFAULTS } from 'beautiful-mermaid'

export function buildRenderOptions(flags: CliFlags): RenderOptions {
  let base = DEFAULTS
  if (flags.theme && THEMES[flags.theme]) base = THEMES[flags.theme]
  if (flags.shiki) base = fromShikiTheme(flags.shiki)
  return {
    ...base,
    ...(flags.bg && { bg: flags.bg }),
    ...(flags.fg && { fg: flags.fg }),
    ...(flags.accent && { accent: flags.accent }),
    // ...
    transparent: flags.transparent,
    fontFamily: flags.font,
    padding: flags.padding,
  }
}
```

### 6.4 格式推断
```ts
// utils/format.ts
export function resolveFormat(flags: CliFlags): 'svg' | 'png' | 'ascii' {
  if (flags.format) return flags.format
  if (flags.output) {
    const ext = path.extname(flags.output).toLowerCase()
    if (ext === '.png') return 'png'
    if (ext === '.svg') return 'svg'
    if (ext === '.txt' || ext === '.ascii') return 'ascii'
  }
  return 'svg' // 默认
}
```

### 6.5 stdin 读取
```ts
// io/input.ts
async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error('No input provided')
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}
```

### 6.6 错误处理
- Mermaid 语法错误 → 高亮行号 + 错误片段
- 主题名不存在 → 列出最接近的 3 个建议（用 levenshtein）
- PNG 无 `-o` → 立即 fail，提示文本
- WASM 加载失败 → 提示用户检查 `@resvg/resvg-wasm` 安装

---

## 7. 项目结构

```
beautiful-mermaid-cli/
├── package.json
├── tsconfig.json
├── README.md                  # 用户文档（中英）
├── LICENSE                    # MIT
├── .gitignore
├── .npmignore
├── src/
│   ├── cli.ts
│   ├── commands/
│   ├── core/
│   ├── io/
│   └── utils/
├── tests/
│   ├── render.test.ts
│   ├── cli.test.ts
│   └── fixtures/
│       ├── flowchart.mmd
│       ├── sequence.mmd
│       └── ...
├── dist/                      # 构建产物，npm publish 包含
└── doc/                       # 设计文档（按用户全局 CLAUDE.md 约定）
    ├── architecture.md
    ├── theming.md
    └── png-conversion.md
```

### 7.1 package.json 关键字段

```json
{
  "name": "beautiful-mermaid-cli",
  "version": "0.1.0",
  "description": "Render Mermaid diagrams as beautiful SVG/PNG/ASCII from the command line.",
  "type": "module",
  "bin": {
    "bm": "./dist/cli.js",
    "beautiful-mermaid": "./dist/cli.js"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "beautiful-mermaid": "^x.y.z",
    "commander": "^12",
    "picocolors": "^1"
  },
  "optionalDependencies": {
    "@resvg/resvg-wasm": "^2"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^2",
    "@types/node": "^20"
  },
  "keywords": ["mermaid", "diagram", "cli", "svg", "png", "ascii", "beautiful-mermaid"],
  "author": "okooo5km(十里) <yetiannow@gmail.com>",
  "license": "MIT",
  "homepage": "https://github.com/okooo5km/beautiful-mermaid-cli#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/okooo5km/beautiful-mermaid-cli.git"
  },
  "bugs": {
    "url": "https://github.com/okooo5km/beautiful-mermaid-cli/issues"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

---

## 8. 用户使用样例

```bash
# 全局安装
npm i -g beautiful-mermaid-cli
# 或一次性
bunx beautiful-mermaid-cli ...

# SVG 渲染
bm diagram.mmd -o out.svg

# PNG 渲染（带主题与缩放）
bm diagram.mmd -o out.png --theme dracula --scale 2

# 内联代码 + 自定义双色
bm -c "graph LR; A-->B-->C" -o out.svg --bg "#0d1117" --fg "#c9d1d9"

# Shiki VSCode 主题
bm diagram.mmd --shiki "Catppuccin Mocha" -o out.svg

# stdin 管道
cat diagram.mmd | bm -o out.svg

# ASCII 输出到终端
bm ascii diagram.mmd --unicode --color-mode truecolor

# 列主题
bm themes
```

---

## 9. 测试策略

### 9.1 单元测试（vitest）
- `core/options.ts`：flag → RenderOptions 映射全覆盖
- `utils/format.ts`：扩展名/format flag 各分支
- `io/input.ts`：file / stdin / -c 三种来源

### 9.2 集成测试（spawn 子进程）
- 6 种 fixture（每种 Mermaid 类型一个）→ 渲染产物字节对比 / SVG 结构断言
- PNG 输出：检查文件头 `89 50 4E 47`
- 退出码：错误场景全覆盖

### 9.3 手动验收清单
- [ ] Node 18 / 20 / 22 各跑一遍
- [ ] Bun 最新版跑一遍
- [ ] macOS / Linux / Windows（CI 矩阵）
- [ ] 6 种图类型 × 至少 3 个主题 × 2 个格式

### 9.4 持续集成（CI）

**触发**：每次 PR / push 到 `main` 自动跑测试矩阵。

**矩阵**：
- OS: `ubuntu-latest` / `macos-latest` / `windows-latest`
- Runtime: `node@20` / `node@22` / `bun-latest`
- 语义：测覆盖最新 LTS（20）+ 当前 LTS（22）+ Bun 最新

`.github/workflows/ci.yml`（完整文件）：
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test-node:
    name: Test (Node ${{ matrix.node }} on ${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: ['20', '22']
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build

  test-bun:
    name: Test (Bun on ${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun test
      - run: bun run build
```

### 9.5 工具版本策略 ⚠️ 重要

> **痛点回顾**：以往项目里 GitHub Actions 经常用旧版（`@v3`/`@v2`），导致 deprecation 提醒不断、Node.js 16 EOL 警告等。本项目立规：

**核心原则**：
1. **只锁主版本号**（`@v5`、`@v2`），不锁次版本，自动获得官方安全/兼容更新
2. **Node.js 仅支持 active LTS**：当前为 `20`、`22`；`18` 已 EOL（2025-04），不再纳入矩阵
3. **每季度 review 一次** action 主版本，年底统一升级到当年最新主版本
4. **Renovate / Dependabot 启用**：自动 PR 更新依赖（包括 actions）

**当前锁定版本表（2026-04 最新主版本）**：

| 依赖类型 | 名称 | 版本 |
|---|---|---|
| GitHub Action | `actions/checkout` | **@v5** |
| GitHub Action | `actions/setup-node` | **@v5** |
| GitHub Action | `oven-sh/setup-bun` | **@v2** |
| GitHub Action | `softprops/action-gh-release` | **@v2** |
| GitHub Action | `dawidd6/action-homebrew-bump-formula` | **@v4** |
| Node.js | LTS | **20 / 22** |
| Bun | latest | **latest tag** |
| TypeScript | major | **^5** |
| Vitest | major | **^3** |
| Commander | major | **^14** |

> 实施时 CI 第一次跑会自动用上述主版本下的最新次版本/补丁版本，避免 deprecation 警告。

### 9.6 Dependabot 配置

`.github/dependabot.yml`：
```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    groups:
      dev-dependencies:
        dependency-type: 'development'

  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
```

---

## 10. 分发与发布流程

最终用户可通过三种渠道安装：

| 渠道 | 命令 | 适用人群 |
|---|---|---|
| **npm 全局** | `npm i -g beautiful-mermaid-cli` | Node 用户 |
| **bun 全局** | `bun add -g beautiful-mermaid-cli` | Bun 用户 |
| **npx / bunx 一次性** | `npx beautiful-mermaid-cli ...` / `bunx beautiful-mermaid-cli ...` | 试用、CI 一次性使用 |
| **Homebrew** | `brew install okooo5km/tap/bm` | macOS / Linux Homebrew 用户 |

启用 npm provenance 后，**所有发布必须从 GitHub Actions 触发**，本地 `npm publish` 不再使用。

### 10.1 一次性配置

1. **npm**
   - 在 npmjs.com 创建 `beautiful-mermaid-cli` 包名（占位发布 0.0.0 一次）
   - 绑定 GitHub 仓库 `okooo5km/beautiful-mermaid-cli`（包页面 → Settings → GitHub repository）
2. **GitHub Secrets**（仓库 Settings → Secrets and variables → Actions）
   - `NPM_TOKEN`：npm Automation Token（启用 2FA bypass for CI）
   - `HOMEBREW_TAP_TOKEN`：访问 `okooo5km/homebrew-tap` 的 fine-grained PAT，仅 Contents:Write 权限
3. **创建 Homebrew tap 仓库**：`github.com/okooo5km/homebrew-tap`（一次性）
4. **加权限**：在 `okooo5km/beautiful-mermaid-cli` 仓库 Settings → Actions → General → Workflow permissions 勾选 **Read and write**

### 10.2 发布触发

开发者本地：
```bash
git checkout main && git pull
npm version patch          # 或 minor / major，自动写 package.json + 打 tag v1.2.3
git push --follow-tags     # 推 tag 触发 release workflow
```

GitHub Actions `release.yml` 自动按顺序执行：

1. **构建测试** —— `npm ci` → `lint` → `typecheck` → `test` → `build`
2. **npm 发布** —— `npm publish --provenance --access public`
3. **GitHub Release** —— 基于 conventional commits 自动生成 changelog
4. **Homebrew tap 更新** —— 计算 npm tarball 的 SHA-256，自动 PR/commit 到 `okooo5km/homebrew-tap`

### 10.3 `.github/workflows/release.yml`（完整文件）

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write       # GitHub Release
  id-token: write       # npm provenance（必需）

jobs:
  release:
    name: Release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0   # 完整历史，用于生成 changelog

      - uses: actions/setup-node@v5
        with:
          node-version: '22'
          registry-url: 'https://registry.npmjs.org'
          cache: 'npm'

      - name: Install
        run: npm ci

      - name: Verify
        run: |
          npm run lint
          npm run typecheck
          npm test
          npm run build

      - name: Publish to npm with provenance
        run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          draft: false
          prerelease: ${{ contains(github.ref_name, '-') }}

      - name: Bump Homebrew formula
        uses: dawidd6/action-homebrew-bump-formula@v4
        with:
          token: ${{ secrets.HOMEBREW_TAP_TOKEN }}
          tap: okooo5km/homebrew-tap
          formula: bm
          tag: ${{ github.ref_name }}
          revision: ${{ github.sha }}
          force: false
```

### 10.4 Homebrew Formula 设计

仓库：`github.com/okooo5km/homebrew-tap`，文件：`Formula/bm.rb`。

**初始 formula**（首次发版后由维护者手写一次，之后由 CI 自动 bump）：

```ruby
class Bm < Formula
  desc "Render Mermaid diagrams as beautiful SVG/PNG/ASCII from the command line"
  homepage "https://github.com/okooo5km/beautiful-mermaid-cli"
  url "https://registry.npmjs.org/beautiful-mermaid-cli/-/beautiful-mermaid-cli-0.1.0.tgz"
  sha256 "<填入 tarball 的 sha256>"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "beautiful-mermaid-cli", shell_output("#{bin}/bm --version")
  end
end
```

**用户安装路径**：
```bash
brew tap okooo5km/tap                   # 一次性 tap
brew install bm                         # 装 bm 命令
# 或一行：
brew install okooo5km/tap/bm
```

**自动 bump 行为**（`dawidd6/action-homebrew-bump-formula@v4`）：
- 计算新 tarball 的 SHA-256
- 修改 `Formula/bm.rb` 的 `url` 和 `sha256`
- 直接 commit 到 `okooo5km/homebrew-tap` 的默认分支（也可改为开 PR）

### 10.5 用户视角的命令一览

```bash
# 用 npm
npm i -g beautiful-mermaid-cli
bm diagram.mmd -o out.svg

# 用 Bun
bun add -g beautiful-mermaid-cli
bm diagram.mmd -o out.svg

# 一次性（不安装）
npx beautiful-mermaid-cli diagram.mmd -o out.svg
bunx beautiful-mermaid-cli diagram.mmd -o out.svg

# Homebrew
brew install okooo5km/tap/bm
bm diagram.mmd -o out.svg
```

发布完成后，npmjs.com 包页面会显示 **Provenance** 徽章，可点击查看 GitHub commit 与 workflow run 的完整溯源链。

---

## 11. 路线图

### v0.1（MVP）
- [x] 方案确定
- [ ] 项目脚手架（TS + ESM + tsconfig + vitest + eslint + prettier）
- [ ] SVG 渲染 + 主题
- [ ] PNG 渲染（resvg-wasm）
- [ ] ASCII 渲染
- [ ] file/stdin/-c 输入
- [ ] `themes` 子命令
- [ ] CI workflow（`ci.yml`，含 Node 20/22 + Bun 矩阵）
- [ ] Release workflow（`release.yml`，含 npm provenance + GitHub Release + Homebrew bump）
- [ ] Dependabot 配置
- [ ] 创建 `okooo5km/homebrew-tap` 仓库 + 初始 `Formula/bm.rb`
- [ ] README（中英 + 三种安装方式徽章）

### v0.2
- [ ] 配置文件 `bm.config.{json,ts}`，统一默认 flag
- [ ] watch 模式：`bm watch ./docs/*.mmd -o ./out/`
- [ ] 批量渲染：glob 输入 → 多文件输出

### v0.3
- [ ] 自定义主题文件加载（YAML/JSON）
- [ ] 输出 PDF（用 svg2pdf-js，纯 JS）
- [ ] 嵌入 Markdown：`bm md ./README.md`，把 Markdown 中的 ```mermaid 块渲染并替换为 SVG 引用

---

## 12. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| `bm` 命令名冲突 | 用户安装后冲突 | 提供 `beautiful-mermaid` 备用 bin |
| `@resvg/resvg-wasm` 加载失败 | PNG 不可用 | 列为 optionalDeps，提供清晰报错 |
| SVG → PNG 字体缺失 | 文字渲染异常 | 默认 `loadSystemFonts: true`，提示用户安装常见字体 |
| beautiful-mermaid API 变更 | 包不可用 | 锁定 `^` minor 范围，自动测试 |
| Bun 与 Node ESM 差异 | 兼容问题 | CI 双跑；只用纯 ESM 标准 API |

---

## 13. 已确认决策

| # | 项 | 决策 |
|---|---|---|
| 1 | PNG 渲染方案 | ✅ 启用，走 `@resvg/resvg-wasm`（WASM，纯 JS 安装体验） |
| 2 | CLI 命令名 | ✅ `bm`（主） + `beautiful-mermaid`（备）双 bin |
| 3 | License | ✅ **MIT** |
| 4 | GitHub 仓库 | ✅ **github.com/okooo5km/beautiful-mermaid-cli** |
| 5 | npm provenance | ✅ **启用** —— 仅通过 GitHub Actions 发布，包页面带溯源徽章 |
| 6 | 作者署名 | ✅ `okooo5km(十里) <yetiannow@gmail.com>` |
| 7 | 运行时支持 | ✅ Node.js ≥ 20（LTS）与 Bun ≥ 1.0 双兼容 |
| 8 | 分发渠道 | ✅ npm / bun / npx / bunx / **Homebrew tap** (`okooo5km/homebrew-tap`) |
| 9 | CI 工具版本策略 | ✅ 全部锁主版本（`@v5` / `@v2`），季度 review，启用 Dependabot |

---

## 14. 立即下一步

确认本方案后，按 11 节 v0.1 任务清单顺序实施，估计 1-2 个工作日完成 MVP。
