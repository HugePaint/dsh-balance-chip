# dsh-balance-chip

**侧边栏左下角的两行**：实时账户余额，以及当前 DeepSeek 计费时段（高峰 / 空闲）和它几点结束。

[English](README.md) · [Agent 安装指南](AGENT-INSTALL.zh.md) · [MIT 许可](LICENSE)

```
┌─ 侧边栏底部 ─────────────────┐
│  余额                   ¥12.34 │  ← 余额行
│  空闲            09:00 结束    │  ← 峰谷时段行
│  🟣 账号                       │  ← 既有账号行
└──────────────────────────────┘
```

余额行在头像 / 账号行的**正上方**，峰谷行紧随其下。两行都注册在 `sidebar.footer.action`（`kind: list`）里，不改动、不包裹任何既有界面。

> 为什么不在头像行里：头像行是 `settings.trigger`，`kind: single`，已被 `dsh-client-ui-settings-general` 独占。可用的最近插槽是它上方的 `sidebar.footer.action`。

## 显示什么

| | |
|---|---|
| **余额** | 复用「设置 → 账号」同一个 `account` Remote 的实时钱包总额。赠金追加为 `+¥0.50`；金额截断到分、带千分位；不足一分显示 `<¥0.01`。**读取失败保留上一次的数字**，不闪空。 |
| **峰谷时段** | `高峰`（琥珀）或 `空闲`（绿色），以及它几点结束 —— `12:00`、`明天 09:00`、`周一 09:00`、`3月3日 09:00`。 |
| **悬停** | 三行短文：现状 + 倒计时、依据（高峰窗口 / 周末 / 法定节假日）、价格说明与点击行为。 |
| **点击** | 余额行打开用量页（地址来自账号状态流）。峰谷行打开官方计费说明页。 |
| **侧边栏收起** | 余额只显示金额；峰谷只显示 `峰` / `闲`（分色）。 |

每个状态都渲染可见内容 —— 读取中 `…`、未登录、没有钱包、读取失败 —— 所以「插件没加载」和「加载了但没数据」永远不会看起来一样。

## 计费时段

峰谷行照搬 DeepSeek 公开规则，**按北京时间（UTC+8）**：

- **高峰**：周一至周五 09:00–12:00、14:00–18:00，**不含中国法定节假日**；
- **空闲**：其余全部时段 —— 12:00–14:00、18:00 之后、周末与法定节假日全天；
- 空闲价格为高峰的一半。

来源：[模型 & 价格（中文）](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) · [Model & Pricing (EN)](https://api-docs.deepseek.com/quick_start/pricing) · 2026 年放假日期依据[国务院办公厅关于 2026 年部分节假日安排的通知](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm)（国办发明电〔2025〕7号）。价格与时段可能调整，**以官方页面为准**。

判断是纯本地算术（`Date.now()` + 上面的规则），全程按北京挂钟计算，因此结论**与机器时区无关**。机器不在 UTC+8 时，行内会加上 `北京 ` 前缀，悬停里另给本地时间。

节假日表编译在 `lib/client.js` 的 `HOLIDAY_TABLE`，当前收录 2026 年。调休上班的周末仍按周末计，所以不需要单独维护调休表。表外年份（如 2027 年通知尚未发布时）退化为「只看工作日」，并在悬停里标注。

## 安装

需要 DSH 0.2.x；安装脚本需要 Python 3。Node.js 可选 —— 只有离线测试需要。

### 交给 AI 助手

把仓库（或 Release 里的 zip）交给你的助手，让它读 [`AGENT-INSTALL.zh.md`](AGENT-INSTALL.zh.md)。那份指南覆盖环境检查、离线校验、安装、激活、回报、排查、回滚，以及没有 Python 时的手动路径。

### 自己装

```bash
python3 install.py          # macOS / Linux
python install.py           # Windows
```

脚本扫描 `$DSH_HOME/profiles/*`（默认 `~/.dsh/profiles`），把 4 个文件复制进 `<profile>/node_modules/dsh-balance-chip/`，并在该 profile 的 `cordis.patch.yml` 末尾追加一条 `insert` 条目。**不碰** profile 的 `package.json` 与 `dsh.profile.bundles`，不联网，幂等。

```bash
python3 install.py --list           # 只看检测到哪些 profile，不改动
python3 install.py --profile web    # 只装一个 profile（可重复）
python3 install.py --uninstall      # 摘掉条目，保留包目录
python3 install.py --purge          # 连包目录一起删
```

让它生效：先在窗口里按 `Ctrl+R` / `Cmd+R`；不够就**完全退出** DSH 再打开（macOS `⌘Q`，关窗口不退进程）。

用 Release 的 zip：解压 `dsh-balance-chip-<版本>.zip`，在目录里跑同一条命令。

## 配置

条目 `config` 全部可选；任何一项写错都退回默认值，不会让整行消失。

```yaml
- insert:
    - id: balance-chip
      name: "dsh-balance-chip"
      config:
        windows: ["09:00-12:00", "14:00-18:00"]   # 北京时间；也可写 [[540,720],[840,1080]]
        weekdays: [1, 2, 3, 4, 5]                 # 视为工作日的星期（0 = 周日）
        holidays: ["2027-01-01", "2027-02-06"]    # 追加放假日，与内置表取并集
        ignoreHolidays: false                     # true = 完全忽略节假日
        zoneOffsetMinutes: 480                    # 规则所在时区
        pricingUrl: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/"
```

## 实现要点

- **两端各一半。** `lib/client.js` 是浏览器端：渲染两行、走现成的 `account` Remote 取余额（`getBalance` 取值、`watch` 取登录态与用量地址）、本地推算时段。`lib/index.js` 是宿主端 —— 加载器也会在宿主侧 import 每个包，它只带一个加载探针。
- **一个插槽，用 `order` 定序。** 余额 `order: 10`、峰谷 `order: 20`，同在 `sidebar.footer.action`（`kind: list`、`scope: root`）。
- **纯函数 + 薄组件。** `periodAt` / `describeChip` 无副作用，通过 `exports.period` 导出；组件只负责把字符串画出来。加载器只读 `apply` / `inject`，多导出不影响加载。
- **list 插槽必须带 `id`。** 少了会在运行时抛 `list slot ... requires options.id`，表现为「插件已启用但界面无痕」。
- **`inject` 必须写全**：`["slots", "locale", "remote", "remote.account"]`。cordis 只把已声明的服务挂到 `ctx`，访问未声明的会直接抛错（不是返回 `undefined`）。
- **不联网、不读凭据、无宿主业务代码。** 唯一外发动作是点击时的 `window.open(url, "_blank", "noopener,noreferrer")`；宿主端唯一的写入是 `try/catch` 里的 `/tmp` 加载探针。
- **只走主题 token**（`--dsw-alias-*`），明暗主题都跟。
- **启用条目必须写成 `insert` 形式。** 裸条目（`- id: X`）在 patch 语义里是「覆盖已有条目」，本包不在任何 bundle 里，那样写不会被加载。

### 悬停说明

悬停用原生 `title`，**按行组织**（`\n` 分隔，Chromium 渲染成多行），每行只说一件事、都不长（实测最长 32 字，上界卡在 44）：

```
空闲时段 · 明天 09:00 结束（还有 13 小时）
高峰窗口：工作日 09:00–12:00、14:00–18:00
空闲价格为高峰的一半 · 点击查看计费说明
```

行序固定为 **现状 → 依据 →（补充）→ 价格与入口**；余额行的悬停是两行（金额 + 入口），失败原因单独一行。`aria-label` 另给单行版本，读屏不会被价格说明和入口打断。

## 刷新时机

| 触发 | 说明 |
|---|---|
| 挂载 | 余额首次读取，峰谷首次推算 |
| 账号状态流 | 登录、登出、切换账号立即反映并重读 |
| 重新可见 | 徽标（含侧边栏重新展开）回到可视区域时补一次 |
| 窗口获得焦点 / 切回标签页 | 切回应用时刷新 |
| 60 秒兜底轮询 | 余额行 |
| 15 秒 | 峰谷行跨过窗口边界时立刻换文案，悬停里的倒计时保持新鲜 |

余额只在消耗 token 时变化，所以不做真正的「推送」；这套组合的效果是回到应用、跑完一轮后数字已是最新。

## 兼容性

针对 DSH `0.2.0-rc.2` + `@deepseek-ai/cordis` `4.0.4`（本机桌面版实际版本）开发。包本身不声明任何 `@deepseek-ai/dsh*` peer 依赖，所以不会被 DSH 的兼容性闸门拦住；运行时需要的是 `sidebar.footer.action` 插槽与 `slots` / `locale` / `remote.account` 三个服务。

## 开发与测试

```bash
node test-client.cjs .                       # 余额行，假 Remote，不需要浏览器
node test-peak.cjs .                         # 时段推算、文案、悬停排版
TZ=Pacific/Kiritimati node test-peak.cjs .   # 换时区应得到同一份结论
```

两套测试全部离线：自搭最小 React hooks 运行时、假 `ctx`、假 `account` Remote。`test-peak.cjs` 覆盖窗口边界、跨夜、跨周末、2026 年每个假期块、config 回退与悬停行长度，并打印一行 `SCHEDULE-FINGERPRINT`，该行在不同时区下必须逐字相同。

## 版本

| 版本 | 日期 | 说明 |
|---|---|---|
| 1.1.1 | 2026-10-15 | 悬停改为按行组织；`aria-label` 独立为单行 |
| 1.1.0 | 2026-10-14 | 新增峰谷时段行（时段、结束时刻、节假日表、config） |
| 1.0.0 | 2026-10-14 | 仅余额行 |

## 包内文件

| 文件 | 作用 | 装进 profile |
|---|---|---|
| `package.json` | 包清单：`main`、`exports`、`dsh.bundle.patch`、`dsh.client.inject` | ✅ |
| `lib/index.js` | 宿主端：只有加载探针 | ✅ |
| `lib/client.js` | 浏览器端：两行徽标、峰谷推算与文案 | ✅ |
| `cordis.patch.yml` | bundle 形式的 patch（改用官方 `dsh plugin add` 时用） | ✅ |
| `install.py` | 安装 / 卸载脚本（`PAYLOAD` 只复制上面 4 个文件） | ❌ |
| `AGENT-INSTALL.zh.md` / `AGENT-INSTALL.md` | 给 AI 助手的安装指南（中 / 英） | ❌ |
| `SHARE.zh.md` | 可直接复制的转发正文 | ❌ |
| `test-client.cjs` / `test-peak.cjs` | 离线测试 | ❌ |

## 署名

由 **Ivan Chen** 与 **[HugePaint](https://github.com/HugePaint)** 构建。

非 DeepSeek 官方项目。显示的时段与价格来自 DeepSeek，插件只在本地复现公开规则。

## 许可

[MIT](LICENSE) © 2026 Ivan Chen, HugePaint
