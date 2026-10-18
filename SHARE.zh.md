> 本文件在仓库中名为 `SHARE.zh.md`；Release zip 内仍叫 `SHARE.md`，两份内容一致。

# 分享给别人

把 **`dsh-balance-chip-1.1.1.zip`** 连同下面任意一段正文发给对方即可。
**不需要知道对方用的是桌面应用还是 `dsh web`** —— 安装脚本会自动识别。

---

## 转发正文 A：对方自己动手（推荐，可直接复制）

> 给你一个 DSH 小插件：**在侧边栏左下角、头像上方显示两行** —— 实时账户余额，以及当前计费时段（高峰 / 空闲）和它几点结束。点余额行打开用量页，点时段行打开计费说明。
>
> 装法：
>
> 1. 解压 `dsh-balance-chip-1.1.1.zip`，得到 `dsh-balance-chip/` 目录
> 2. 打开「终端」，进到那个目录，跑：
>
>    ```bash
>    python3 install.py
>    ```
>
>    （Windows 上用 `python install.py`；它会自动找到你所有的 DSH profile 并安装，桌面版和 web 版都装，你不用管自己用的是哪个）
> 3. 让插件生效：先按 `Ctrl+R` 刷新；没变化就把 DSH **完全退出**再打开（macOS `⌘Q`，关窗口不算退出）
>
> 装好后看**侧边栏左下角、头像上方**：会出现「余额 ¥xx.xx」和「空闲 09:00 结束」（高峰时是「高峰 12:00 结束」）。
>
> 卸载：同样目录下 `python3 install.py --uninstall`

---

## 转发正文 B：让对方把 zip 交给自己的 AI 助手（省事）

> 附件是一个 DSH 插件（`dsh-balance-chip-1.1.1.zip`），帮我装上。
>
> 解压后目录里有 `AGENT-INSTALL.md`，那是给你看的安装指南：里面有环境检查、离线校验（`node test-client.cjs .` / `node test-peak.cjs .` / `SHA256SUMS`）、安装命令、激活方式、验证方法、故障排查和回滚步骤。按它执行即可。
>
> 提醒两点：装完需要重启 DSH 才会显示；如果我是用 API Key 而不是 DeepSeek 账号登录，余额那行会显示「未登录」，这是正常的。

---

## 包里有什么

| 文件 | 给对方看 / 用 |
|---|---|
| `install.py` | 装 / 卸脚本（对方只需这一个命令） |
| `AGENT-INSTALL.md` | **给 AI 助手**的安装指南（校验→安装→激活→回报→回滚，含无 Python 的手动装法） |
| `README.md` | 完整说明：功能、时段规则、config、实现要点、测试 |
| `SHARE.md` | 本文件（转发正文） |
| `package.json`、`lib/`、`cordis.patch.yml` | 插件本体（4 个文件会被装进 profile） |
| `test-client.cjs`、`test-peak.cjs` | 离线测试，对方可先跑一遍确认没被改坏 |
| `SHA256SUMS` | 逐文件哈希，`shasum -a 256 -c SHA256SUMS` 可校验 |

安装脚本只做三件事：扫描 `$DSH_HOME/profiles/`（默认 `~/.dsh/profiles/`）下所有含 `package.json` 的 profile → 把 4 个文件复制进 `<profile>/node_modules/dsh-balance-chip/` → 在 `<profile>/cordis.patch.yml` 末尾追加一条 `insert` 条目。**不碰 profile 的 `package.json` 和 bundle 列表，不联网，不读凭据。**

幂等：重复执行不会重复插入。`--purge` 会连包目录一起删。

```bash
python3 install.py --list              # 只看检测到哪些 profile
python3 install.py --profile web       # 只装 web
python3 install.py --profile desktop   # 只装桌面版
python3 install.py --uninstall         # 摘掉条目
python3 install.py --purge             # 连包一起删
```

## 对方需要什么

- 只要 **Python 3**（macOS / 多数 Linux 自带；Windows 用 `python`）。
- 可选 **Node.js**：只用来跑离线测试，没有也能装。
- 想要 `dsh plugin add` 那种 bundle 安装方式的话，`cordis.patch.yml` 已经在包里（`dsh.bundle.patch` 指向它），但目前只提供 zip 这一种分发形式。

## 已知前提

- 插件读取的是 **DeepSeek 账号**的余额（走 `account` Remote），和「设置 → 账号」里显示的是同一个数。
- 用的是 **API Key / 第三方 provider** 而不是 DeepSeek 账号时，余额行会显示 `未登录`，这是预期行为；峰谷行不受影响。
- 峰谷时段按 DeepSeek 开放平台的公开规则推算（北京时间、工作日 09:00–12:00 / 14:00–18:00 为高峰，节假日与周末全天空闲），**以官方「模型 & 价格」页为准**。
