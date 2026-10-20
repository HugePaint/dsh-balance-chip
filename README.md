# dsh-balance-chip

**Two rows in the DSH sidebar footer:** your live account balance, and the current DeepSeek billing window (peak / off-peak) with the clock time that window ends.

[中文说明](README.zh.md) · [Agent install guide](AGENT-INSTALL.md) · [MIT License](LICENSE)

```
┌─ sidebar footer ─────────────────┐
│  Balance                  ¥12.34 │  ← balance row
│  Off-peak          ends 09:00    │  ← billing-window row
│  🟣 account                      │  ← built-in account entry
└──────────────────────────────────┘
```

The balance row sits directly above the avatar / account row, the billing row right under it. Both register in the `sidebar.footer.action` list slot, so nothing in the built-in UI is replaced or wrapped.

> Why not inside the avatar row: that row is `settings.trigger`, a `single` slot already owned by `dsh-client-ui-settings-general`. `sidebar.footer.action` is the nearest free list slot in the same bottom-left block.

## What it shows

| | |
|---|---|
| **Balance** | Live wallet total from the same `account` Remote that Settings → Account uses. Bonus wallets are appended as `+¥0.50`; amounts truncate to cents with thousands separators; sub-cent amounts show `<¥0.01`. A failed read keeps the last number instead of blanking the row. |
| **Billing window** | `Peak` (amber) or `Off-peak` (green), plus when it ends — `12:00`, `tomorrow 09:00`, `Mon 09:00`, `Mar 3 09:00`. |
| **Hover** | Three short lines: state + countdown, the reason (peak windows / weekend / statutory holiday), then the pricing note and what a click does. |
| **Click** | Balance row opens your usage page (URL comes from the account state stream). Billing row opens the official pricing page. |
| **Collapsed sidebar** | Balance shows only the amount; billing shows only `Peak` / `Idle`. |

Every state renders something visible — loading `…`, signed out, no wallet, read failure — so "the plugin did not load" and "the plugin loaded but has no data" never look the same.

## Billing windows

The billing row mirrors DeepSeek's published rule, **in Beijing time (UTC+8)**:

- **Peak:** Monday–Friday, 09:00–12:00 and 14:00–18:00, **excluding Chinese statutory holidays**.
- **Off-peak:** everything else — 12:00–14:00, after 18:00, weekends, and holidays all day.
- Off-peak pricing is half of peak.

Sources: [Model & Pricing (EN)](https://api-docs.deepseek.com/quick_start/pricing) · [模型 & 价格 (中文)](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/) · 2026 holiday dates from [国务院办公厅关于 2026 年部分节假日安排的通知](https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm) (国办发明电〔2025〕7号). Pricing and windows can change — the official page is authoritative.

The judgement is pure local arithmetic (`Date.now()` plus the rule above), computed entirely in Beijing wall-clock time, so the result does **not** depend on the machine's time zone. On a machine outside UTC+8, the row prefixes `Beijing ` and the hover adds the local equivalent.

The statutory holiday table is compiled in (`lib/client.js`, `HOLIDAY_TABLE`) and currently covers 2026. Weekends moved to working days still count as weekends, so no separate adjustment table is needed. For a year the table does not cover yet, the plugin falls back to weekday-only rules and says so in the hover.

## Install

Requirements: DSH 0.2.x. The plugin panel route is recommended and needs no Python; the installer script below is an optional legacy path.

### From the plugin panel (recommended)

This package is an ordinary DSH npm plugin, recognised by DSH's plugin manager as a profile bundle:

1. Open the **Plugins** panel → **Add plugin** → **Install third-party plugin**
2. Enter any of:
   - `dsh-balance-chip` — once published to npm
   - the absolute path of a checkout, e.g. `C:\Users\you\GitHub\dsh-balance-chip`
   - the absolute path of the packed tarball, e.g. `C:\Users\you\Downloads\dsh-balance-chip-1.2.0.tgz`
3. Refresh or restart DSH when prompted.

DSH records the package in that profile's `dsh.profile.bundles`, and the `insert` entry in this package's `cordis.patch.yml` registers `balance-chip` — no profile file needs hand editing. A directory install is recorded as a link, so keep the source directory; a `.tgz` install is unpacked into place and survives deleting the tarball.

### Let an agent do it

Hand the repository, or the release zip, to your assistant and point it at [`AGENT-INSTALL.md`](AGENT-INSTALL.md). That guide covers environment checks, offline verification, installation, activation, reporting back, troubleshooting, rollback, and a no-Python manual path.

### By hand (legacy)

Needs Python 3. This path copies the package into `node_modules` and edits the profile's patch without declaring the package as a profile dependency: a later plugin-panel install runs pnpm, which prunes it as an extraneous package (moved into `node_modules/.ignored/`) and the plugin silently disappears. Prefer the plugin panel above.

```bash
python3 install.py          # macOS / Linux
python install.py           # Windows
```

The installer scans `$DSH_HOME/profiles/*` (default `~/.dsh/profiles`), copies four files into `<profile>/node_modules/dsh-balance-chip/`, and appends one `insert` entry to that profile's `cordis.patch.yml`. It does not touch the profile's `package.json` or `dsh.profile.bundles`, uses no network, and is idempotent.

Useful flags:

```bash
python3 install.py --list           # show detected profiles, change nothing
python3 install.py --profile web    # install into one profile (repeatable)
python3 install.py --uninstall      # remove the entry, keep the package
python3 install.py --purge          # also delete the package directory
```

Then let it take effect: press `Ctrl+R` / `Cmd+R` in the window first; if that is not enough, fully quit and reopen DSH (macOS `⌘Q` — closing the window does not quit the process).

From a release zip: unzip `dsh-balance-chip-<version>.zip`, then run the same command inside it.

## Configuration

Every field of an entry's `config` is optional; an invalid value falls back to the default instead of hiding the row.

```yaml
- insert:
    - id: balance-chip
      name: "dsh-balance-chip"
      config:
        windows: ["09:00-12:00", "14:00-18:00"]   # Beijing time; [[540,720],[840,1080]] also accepted
        weekdays: [1, 2, 3, 4, 5]                 # days treated as working days (0 = Sunday)
        holidays: ["2027-01-01", "2027-02-06"]    # extra dates, union with the built-in table
        ignoreHolidays: false                     # true = ignore holidays entirely
        zoneOffsetMinutes: 480                    # time zone the rule is defined in
        pricingUrl: "https://api-docs.deepseek.com/quick_start/pricing"
```

## How it works

- **Two client rows, one host stub.** `lib/client.js` is the browser half: it renders both rows, reads the balance over the existing `account` Remote (`getBalance` for the value, `watch` for sign-in state and the usage URL) and computes the billing window locally. `lib/index.js` is the host half — it exists because the loader also imports every package on the host side, and it carries only a load probe.
- **One slot, ordered by `order`.** Balance `order: 10`, billing `order: 20`, both in `sidebar.footer.action` (`kind: list`, `scope: root`).
- **Pure function, thin component.** `periodAt` / `describeChip` are side-effect-free and exported as `exports.period`; the component only prints their output. The loader reads `apply` / `inject` and ignores the extra export.
- **No network, no credentials, no host code.** The only outbound action is `window.open(url, "_blank", "noopener,noreferrer")` on click. The only host-side write is a `/tmp` load probe wrapped in `try/catch`.
- **Theme tokens only.** Colours come from `--dsw-alias-*` tokens, so light and dark themes both work.

## Compatibility

Developed against DSH `0.2.0-rc.2` with `@deepseek-ai/cordis` `4.0.4` — the versions that ship with the desktop build it was tested on. The package declares no `@deepseek-ai/dsh*` peer dependency, so DSH's compatibility gate does not block it; what it needs at runtime is the `sidebar.footer.action` slot and the `slots` / `locale` / `remote.account` services.

## Development

```bash
node test-client.cjs .                       # balance row, fake Remote, no browser
node test-peak.cjs .                         # schedule, strings, tooltip layout
TZ=Pacific/Kiritimati node test-peak.cjs .   # same conclusions in another zone
```

Both suites are offline: a minimal React-hooks runtime, a fake `ctx`, and a fake `account` Remote. `test-peak.cjs` covers window boundaries, overnight and weekend spans, every 2026 holiday block, config fallbacks and tooltip line lengths, and prints a `SCHEDULE-FINGERPRINT` line that must be identical across time zones.

## Version history

| Version | Date | Notes |
|---|---|---|
| 1.2.0 | 2026-10-20 | Packaged as a standard DSH npm plugin: `private` removed, host probe removed, installable from the plugin panel (directory / tarball / package name) |
| 1.1.1 | 2026-10-15 | Hover tooltips split into short lines; `aria-label` now a separate single line |
| 1.1.0 | 2026-10-14 | Added the billing-window row (peak / off-peak, end time, holiday table, config) |
| 1.0.0 | 2026-10-14 | Balance row only |

## Credits

Built by **Ivan Chen** and **[HugePaint](https://github.com/HugePaint)**.

Not affiliated with DeepSeek. The windows and prices it displays are DeepSeek's; the plugin only reproduces the published rule locally.

## License

[MIT](LICENSE) © 2026 Ivan Chen, HugePaint
