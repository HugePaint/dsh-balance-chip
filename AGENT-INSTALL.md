# Install guide for agents · dsh-balance-chip

> You are holding a **DSH (DeepSeek Harness) client plugin**. Goal: install it into the human's DSH and confirm it works.
> Order: **verify first (offline, about a minute) → install (writes two places) → activate → report back**. No network access is needed at any point.

---

## 0. 30-second decision checklist

| | |
|---|---|
| What it does | Adds two rows to the bottom-left sidebar, above the account row: account balance, and the current billing window (peak / off-peak) with the time it ends |
| What it writes | `$DSH_HOME/profiles/<profile>/node_modules/dsh-balance-chip/` (four new files)<br>`$DSH_HOME/profiles/<profile>/cordis.patch.yml` (one `insert` entry appended) |
| What it does not touch | The profile's `package.json`, `dsh.profile.bundles`, other plugins' entries, the DSH installation |
| Network | None. Balance and sign-in state reuse the app's own `account` Remote |
| Credentials | Reads and writes none (no tokens, API keys, cookies) |
| Requires | Python 3 (`python3` or `python`); Node.js only for the optional offline tests |
| Compatibility | DSH 0.2.x (`@deepseek-ai/cordis` 4.0.4). Needs the `sidebar.footer.action` slot and the `remote.account`, `slots`, `locale` services |

**Check with the human first**: "I'm going to install this plugin into your DSH profile — it adds four files and appends one enablement entry to `cordis.patch.yml`, and DSH needs a reload to pick it up. Go ahead?" Continue only after a yes.

---

## 1. Locate DSH and its profiles

`DSH_HOME` defaults to `~/.dsh` (`%USERPROFILE%\.dsh` on Windows) and can be overridden by an environment variable of the same name.

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

Every subdirectory that contains a `package.json` is a profile (`desktop` for the desktop app, `web` for `dsh web`; both may exist).

```bash
python3 install.py --list        # list what would be installed into; changes nothing
```

> By default the installer targets **every** initialized profile, which is intentional: the human should not have to know whether they run the desktop app or `dsh web`. If they want a single profile, pass `--profile desktop` or `--profile web`.

---

## 2. Verify (recommended, offline, about a minute)

Inside the unzipped `dsh-balance-chip/` directory:

```bash
node test-client.cjs .    # balance row: expect the last line to read 全部通过 (all passed)
node test-peak.cjs .      # billing row: same
shasum -a 256 -c SHA256SUMS     # macOS/Linux; on Windows compare Get-FileHash per line
```

- Two `全部通过` lines plus all hashes `OK` → the content is intact, continue.
- No Node.js → skip the tests, compare hashes only; see §6 for the static summary.
- Any FAIL or hash mismatch → **stop**, do not install, send the output back to the human.

---

## 3. Install

```bash
cd dsh-balance-chip
python3 install.py            # Windows: python install.py
```

Expected output (profile name and paths vary):

```
DSH_HOME = /Users/<you>/.dsh
目标 profile: desktop

✅ desktop    包 -> /Users/<you>/.dsh/profiles/desktop/node_modules/dsh-balance-chip
   已写入 cordis.patch.yml
```

(The Chinese lines mean "package → path" and "written to `cordis.patch.yml`".)

It does exactly three things:

1. reads `package.json` to confirm the package name is `dsh-balance-chip`;
2. copies `package.json`, `lib/index.js`, `lib/client.js`, `cordis.patch.yml` into `<profile>/node_modules/dsh-balance-chip/`;
3. appends this to `<profile>/cordis.patch.yml`:

```yaml
# 账户余额徽标（由 dsh-balance-chip/install.py 添加）
- insert:
    - id: balance-chip
      name: "dsh-balance-chip"
```

Re-running is idempotent: it reports "entry already present (normalized)" and does not duplicate anything.

> **Do not** point `--profile` at an arbitrary directory — the script trusts the argument, creates `node_modules/dsh-balance-chip` there and appends YAML to that directory. Only a profile name or a real profile directory is acceptable.

---

## 4. Activate

The client bundle has to be fetched again by the renderer:

1. **Try a refresh first**: `Ctrl+R` (`Cmd+R` on macOS).
2. Desktop app: **fully quit and reopen** (macOS `⌘Q` — closing the window does not quit; on Windows end the process).
3. `dsh web`: restart the command, or refresh the page.

---

## 5. Verify and report

Files and configuration:

```bash
P="${DSH_HOME:-$HOME/.dsh}/profiles/desktop"
ls "$P/node_modules/dsh-balance-chip"                  # expect four entries: package.json lib cordis.patch.yml
grep -c 'id: balance-chip' "$P/cordis.patch.yml"       # expect 1
```

What the human should see (bottom-left sidebar, above the account row):

| State | Row |
|---|---|
| Off-peak | `Off-peak   ends 09:00` / `ends tomorrow 09:00` / `ends Mon 09:00` (green) |
| Peak | `Peak   ends 12:00` (amber) |
| Collapsed sidebar | only `Peak` / `Idle` |
| No DeepSeek account (API key or third-party provider) | balance row shows `signed out`; billing row still works |
| Statutory holiday | still `Off-peak`; hover explains "off-peak all day" |

Report template:

> Installed into profile `<name>`. After a refresh/restart, the sidebar above the account row should show two rows: `Balance ¥x.xx` and `Off-peak ends 09:00` (or `Peak ends 12:00`). Hovering shows the rule and the "off-peak is half price" note. If you do not see it, tell me and I will follow §7; rollback is `python3 install.py --uninstall`.

---

## 6. Static security summary (verify it yourself, do not just trust this text)

The payload is four files, 863 lines total (`lib/client.js` 784, `lib/index.js` 32, the rest is manifest and patch), fully readable, no minification, no base64 blobs. Spot-check:

```bash
grep -n "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon\|child_process\|spawn(\|exec(\|eval(\|new Function\|process\.env\|document\.cookie\|localStorage\|keytar" lib/*.js
```

Expected: **no matches** in `lib/client.js` or `lib/index.js` (the only file write is the probe below).

- `lib/index.js` (host half, ~30 lines): the only action in `apply()` is
  `appendFileSync("/tmp/dsh-balance-chip-host.log", ...)` — a load probe wrapped in `try/catch`.
  On Windows `/tmp` resolves to `<current drive>:\tmp`; when that directory does not exist the write fails silently and **nothing is written**. Create `C:\tmp` to see the log, or delete the probe.
- `lib/client.js` (browser half): only `require("react")` and `require("react/jsx-runtime")`; reads and writes go through the app's own `ctx.remote.account.getBalance / watch`, `ctx.locale.getSnapshot`, `ctx.slots`. The only outbound action is `window.open(url, "_blank", "noopener,noreferrer")` **on click** — the balance row opens the usage page (URL supplied by the account stream), the billing row opens the official pricing page.
- The billing judgement is pure local arithmetic (`Date.now()` plus the built-in rule): no request, no file write.
- `install.py`: no network, no subprocess, no `eval`; writes only the two locations above; `--purge` only deletes `<profile>/node_modules/dsh-balance-chip`.

---

## 7. Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Neither row appears | Not reloaded, or the wrong profile | `Ctrl+R` first, then fully quit and reopen; `install.py --list` to confirm the profile |
| Only one row appears | The browser cached the old bundle | Hard refresh (`Ctrl+Shift+R`) or restart the app |
| Balance says `signed out` | The human uses an API key / third-party provider, not a DeepSeek account | Expected; nothing to fix |
| Balance says `—` | No wallet returned, or the read failed (hover shows the reason) | Read the hover reason; click to retry |
| Hover says "<year> holiday table missing" | That year's State Council holiday notice is not published yet | Expected; extend with `config.holidays` (see README) |
| `plugin ... failed` warning at startup | This DSH build lacks `sidebar.footer.action` or `remote.account` | Roll back (§8) and report the version |
| App will not start / sidebar errors | Rare: `cordis.patch.yml` was edited by hand | Recover per §8 |

---

## 8. Rollback

```bash
cd dsh-balance-chip
python3 install.py --uninstall    # remove the entry, keep the package directory
python3 install.py --purge        # also delete the package directory
```

Manual equivalent: delete the block starting with `# 账户余额徽标` from `cordis.patch.yml`, delete `<profile>/node_modules/dsh-balance-chip/`, then restart DSH.

---

## 9. Manual install without Python (equivalent to the script)

```bash
P="${DSH_HOME:-$HOME/.dsh}/profiles/desktop"
mkdir -p "$P/node_modules/dsh-balance-chip/lib"
cp package.json cordis.patch.yml "$P/node_modules/dsh-balance-chip/"
cp lib/index.js lib/client.js "$P/node_modules/dsh-balance-chip/lib/"
```

Then **append** this to `$P/cordis.patch.yml` (**UTF-8, no BOM, LF line endings**; do not modify anything else in the file):

```yaml
# 账户余额徽标（由 dsh-balance-chip/install.py 添加）
- insert:
    - id: balance-chip
      name: "dsh-balance-chip"
```

Do not write a bare `- id: balance-chip` entry: in patch semantics that *overrides an existing entry*, and this package is not part of any bundle, so it would never load.

---

## 10. Don'ts

- ❌ Do not edit the profile's `package.json` or `dsh.profile.bundles` (this package is not installed as a bundle).
- ❌ Do not touch other plugins' entries in `cordis.patch.yml` (especially `mcp-*`, `subagent`).
- ❌ No `sudo`, no changes to the DSH installation, no edits to `app.asar`.
- ❌ Do not kill the app without warning the human first — save their running work.
- ❌ Do not point `--profile` at a non-profile directory.
