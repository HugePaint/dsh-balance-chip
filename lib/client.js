/**
 * Browser half of dsh-balance-chip.
 *
 * Renders the account balance as a row in the sidebar's bottom-left block
 * (`sidebar.footer.action`), directly above the avatar / account entry.
 *
 * Why not next to the avatar itself: the avatar row is `settings.trigger`, a
 * `single` slot already owned by dsh-client-ui-settings-general, so nothing else
 * may render there. `sidebar.footer.action` is the `list` slot in the same
 * bottom-left region.
 *
 * Data source: the existing `account` Remote the settings page already uses —
 * `getBalance` for the amount and `watch` for account state changes. No host
 * code and no new endpoint.
 *
 * A second row in the same slot (`peak`) is the billing-period reminder: it names
 * the current window (peak / off-peak) and the clock time that window ends. It is
 * pure local arithmetic on the browser clock — no request, no host service — and
 * everything is computed in Beijing time, so the answer does not depend on the
 * machine's time zone.
 */
window.__ModuleLoader__.load({
	id: "dsh-balance-chip",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const { jsx, jsxs } = require("react/jsx-runtime");

		/*
		 * Cordis only exposes DECLARED services on the context — accessing an
		 * undeclared one throws "cannot get property ... without inject" (it does
		 * NOT return undefined). The account settings page declares exactly this
		 * set, so `remote.account` is a real service; without declaring it here,
		 * `ctx.remote.account` is unreachable.
		 */
		const inject = ["slots", "locale", "remote", "remote.account"];

		/** Build version the account Remote reports; request metadata only. */
		const CLIENT_VERSION = "0.2.0-rc.2";

		const CHIP_CLASS = "dshBalanceChip";
		const LABEL_CLASS = "dshBalanceChipLabel";
		const AMOUNT_CLASS = "dshBalanceChipAmount";
		const BONUS_CLASS = "dshBalanceChipBonus";
		const MUTED_CLASS = "dshBalanceChipMuted";
		const PEAK_LABEL_CLASS = "dshBalanceChipPeriod";
		const PEAK_END_CLASS = "dshBalanceChipEnd";
		const TAG_ID = "dsh-balance-chip/chip.css";

		const CSS = [
			"." + CHIP_CLASS + "{",
			"display:flex;align-items:center;gap:6px;box-sizing:border-box;",
			"width:100%;height:30px;padding:0 10px;margin:0;",
			"border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;",
			"color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-family);",
			"font-size:12px;line-height:1;font-variant-numeric:tabular-nums;",
			"white-space:nowrap;overflow:hidden;cursor:pointer;text-align:start;",
			"transition:background-color 120ms ease,color 120ms ease;",
			"}",
			"." + CHIP_CLASS + ":hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}",
			"." + CHIP_CLASS + ":focus-visible{",
			"outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));",
			"outline-offset:-2px;",
			"}",
			"." + LABEL_CLASS + "{margin-inline-end:auto;color:var(--dsw-alias-label-caption);}",
			"." + AMOUNT_CLASS + "{font-weight:500;color:var(--dsw-alias-label-primary);}",
			"." + BONUS_CLASS + "{color:var(--dsw-alias-label-caption);}",
			"." + MUTED_CLASS + "{color:var(--dsw-alias-label-caption);}",
			/* 侧边栏收起成窄轨时只留金额，标签藏掉 */
			"." + CHIP_CLASS + "[data-compact=true]{justify-content:center;gap:0;padding:0 4px;}",
			"." + CHIP_CLASS + "[data-compact=true] ." + LABEL_CLASS + "{display:none;}",
			"." + CHIP_CLASS + "[data-compact=true] ." + BONUS_CLASS + "{display:none;}",
			/* 峰谷行复用余额行的几何，只在时段名上分色 */
			"." + PEAK_LABEL_CLASS + "{margin-inline-end:auto;font-weight:500;}",
			"." + CHIP_CLASS + "[data-period=peak] ." + PEAK_LABEL_CLASS + "{color:var(--dsw-alias-state-warn-primary,var(--dsw-alias-label-primary));}",
			"." + CHIP_CLASS + "[data-period=idle] ." + PEAK_LABEL_CLASS + "{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-primary));}",
			"." + PEAK_END_CLASS + "{color:var(--dsw-alias-label-primary);}",
			/* 窄轨只留时段名（峰 / 闲），结束时间藏掉，并撤掉把标签推向左侧的 auto 外边距 */
			"." + CHIP_CLASS + "[data-compact=true] ." + PEAK_END_CLASS + "{display:none;}",
			"." + CHIP_CLASS + "[data-compact=true] ." + PEAK_LABEL_CLASS + "{margin-inline-end:0;}",
		].join("");

		/**
		 * Keep exactly one stylesheet tag for this plugin in the document.
		 * @param ctx - the client plugin context, for effect ownership.
		 */
		function installStyles(ctx) {
			ctx.effect(() => {
				if (document.querySelector("style[data-plugin-css=" + JSON.stringify(TAG_ID) + "]") !== null) return;
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-balance-chip";
				tag.dataset.pluginCss = TAG_ID;
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => tag.remove();
			}, "balance-chip: styles");
		}

		// ---------------------------------------------------------------- 格式化

		/**
		 * Group the integer part with thousands separators.
		 * @param value - a fixed-decimal string.
		 * @returns the grouped string.
		 */
		function addCommas(value) {
			const [integer, fraction] = value.split(".");
			return Number(integer).toLocaleString() + "." + fraction;
		}

		/**
		 * Match the settings page's currency rules: two decimals, truncate toward
		 * zero, and show sub-cent amounts distinctly.
		 * @param amount - decimal balance string from the Host.
		 * @param symbol - currency symbol.
		 * @returns display text, or null when the amount is unusable.
		 */
		function formatBalance(amount, symbol) {
			const value = Number(amount);
			if (!Number.isFinite(value)) return null;
			if (value === 0) return symbol + "0.00";
			if (value < 0) {
				return "-" + symbol + (value > -0.01 ? "0.01" : addCommas(Math.abs(value).toFixed(2)));
			}
			if (value < 0.01) return "<" + symbol + "0.01";
			// 截断到分；epsilon 抵消 0.29 * 100 === 28.999999999999996 这类浮点误差
			const truncated = Math.floor(value * 100 + 1e-9) / 100;
			return symbol + addCommas(truncated.toFixed(2));
		}

		/**
		 * @param currency - ISO currency code from the Host.
		 * @returns the symbol the settings page uses for it.
		 */
		function symbolFor(currency) {
			return currency === "CNY" ? "¥" : "$";
		}

		/**
		 * Read the wallet arrays out of a balance payload without trusting a shape.
		 * @param data - `getBalance` value.
		 * @returns recharge and bonus wallets.
		 */
		function walletsOf(data) {
			if (data === null || typeof data !== "object") return { main: [], bonus: [] };
			const main = Array.isArray(data.value) ? data.value : [];
			const bonus = (Array.isArray(data.bonusWallets) ? data.bonusWallets : [])
				.filter((wallet) => Number(wallet.balance) > 0);
			return { main, bonus };
		}

		/**
		 * Format one wallet array, one entry per currency.
		 * @param wallets - wallet records.
		 * @returns display strings; empty when nothing formatted.
		 */
		function textsOf(wallets) {
			const out = [];
			for (const wallet of wallets) {
				const text = formatBalance(wallet.balance, symbolFor(wallet.currency));
				if (text !== null) out.push(text);
			}
			return out;
		}

		// ---------------------------------------------------------------- 峰谷时段

		/*
		 * DeepSeek 开放平台按北京时间划分计费时段：工作日（周一至周五，不含中国
		 * 法定节假日）09:00–12:00、14:00–18:00 为高峰时段，其余时段——12:00–14:00、
		 * 18:00 之后、周末与法定节假日全天——均为空闲时段，空闲价格为高峰的一半。
		 *
		 * 规则来自服务端定价，这里只做本地推算，不新增任何接口。所有时刻都换算成
		 * 北京挂钟再判断，因此结论与运行机器的本地时区无关。
		 */

		const MINUTE_MS = 60000;
		const DAY_MS = 86400000;

		/** 默认规则：北京时区、工作日、两段高峰窗口（当天分钟数）。 */
		const DEFAULT_PEAK = {
			zoneOffsetMinutes: 480,
			weekdays: [1, 2, 3, 4, 5],
			windows: [[9 * 60, 12 * 60], [14 * 60, 18 * 60]]
		};

		/** 计费说明页；点一下就能核对当前的峰谷规则。 */
		const PRICING_URL = {
			zh: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/",
			en: "https://api-docs.deepseek.com/quick_start/pricing"
		};

		/*
		 * 中国法定节假日（放假日期，闭区间）。来源：国务院办公厅关于 2026 年部分
		 * 节假日安排的通知（国办发明电〔2025〕7号）。调休上班的周末仍然算周末、
		 * 按空闲计费，所以不需要单列。新一年度通知发布后在这里补一年即可，也可以在
		 * profile 的 cordis.patch.yml 里用 config.holidays 追加。
		 */
		const HOLIDAY_TABLE = {
			2026: [
				["2026-01-01", "2026-01-03"],
				["2026-02-15", "2026-02-23"],
				["2026-04-04", "2026-04-06"],
				["2026-05-01", "2026-05-05"],
				["2026-06-19", "2026-06-21"],
				["2026-09-25", "2026-09-27"],
				["2026-10-01", "2026-10-07"]
			]
		};

		const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
		const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
		const MONTH_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

		/**
		 * @param value - 0–99 的整数。
		 * @returns 两位十进制字符串。
		 */
		function pad2(value) {
			return value < 10 ? "0" + value : String(value);
		}

		/**
		 * 把 { 年份: [[起, 止]] } 展成日期集合，并记下收录了哪些年份。
		 * @param table - 节假日表。
		 * @returns 日期键集合与已收录年份。
		 */
		function expandHolidays(table) {
			const days = new Set();
			const years = new Set();
			for (const key of Object.keys(table)) {
				years.add(Number(key));
				for (const range of table[key]) {
					const from = Date.parse(range[0] + "T00:00:00Z");
					const to = Date.parse(range[1] + "T00:00:00Z");
					if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
					for (let at = from; at <= to; at += DAY_MS) days.add(new Date(at).toISOString().slice(0, 10));
				}
			}
			return { days, years };
		}

		const BUILTIN_HOLIDAYS = expandHolidays(HOLIDAY_TABLE);

		/**
		 * 解析一段高峰窗口："09:00-12:00" 或 [540, 720]。
		 * @param value - 窗口。
		 * @returns [起, 止] 分钟数，非法输入返回 null。
		 */
		function parseWindow(value) {
			if (Array.isArray(value) && value.length === 2) {
				const start = Number(value[0]);
				const end = Number(value[1]);
				return Number.isFinite(start) && Number.isFinite(end) && start < end ? [start, end] : null;
			}
			const match = /^(\d{1,2}):(\d{2})\s*[-–~至]\s*(\d{1,2}):(\d{2})$/.exec(String(value).trim());
			if (match === null) return null;
			const start = Number(match[1]) * 60 + Number(match[2]);
			const end = Number(match[3]) * 60 + Number(match[4]);
			return start < end && end <= 1440 ? [start, end] : null;
		}

		/**
		 * @param value - 形如 "2026-10-01" 的日期。
		 * @returns 日期键，非法输入返回 null。
		 */
		function parseHoliday(value) {
			const key = String(value).trim().slice(0, 10);
			return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : null;
		}

		/**
		 * 归一化插件 config。任何一项不合法都退回默认值——徽标永远要有内容，不能
		 * 因为一段配置写错就整行消失。
		 * @param raw - 条目 config（可能为空）。
		 * @returns 归一化后的规则。
		 */
		function normalizePeakConfig(raw) {
			const source = raw !== null && typeof raw === "object" ? raw : {};
			const zone = Number(source.zoneOffsetMinutes);
			const weekdays = Array.isArray(source.weekdays)
				? source.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
				: [];
			const windows = (Array.isArray(source.windows) ? source.windows : [])
				.map(parseWindow)
				.filter((window) => window !== null)
				.sort((left, right) => left[0] - right[0]);
			const holidays = new Set(BUILTIN_HOLIDAYS.days);
			const years = new Set(BUILTIN_HOLIDAYS.years);
			if (Array.isArray(source.holidays)) {
				for (const value of source.holidays) {
					const key = parseHoliday(value);
					if (key === null) continue;
					holidays.add(key);
					years.add(Number(key.slice(0, 4)));
				}
			}
			return {
				zoneOffsetMinutes: Number.isFinite(zone) ? zone : DEFAULT_PEAK.zoneOffsetMinutes,
				weekdays: weekdays.length > 0 ? weekdays : DEFAULT_PEAK.weekdays,
				windows: windows.length > 0 ? windows : DEFAULT_PEAK.windows,
				holidays,
				holidayYears: years,
				ignoreHolidays: source.ignoreHolidays === true,
				pricingUrl: typeof source.pricingUrl === "string" && source.pricingUrl !== "" ? source.pricingUrl : null
			};
		}

		/**
		 * 北京挂钟的日历字段。用 UTC 取值，所以结果与浏览器本地时区无关。
		 * @param wallMs - 北京挂钟毫秒。
		 * @returns 年 / 月 / 日 / 当天分钟数 / 星期。
		 */
		function wallFields(wallMs) {
			const at = new Date(wallMs);
			return {
				year: at.getUTCFullYear(),
				month: at.getUTCMonth() + 1,
				day: at.getUTCDate(),
				minutes: at.getUTCHours() * 60 + at.getUTCMinutes(),
				weekday: at.getUTCDay()
			};
		}

		/**
		 * @param fields - wallFields 的结果。
		 * @returns "YYYY-MM-DD"。
		 */
		function dateKey(fields) {
			return fields.year + "-" + pad2(fields.month) + "-" + pad2(fields.day);
		}

		/**
		 * @param wallMs - 北京挂钟毫秒。
		 * @returns 当天 00:00 的挂钟毫秒。
		 */
		function startOfWallDay(wallMs) {
			return Math.floor(wallMs / DAY_MS) * DAY_MS;
		}

		/**
		 * @param fields - wallFields 的结果。
		 * @param cfg - 归一化后的规则。
		 * @returns 这一天是否完全按空闲计费（周末或法定节假日）。
		 */
		function isRestDay(fields, cfg) {
			if (cfg.weekdays.indexOf(fields.weekday) < 0) return true;
			return !cfg.ignoreHolidays && cfg.holidays.has(dateKey(fields));
		}

		/**
		 * 下一个高峰起点：下一个非休息日第一段窗口的开始时刻。
		 * @param wallMs - 北京挂钟毫秒。
		 * @param cfg - 归一化后的规则。
		 * @returns 起点的北京挂钟毫秒。
		 */
		function nextPeakStart(wallMs, cfg) {
			const dayStart = startOfWallDay(wallMs);
			for (let step = 1; step <= 62; step += 1) {
				const candidate = dayStart + step * DAY_MS;
				if (isRestDay(wallFields(candidate), cfg)) continue;
				return candidate + cfg.windows[0][0] * MINUTE_MS;
			}
			return dayStart + DAY_MS;
		}

		/**
		 * 当前计费时段与它的结束时刻。
		 * @param nowMs - 当前 epoch 毫秒。
		 * @param cfg - 归一化后的规则。
		 * @returns 时段、结束时刻与判定依据。
		 */
		function periodAt(nowMs, cfg) {
			const wallMs = nowMs + cfg.zoneOffsetMinutes * MINUTE_MS;
			const fields = wallFields(wallMs);
			const holiday = !cfg.ignoreHolidays && cfg.holidays.has(dateKey(fields));
			const weekend = fields.weekday === 0 || fields.weekday === 6;
			const finish = (period, endWallMs, reason) => {
				const endYear = new Date(endWallMs).getUTCFullYear();
				return {
					period,
					reason,
					endMs: endWallMs - cfg.zoneOffsetMinutes * MINUTE_MS,
					endWallMs,
					estimated: !cfg.ignoreHolidays
						&& (!cfg.holidayYears.has(fields.year) || !cfg.holidayYears.has(endYear))
				};
			};

			if (!isRestDay(fields, cfg)) {
				for (const window of cfg.windows) {
					if (fields.minutes >= window[0] && fields.minutes < window[1]) {
						return finish("peak", startOfWallDay(wallMs) + window[1] * MINUTE_MS, "in-peak");
					}
				}
				const upcoming = cfg.windows.filter((window) => window[0] > fields.minutes)[0];
				if (upcoming !== undefined) return finish("idle", startOfWallDay(wallMs) + upcoming[0] * MINUTE_MS, "between");
				return finish("idle", nextPeakStart(wallMs, cfg), "after-peak");
			}
			return finish("idle", nextPeakStart(wallMs, cfg), holiday ? "holiday" : (weekend ? "weekend" : "rest"));
		}

		/**
		 * 结束时刻的日期说法：今天不标注，其次 明天 / 周X / M月D日。
		 * @param endWallMs - 结束时刻（挂钟）。
		 * @param nowWallMs - 现在（挂钟）。
		 * @param zh - 是否中文。
		 * @returns 前缀文案，可能是空串。
		 */
		function dayLabel(endWallMs, nowWallMs, zh) {
			const days = Math.round((startOfWallDay(endWallMs) - startOfWallDay(nowWallMs)) / DAY_MS);
			if (days <= 0) return "";
			const at = new Date(endWallMs);
			if (days === 1) return zh ? "明天" : "tomorrow";
			if (days < 7) return (zh ? WEEKDAY_ZH : WEEKDAY_EN)[at.getUTCDay()];
			return zh ? (at.getUTCMonth() + 1) + "月" + at.getUTCDate() + "日" : MONTH_EN[at.getUTCMonth()] + " " + at.getUTCDate();
		}

		/**
		 * @param wallMs - 挂钟毫秒。
		 * @returns "HH:MM"。
		 */
		function clockText(wallMs) {
			const at = new Date(wallMs);
			return pad2(at.getUTCHours()) + ":" + pad2(at.getUTCMinutes());
		}

		/**
		 * 剩余时间。中文说人话，英文用紧凑写法（悬停每行要短）。
		 * @param ms - 距离结束还有多少毫秒。
		 * @param zh - 是否中文。
		 * @returns 文案。
		 */
		function countdownText(ms, zh) {
			if (ms <= 0) return zh ? "即将结束" : "ending now";
			const minutes = Math.floor(ms / MINUTE_MS);
			if (zh) {
				if (minutes < 1) return "不到 1 分钟";
				if (minutes < 60) return minutes + " 分钟";
				const days = Math.floor(minutes / 1440);
				if (days >= 1) {
					const hours = Math.floor((minutes % 1440) / 60);
					return days + " 天" + (hours > 0 ? " " + hours + " 小时" : "");
				}
				const hours = Math.floor(minutes / 60);
				const rest = minutes % 60;
				return hours + " 小时" + (rest > 0 ? " " + rest + " 分" : "");
			}
			if (minutes < 1) return "under a minute";
			if (minutes < 60) return minutes + (minutes === 1 ? " minute" : " minutes");
			const days = Math.floor(minutes / 1440);
			if (days >= 1) {
				const hours = Math.floor((minutes % 1440) / 60);
				return days + "d" + (hours > 0 ? " " + hours + "h" : "");
			}
			const hours = Math.floor(minutes / 60);
			const rest = minutes % 60;
			return hours + "h" + (rest > 0 ? " " + rest + "m" : "");
		}

		/**
		 * @param window - [起, 止] 分钟数。
		 * @returns "09:00–12:00"。
		 */
		function windowText(window) {
			const clock = (minutes) => pad2(Math.floor(minutes / 60)) + ":" + pad2(minutes % 60);
			return clock(window[0]) + "–" + clock(window[1]);
		}

		/**
		 * 峰谷徽标的全部文案：时段名、结束时间与悬停说明。
		 *
		 * 悬停走原生 title，所以说明按行组织（`\n` 分行，Chromium 会渲染成多行），
		 * 每行都短、只说一件事：现状 → 依据 → 价格/入口；本地时间、表未收录这类
		 * 补充信息各自单独一行。
		 *
		 * @param nowMs - 当前 epoch 毫秒。
		 * @param cfg - 归一化后的规则。
		 * @param zh - 是否中文。
		 * @returns 组件直接渲染的字段。
		 */
		function describeChip(nowMs, cfg, zh) {
			const state = periodAt(nowMs, cfg);
			const peak = state.period === "peak";
			const localOffsetMinutes = -new Date(nowMs).getTimezoneOffset();
			const foreignZone = localOffsetMinutes !== cfg.zoneOffsetMinutes;
			const nowWallMs = nowMs + cfg.zoneOffsetMinutes * MINUTE_MS;
			const localNowMs = nowMs + localOffsetMinutes * MINUTE_MS;
			const localEndMs = state.endMs + localOffsetMinutes * MINUTE_MS;
			const day = dayLabel(state.endWallMs, nowWallMs, zh);
			const prefix = foreignZone ? (zh ? "北京 " : "Beijing ") : "";
			const clock = clockText(state.endWallMs);
			const endText = zh
				? prefix + (day === "" ? "" : day + " ") + clock + " 结束"
				: "ends " + prefix + (day === "" ? "" : day + " ") + clock;
			const windows = cfg.windows.map(windowText).join(zh ? "、" : ", ");
			const remaining = countdownText(state.endMs - nowMs, zh);
			const when = (day === "" ? "" : day + " ") + clock;
			const heading = zh
				? (peak ? "高峰时段" : "空闲时段") + " · " + prefix + when + " 结束（还有 " + remaining + "）"
				: (peak ? "Peak" : "Off-peak") + " · ends " + prefix + when + " (in " + remaining + ")";

			let reason;
			let footer;
			if (zh) {
				if (state.reason === "holiday") reason = "今天是中国法定节假日，全天空闲";
				else if (state.reason === "weekend") reason = "周末全天空闲";
				else if (state.reason === "rest") reason = "今天不在工作日规则内，全天空闲";
				else reason = "高峰窗口：工作日 " + windows;
				footer = "空闲价格为高峰的一半 · 点击查看计费说明";
			} else {
				if (state.reason === "holiday") reason = "statutory holiday — off-peak all day";
				else if (state.reason === "weekend") reason = "weekend — off-peak all day";
				else if (state.reason === "rest") reason = "outside the weekday rule — all-day off-peak";
				else reason = "peak: weekdays " + windows;
				footer = "off-peak is half price · click for pricing";
			}

			const lines = [heading, reason];
			if (state.estimated) {
				const year = new Date(state.endWallMs).getUTCFullYear();
				lines.push(zh
					? year + " 年节假日表未收录，按工作日规则估算"
					: year + " holiday table missing — weekday estimate");
			}
			if (foreignZone) {
				const localDay = dayLabel(localEndMs, localNowMs, zh);
				lines.push(zh
					? "本地时间 " + (localDay === "" ? "" : localDay + " ") + clockText(localEndMs) + " 结束"
					: "local time " + (localDay === "" ? "" : localDay + " ") + clockText(localEndMs));
			}
			lines.push(footer);

			return {
				period: state.period,
				label: zh ? (peak ? "高峰" : "空闲") : (peak ? "Peak" : "Off-peak"),
				compact: zh ? (peak ? "峰" : "闲") : (peak ? "Peak" : "Idle"),
				endText,
				title: lines.join("\n"),
				/* 读屏只念现状与依据，价格说明和入口留给视觉提示 */
				aria: heading + (zh ? "，" : ", ") + reason
			};
		}

		// ---------------------------------------------------------------- 组件

		/**
		 * @param ctx - the client plugin context.
		 * @returns the chip component, closing over `ctx` for Remote access.
		 */
		function makeChip(ctx) {
			return function BalanceChip(props) {
				const wide = props === undefined || props.wide !== false;
				const rootRef = react.useRef(null);
				const lastReadAt = react.useRef(0);
				const inFlight = react.useRef(false);
				// phase: loading | ready | failed
				// signedIn: undefined 表示账号状态流尚未报告
				const [phase, setPhase] = react.useState("loading");
				const [data, setData] = react.useState(null);
				const [signedIn, setSignedIn] = react.useState(undefined);
				const [note, setNote] = react.useState(null);
				// Platform 用量页地址，随账号状态流下发（state.links.usageUrl）
				const [usageUrl, setUsageUrl] = react.useState(null);

				/**
				 * Read the balance. A failure after a good read keeps the last number
				 * rather than blanking the row.
				 * @param force - skip the minimum interval between reads.
				 */
				const read = react.useCallback(async (force) => {
					const now = Date.now();
					if (!force && now - lastReadAt.current < 3000) return;
					if (inFlight.current) return;

					inFlight.current = true;
					lastReadAt.current = now;

					const fail = (reason) => {
						setNote(reason);
						setPhase((prev) => (prev === "ready" ? prev : "failed"));
					};

					try {
						const result = await ctx.remote.account.getBalance({
							version: CLIENT_VERSION,
							locale: ctx.locale.getSnapshot().active,
							timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
						});
						if (result !== null && result !== undefined && result.ok === true) {
							setData(result.value);
							setNote(null);
							setPhase("ready");
							return;
						}
						fail("not-ok:" + JSON.stringify(result === undefined ? null : (result.error ?? null)));
					} catch (error) {
						fail("threw:" + (error instanceof Error ? error.message : String(error)));
					} finally {
						inFlight.current = false;
					}
				}, []);

				// 首次读取
				react.useEffect(() => { read(true); }, [read]);

				// 每轮对话结束：row 重新出现在可见区域时补一次
				react.useEffect(() => {
					const node = rootRef.current;
					if (node === null || typeof IntersectionObserver === "undefined") return undefined;
					const observer = new IntersectionObserver((entries) => {
						for (const entry of entries) if (entry.isIntersecting) read(false);
					});
					observer.observe(node);
					return () => observer.disconnect();
				}, [read]);

				// 兜底轮询 + 窗口重新获得焦点
				react.useEffect(() => {
					const tick = () => { if (!document.hidden) read(false); };
					const timer = window.setInterval(tick, 60000);
					document.addEventListener("visibilitychange", tick);
					window.addEventListener("focus", tick);
					return () => {
						window.clearInterval(timer);
						document.removeEventListener("visibilitychange", tick);
						window.removeEventListener("focus", tick);
					};
				}, [read]);

				// 账号状态流：登录、登出、切换账号时立即反映
				react.useEffect(() => {
					if (typeof ctx.remote.$stream !== "function") return undefined;

					let disposed = false;
					let stream;
					try {
						stream = ctx.remote.$stream({
							name: "account",
							open: (signal) => ctx.remote.account.watch(signal),
							ended: () => new Error("account stream ended")
						});
					} catch {
						// 开流失败不能拖垮组件：定时刷新仍会工作
						return undefined;
					}

					(async () => {
						try {
							for await (const frame of stream) {
								if (disposed) break;
								const value = frame === null || frame === undefined ? undefined : frame.value;
								if (typeof frame.accept === "function") frame.accept();
								if (value !== undefined && value.status === "credential-stored") {
									setSignedIn(true);
									setUsageUrl(value.links === undefined ? null : value.links.usageUrl ?? null);
									read(true);
								} else {
									setSignedIn(false);
									setUsageUrl(null);
								}
							}
						} catch {
							// 流断开只停止推送；轮询与重连会恢复
						}
					})();

					return () => {
						disposed = true;
						try { stream.dispose(); } catch { /* 已释放 */ }
					};
				}, [read]);

				const zh = ctx.locale.getSnapshot().active === "zh";

				/**
				 * 点击主行为：跳转到 Platform 用量页。没有拿到用量地址时退回手动刷新。
				 */
				const openUsage = () => {
					if (usageUrl !== null && usageUrl !== "") {
						window.open(usageUrl, "_blank", "noopener,noreferrer");
						return;
					}
					read(true);
				};

				const baseProps = {
					ref: rootRef,
					type: "button",
					className: CHIP_CLASS,
					"data-compact": wide ? undefined : "true",
					onClick: openUsage
				};

				const label = jsx("span", { className: LABEL_CLASS, children: zh ? "余额" : "Balance" }, "label");

				/*
				 * 这些分支刻意都渲染可见内容、不返回 null。row 看不见时无法区分
				 * 「插件没加载」和「加载了但没数据」；等确认打通往后再收紧。
				 * detail 用 `\n` 分行做悬停；读屏用同样内容的单行版本。
				 */
				const placeholder = (text, detail) => jsxs("button", {
					...baseProps,
					className: CHIP_CLASS + " " + MUTED_CLASS,
					title: detail,
					"aria-label": detail.split("\n").filter(Boolean).join(zh ? "，" : ", "),
					children: [label, jsx("span", { className: MUTED_CLASS, children: text }, "value")]
				});

				if (signedIn === false) {
					return placeholder(
						zh ? "未登录" : "signed out",
						zh ? "账号未登录\n点击重试" : "No account signed in\nClick to retry"
					);
				}

				if (phase === "failed") {
					return placeholder(
						zh ? "—" : "—",
						zh
							? `余额读取失败\n${note ?? "未知原因"}\n点击重试`
							: `Could not read the balance\n${note ?? "unknown"}\nClick to retry`
					);
				}

				if (phase !== "ready") {
					return placeholder(
						"…",
						zh ? "正在读取余额" : "Reading the balance"
					);
				}

				const { main, bonus } = walletsOf(data);
				const mainTexts = textsOf(main);
				const bonusTexts = textsOf(bonus);
				if (mainTexts.length === 0 && bonusTexts.length === 0) {
					return placeholder(
						"—",
						zh ? "接口没有返回任何钱包余额" : "The account returned no wallet balance"
					);
				}

				/* 悬停两行：金额一行，入口一行；读屏只念金额那一行 */
				const amountLine = (zh ? "充值余额 " : "Balance ")
					+ (mainTexts.length === 0 ? "—" : mainTexts.join(" + "))
					+ (bonusTexts.length === 0
						? ""
						: (zh ? "（赠金 " : " (bonus ") + bonusTexts.join(" + ") + (zh ? "）" : ")"));
				const title = amountLine + "\n" + (zh ? "点击查看用量" : "Click to view usage");

				const children = [label];
				children.push(jsx("span", {
					className: AMOUNT_CLASS,
					children: mainTexts.length > 0 ? mainTexts.join(" + ") : "—"
				}, "amount"));
				if (bonusTexts.length > 0) {
					children.push(jsx("span", {
						className: BONUS_CLASS,
						children: "+" + bonusTexts.join(" + ")
					}, "bonus"));
				}

				return jsxs("button", {
					...baseProps,
					title,
					"aria-label": amountLine,
					children
				});
			};
		}

		/**
		 * 峰谷时段行：当前时段 + 它何时结束。纯本地推算，不依赖任何 Remote。
		 * @param ctx - the client plugin context.
		 * @param cfg - 归一化后的规则。
		 * @returns 徽标组件。
		 */
		function makePeakChip(ctx, cfg) {
			return function PeakChip(props) {
				const wide = props === undefined || props.wide !== false;
				const [, bump] = react.useState(0);
				/*
				 * 每 15 秒重算一次：跨过窗口边界时立刻换文案，悬停说明里的倒计时
				 * 也保持新鲜。焦点 / 可见性变化时补一次，唤醒后不用等下一个周期。
				 */
				react.useEffect(() => {
					const tick = () => bump((value) => value + 1);
					const timer = window.setInterval(tick, 15000);
					document.addEventListener("visibilitychange", tick);
					window.addEventListener("focus", tick);
					return () => {
						window.clearInterval(timer);
						document.removeEventListener("visibilitychange", tick);
						window.removeEventListener("focus", tick);
					};
				}, []);
				const zh = ctx.locale.getSnapshot().active === "zh";
				const text = describeChip(Date.now(), cfg, zh);
				const pricingUrl = cfg.pricingUrl === null ? (zh ? PRICING_URL.zh : PRICING_URL.en) : cfg.pricingUrl;
				return jsxs("button", {
					type: "button",
					className: CHIP_CLASS,
					"data-period": text.period,
					"data-compact": wide ? undefined : "true",
					title: text.title,
					"aria-label": text.aria,
					onClick: () => window.open(pricingUrl, "_blank", "noopener,noreferrer"),
					children: [
						jsx("span", { className: PEAK_LABEL_CLASS, children: wide ? text.label : text.compact }, "label"),
						wide ? jsx("span", { className: PEAK_END_CLASS, children: text.endText }, "end") : null
					]
				});
			};
		}

		/**
		 * Register both rows for the plugin's lifetime.
		 * @param ctx - client root context.
		 * @param config - the loader entry's config; every field is optional.
		 */
		function apply(ctx, config) {
			installStyles(ctx);
			const peakConfig = normalizePeakConfig(config);
			const Chip = makeChip(ctx);
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "balance",
				order: 10
			}, Chip));
			const PeakChip = makePeakChip(ctx, peakConfig);
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "balance-peak",
				order: 20
			}, PeakChip));
		}

		exports.apply = apply;
		exports.inject = inject;
		/* 纯推算部分导出给离线测试；加载器只读 apply / inject */
		exports.period = {
			HOLIDAY_TABLE,
			DEFAULT_PEAK,
			periodAt,
			describeChip,
			normalizePeakConfig,
			expandHolidays
		};
		return module.exports;
	}
});
