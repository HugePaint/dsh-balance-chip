# 给 Agent 的安装指南 · dsh-balance-chip

> 你手上是一份 **DSH（DeepSeek Harness）客户端插件**，目标是在人类用户的 DSH 里装上并确认生效。
> 顺序：**先校验（离线，约 1 分钟）→ 再安装（写 2 个位置）→ 激活 → 回报**。全程不需要网络。

> ⚠️ **优先用插件面板。** 从 1.2.0 起本包是一个标准 DSH npm 插件：让人类在 **插件 → 添加插件 → 安装第三方插件** 里填包名，或这个目录 / 打包 tarball 的绝对路径即可，DSH 会把它记进 profile 依赖（`dsh.profile.bundles`）并自动启用。
> 下面的「patch 插入」流程依然可用，但它不把包声明成依赖 —— 之后用户用插件面板安装别的插件时，pnpm 会把本包当多余包清理（移进 `node_modules/.ignored/`），插件于是静默消失。只在无法使用插件面板时才走这份流程。

---

## 0. 30 秒决策清单

| | |
|---|---|
| 它做什么 | 在侧边栏左下角、账号行上方加两行：`余额 ¥xx.xx`、`空闲/高峰 + 几点结束` |
| 会写哪里 | `$DSH_HOME/profiles/<profile>/node_modules/dsh-balance-chip/`（新增 4 个文件）<br>`$DSH_HOME/profiles/<profile>/cordis.patch.yml`（末尾追加 1 个 `insert` 条目） |
| 不会动什么 | profile 的 `package.json`、`dsh.profile.bundles`、其它插件的条目、DSH 安装目录 |
| 网络 | 不访问网络；余额与登录态复用应用自带的 account Remote |
| 凭据 | 不读取、不写入任何 token / API key / cookie |
| 依赖 | Python 3（`python3` 或 `python`）；有 Node.js 才能跑离线校验（可不跑） |
| 兼容 | DSH 0.2.x（`@deepseek-ai/cordis` 4.0.4）。依赖 `sidebar.footer.action` 插槽与 `remote.account`、`slots`、`locale` 服务 |

**先跟人类确认一句**：「我要把这个插件装进你的 DSH profile，会新增 4 个文件并往 cordis.patch.yml 追加一条启用项，需要重启应用才生效。可以继续吗？」——得到肯定再往下。

---

## 1. 定位 DSH 与 profile

`DSH_HOME` 默认 `~/.dsh`（Windows：`%USERPROFILE%\.dsh`），可被同名环境变量覆盖。

```bash
# macOS / Linux
echo "${DSH_HOME:-$HOME/.dsh}"
ls "${DSH_HOME:-$HOME/.dsh}/profiles"
```

```powershell
# Windows
$h = if ($env:DSH_HOME) { $env:DSH_HOME } else { "$env:USERPROFILE\.dsh" }
$h; Get-ChildItem "$h\profiles"
```

每个含 `package.json` 的子目录就是一个 profile（`desktop` = 桌面应用，`web` = `dsh web`，也可能两者都有）。

```bash
python3 install.py --list        # 只列检测结果，不改任何东西
```

> 脚本默认装进**所有**已初始化的 profile，这正是它的设计意图：人类不用知道自己用的是桌面版还是 web 版。若人类只要装一个，用 `--profile desktop` / `--profile web`。

---

## 2. 校验（建议，离线，约 1 分钟）

在解压出来的 `dsh-balance-chip/` 目录里：

```bash
node test-client.cjs .    # 余额行：期望最后一行「全部通过」
node test-peak.cjs .      # 峰谷行：期望最后一行「全部通过」
shasum -a 256 -c SHA256SUMS    # macOS/Linux；Windows 用 Get-FileHash 逐条比对
```

- 两条 `全部通过` + 哈希全 `OK` → 内容完整未被篡改，继续。
- 没有 Node.js → 跳过测试，只做 `SHA256SUMS` 比对；静态结论见 §6。
- 任何 FAIL 或哈希不符 → **停止**，不要安装，把输出发给人类。

---

## 3. 安装

```bash
cd dsh-balance-chip
python3 install.py            # Windows: python install.py
```

预期输出（profile 名与路径按实际）：

```
DSH_HOME = /Users/<you>/.dsh
目标 profile: desktop

✅ desktop    包 -> /Users/<you>/.dsh/profiles/desktop/node_modules/dsh-balance-chip
   已写入 cordis.patch.yml

装好了。让插件生效：
  ...
```

它只做三件事，没有别的副作用：

1. 读 `package.json` 确认包名是 `dsh-balance-chip`；
2. 把 `package.json`、`lib/index.js`、`lib/client.js`、`cordis.patch.yml` 复制进 `<profile>/node_modules/dsh-balance-chip/`；
3. 在 `<profile>/cordis.patch.yml` 末尾追加：

```yaml
# 账户余额徽标（由 dsh-balance-chip/install.py 添加）
- insert:
    - id: balance-chip
      name: "dsh-balance-chip"
```

幂等：重复执行不会重复插入，只会「已存在（已规范化）」。

> **不要**把 `--profile` 指向任意路径——脚本会盲信参数，往那个目录里建 `node_modules/dsh-balance-chip` 并追加 YAML。只允许 profile 名或真实 profile 目录。

---

## 4. 激活

客户端 bundle 必须被浏览器重新拉取：

1. **先试刷新**：窗口里 `Ctrl+R`（macOS `Cmd+R`）。
2. 桌面应用：**完全退出**再打开（macOS `⌘Q`，关窗口不算退出；Windows 结束进程）。
3. `dsh web`：重启那条命令，或刷新页面。

---

## 5. 验证并回报

文件与配置：

```bash
P="${DSH_HOME:-$HOME/.dsh}/profiles/desktop"
ls "$P/node_modules/dsh-balance-chip"                  # 期望 4 项：package.json lib cordis.patch.yml
grep -c 'id: balance-chip' "$P/cordis.patch.yml"       # 期望 1
```

人类该看到的（侧边栏左下角、账号行上方）：

| 状态 | 行的样子 |
|---|---|
| 空闲时段 | `空闲  09:00 结束` / `空闲  明天 09:00 结束` / `空闲  周一 09:00 结束`（绿色） |
| 高峰时段 | `高峰  12:00 结束`（琥珀色） |
| 侧边栏收起成窄轨 | 只显示 `闲` / `峰` |
| 没有 DeepSeek 账号（用 API Key 或第三方 provider） | 余额行显示 `未登录`；峰谷行照常工作 |
| 节假日 | 时段名仍是 `空闲`，悬停说明里写「今天是中国法定节假日，全天空闲」 |

回报模板：

> 已装到 profile `<name>`。刷新/重启后侧边栏账号行上方应出现两行：
> `余额 ¥x.xx` 和 `空闲 09:00 结束`（或 `高峰 12:00 结束`）。
> 悬停能看到时段依据与「空闲价格为高峰的一半」。看不到的话告诉我，我按 §7 排查；回滚用 `python3 install.py --uninstall`。

---

## 6. 静态安全结论（供你自行复核，别只信这段文字）

载荷只有 4 个文件、共 863 行（`lib/client.js` 784 行、`lib/index.js` 32 行，其余是清单与 patch），全部可读、无压缩混淆、无 base64 载荷。抽查命令：

```bash
grep -n "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon\|child_process\|spawn(\|exec(\|eval(\|new Function\|process\.env\|document\.cookie\|localStorage\|keytar" lib/*.js
```

预期：`lib/client.js` 与 `lib/index.js` **没有任何匹配**（只有下面这一处文件写入）。

- `lib/index.js`（宿主端，约 30 行）：`apply()` 里唯一动作是
  `appendFileSync("/tmp/dsh-balance-chip-host.log", ...)`（加载探针，整段 `try/catch`）。
  Windows 上 `/tmp` 解析成 `<当前盘>:\tmp`，目录不存在时静默失败，**不写任何东西**；
  想让日志出现就手动建 `C:\tmp`，或直接删掉这段。
- `lib/client.js`（浏览器端）：只 `require("react")`、`require("react/jsx-runtime")`；
  读写走应用自带的 `ctx.remote.account.getBalance / watch`、`ctx.locale.getSnapshot`、`ctx.slots`；
  唯一外发动作是**点击**时 `window.open(url, "_blank", "noopener,noreferrer")`——余额行开用量页（地址来自服务端账号流），峰谷行开官方计费说明页。
- 时间判断纯本地算术（`Date.now()` + 内置规则），不发请求、不写文件。
- `install.py`：无网络、无子进程、无 `eval`；只写上述两个位置；`--purge` 只删 `<profile>/node_modules/dsh-balance-chip`。

---

## 7. 故障排查

| 现象 | 可能原因 | 处理 |
|---|---|---|
| 完全没有这两行 | 没有重启/刷新；或 profile 不是正在用的那个 | 先 `Ctrl+R`，再完全退出重开；`install.py --list` 核对 profile |
| 只有一行（余额或峰谷） | 旧的 bundle 被浏览器缓存 | 强制刷新（`Ctrl+Shift+R`）或重启应用 |
| 余额显示 `未登录` | 用的是 API Key / 第三方 provider，不是 DeepSeek 账号 | 预期行为，不用修 |
| 余额显示 `—` | 接口没返回钱包；或读取失败（悬停有具体原因） | 悬停看原因；点一下重试 |
| 峰谷提示「<年份> 年节假日表未收录」 | 该年份国务院放假通知还没发布 | 预期行为，可 `config.holidays` 补，见 README |
| 启动时有 `plugin ... failed` 警告 | 该 DSH 版本不含 `sidebar.footer.action` 或 `remote.account` | 回滚（§8），把版本告诉人类 |
| 应用起不来 / 侧边栏报错 | 极少见：YAML 被手工改坏 | 见 §8 恢复 `cordis.patch.yml` |

---

## 8. 回滚

```bash
cd dsh-balance-chip
python3 install.py --uninstall    # 只摘掉启用条目，保留包目录
python3 install.py --purge        # 连包目录一起删
```

手工等价做法：删掉 `cordis.patch.yml` 里以 `# 账户余额徽标` 开头的那段（含其后的 `- insert:` 块），再删 `<profile>/node_modules/dsh-balance-chip/`；然后重启应用。

---

## 9. 没有 Python 时的手动安装（与脚本等价）

```bash
P="${DSH_HOME:-$HOME/.dsh}/profiles/desktop"
mkdir -p "$P/node_modules/dsh-balance-chip/lib"
cp package.json cordis.patch.yml "$P/node_modules/dsh-balance-chip/"
cp lib/index.js lib/client.js "$P/node_modules/dsh-balance-chip/lib/"
```

然后往 `$P/cordis.patch.yml` **末尾追加**（**UTF-8 无 BOM，LF 换行**；不要改文件其它内容）：

```yaml
# 账户余额徽标（由 dsh-balance-chip/install.py 添加）
- insert:
    - id: balance-chip
      name: "dsh-balance-chip"
```

注意：不要写成裸条目 `- id: balance-chip`——patch 语义里那是「覆盖已有条目」，而本包不在任何 bundle 里，那样写不会被加载。

---

## 10. 不要做的事

- ❌ 不要改 profile 的 `package.json` 或 `dsh.profile.bundles`（本包不以 bundle 形式安装）。
- ❌ 不要动 `cordis.patch.yml` 里其它插件的条目（尤其 `mcp-*`、`subagent` 之类）。
- ❌ 不要 `sudo`、不要改 DSH 安装目录、不要动 `app.asar`。
- ❌ 不要为了“让它生效”直接杀应用进程而不提醒人类——先保存人类正在跑的任务。
- ❌ 不要用 `--profile` 指向非 profile 目录。
