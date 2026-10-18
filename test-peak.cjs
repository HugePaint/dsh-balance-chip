/**
 * 对 dsh-balance-chip 的峰谷时段推算做离线验证。
 *
 * 不依赖浏览器、不联网：直接跑 bundle 导出的纯函数（`exports.period`），再用最小
 * React hooks 运行时渲染一次峰谷行，检查文案、紧凑形态与点击行为。
 *
 * 时段判断全部按北京挂钟计算，因此本文件在任意 TZ 下结论一致；用不同 TZ 各跑一次
 * 即可验证这一点。
 *
 * 用法：node test-peak.cjs <包目录>
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.argv[2] || ".";
const SRC = path.join(ROOT, "lib/client.js");

// ---------------------------------------------------------------- 环境桩

let definition = null;
let openedWindow = null;
let nowMs = 0;

global.window = {
	__ModuleLoader__: { load: (d) => { definition = d; } },
	setInterval: () => 0,
	clearInterval: () => {},
	addEventListener: () => {},
	removeEventListener: () => {},
	open: (url, target, features) => { openedWindow = { url, target, features }; },
};
global.document = {
	hidden: false,
	querySelector: () => null,
	createElement: () => ({ dataset: {}, textContent: "", remove() {} }),
	head: { appendChild() {} },
	addEventListener: () => {},
	removeEventListener: () => {},
};

const realNow = Date.now;
Date.now = () => nowMs;

// ---------------------------------------------------------------- 最小 hooks

let cursor = 0;
let cells = [];
let effects = [];

const react = {
	useState(init) {
		const i = cursor++;
		if (!(i in cells)) cells[i] = init;
		return [cells[i], (next) => { cells[i] = typeof next === "function" ? next(cells[i]) : next; }];
	},
	useRef(init) {
		const i = cursor++;
		if (!(i in cells)) cells[i] = { current: init };
		return cells[i];
	},
	useCallback(fn) {
		const i = cursor++;
		if (!(i in cells)) cells[i] = fn;
		return cells[i];
	},
	useEffect(fn) {
		cursor++;
		effects.push(fn);
	},
};

const jsx = (type, props, key) => ({ type, props, key });

eval(fs.readFileSync(SRC, "utf8"));
if (definition === null) throw new Error("bundle 没有调用 __ModuleLoader__.load");

const mod = definition.factory((name) => {
	if (name === "react") return react;
	if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
	throw new Error("未预期的 require: " + name);
});

const period = mod.period;
if (period === undefined) throw new Error("bundle 没有导出 period 纯函数");

// ---------------------------------------------------------------- 断言工具

const failures = [];
function check(label, ok, extra) {
	console.log((ok ? "  ok   " : "  FAIL ") + label + (extra === undefined ? "" : "  -> " + extra));
	if (!ok) failures.push(label);
}

const MINUTE = 60000;
const DAY = 86400000;

/**
 * 北京挂钟字符串 → epoch 毫秒。
 * @param text - "YYYY-MM-DD HH:MM"（北京挂钟）。
 * @param zoneMinutes - 时区偏移，默认 +480。
 * @returns epoch 毫秒。
 */
function at(text, zoneMinutes = 480) {
	return Date.parse(text.replace(" ", "T") + ":00Z") - zoneMinutes * MINUTE;
}

/**
 * @param wallMs - 挂钟毫秒。
 * @returns "YYYY-MM-DD HH:MM"（北京挂钟）。
 */
function wallText(wallMs) {
	return new Date(wallMs).toISOString().slice(0, 16).replace("T", " ");
}

const cfg = period.normalizePeakConfig(undefined);
/*
 * 本地偏移取一个固定的十月时刻：用 epoch 0 取会拿到冬令时偏移，夏令时地区就会
 * 与用例时刻的真实偏移不一致，把「同区」用例变成「异区」。
 */
const refInstant = Date.parse("2026-10-14T12:00:00Z");
const localOffset = -new Date(refInstant).getTimezoneOffset();

/**
 * 断言某一时刻的时段与结束时刻（均为北京挂钟）。
 * @param now - "YYYY-MM-DD HH:MM"。
 * @param expectPeriod - "peak" | "idle"。
 * @param expectEnd - "YYYY-MM-DD HH:MM"。
 * @param expectReason - 期望的判定依据（可选）。
 * @param rules - 规则（默认为默认规则）。
 */
function expectPeriodAt(now, expectPeriod, expectEnd, expectReason, rules = cfg) {
	const state = period.periodAt(at(now), rules);
	const okPeriod = state.period === expectPeriod;
	const okEnd = wallText(state.endWallMs) === expectEnd;
	const okReason = expectReason === undefined || state.reason === expectReason;
	check(
		`${now} → ${expectPeriod} 结束于 ${expectEnd}${expectReason === undefined ? "" : " （" + expectReason + "）"}`,
		okPeriod && okEnd && okReason,
		`${state.period} / ${wallText(state.endWallMs)} / ${state.reason}`
	);
}

// ---------------------------------------------------------------- 规则基线

console.log("节假日表：");
const holidays2026 = period.expandHolidays(period.HOLIDAY_TABLE);
check("2026 年共 33 天放假", holidays2026.days.size === 33, holidays2026.days.size);
check("收录了 2026 年", holidays2026.years.has(2026) && !holidays2026.years.has(2027));
for (const key of ["2026-01-01", "2026-02-15", "2026-02-23", "2026-04-06", "2026-05-05", "2026-06-21", "2026-09-25", "2026-10-07"]) {
	check("放假含 " + key, holidays2026.days.has(key));
}
for (const key of ["2026-01-04", "2026-02-14", "2026-02-24", "2026-05-06", "2026-09-20", "2026-10-08", "2026-10-10"]) {
	check("调休/工作日不在放假表 " + key, !holidays2026.days.has(key));
}

console.log("工作日窗口：");
expectPeriodAt("2026-10-14 08:59", "idle", "2026-10-14 09:00", "between");
expectPeriodAt("2026-10-14 09:00", "peak", "2026-10-14 12:00", "in-peak");
expectPeriodAt("2026-10-14 11:59", "peak", "2026-10-14 12:00", "in-peak");
expectPeriodAt("2026-10-14 12:00", "idle", "2026-10-14 14:00", "between");
expectPeriodAt("2026-10-14 13:59", "idle", "2026-10-14 14:00", "between");
expectPeriodAt("2026-10-14 14:00", "peak", "2026-10-14 18:00", "in-peak");
expectPeriodAt("2026-10-14 17:59", "peak", "2026-10-14 18:00", "in-peak");
expectPeriodAt("2026-10-14 18:00", "idle", "2026-10-15 09:00", "after-peak");
expectPeriodAt("2026-10-14 23:59", "idle", "2026-10-15 09:00", "after-peak");

console.log("周末与跨夜：");
expectPeriodAt("2026-10-16 18:00", "idle", "2026-10-19 09:00", "after-peak");
expectPeriodAt("2026-10-17 10:00", "idle", "2026-10-19 09:00", "weekend");
expectPeriodAt("2026-10-18 23:00", "idle", "2026-10-19 09:00", "weekend");
check("2026-10-14 是周三", new Date(at("2026-10-14 12:00")).getUTCDay() === 3);
check("2026-10-19 是周一", new Date(at("2026-10-19 12:00")).getUTCDay() === 1);

console.log("法定节假日：");
expectPeriodAt("2026-10-02 10:00", "idle", "2026-10-08 09:00", "holiday");
expectPeriodAt("2026-10-05 15:00", "idle", "2026-10-08 09:00", "holiday");
expectPeriodAt("2026-01-01 09:30", "idle", "2026-01-05 09:00", "holiday");
expectPeriodAt("2026-02-16 10:00", "idle", "2026-02-24 09:00", "holiday");
expectPeriodAt("2026-05-01 10:00", "idle", "2026-05-06 09:00", "holiday");
expectPeriodAt("2026-10-08 10:00", "peak", "2026-10-08 12:00", "in-peak");
check("调休上班的周六仍按空闲（2026-10-10）", period.periodAt(at("2026-10-10 10:00"), cfg).reason === "weekend");
check("调休后第一个工作日恢复高峰（2026-10-12 周一）", period.periodAt(at("2026-10-12 10:00"), cfg).period === "peak");

console.log("表外年份与覆盖提示：");
const outside = period.periodAt(at("2027-03-03 10:00"), cfg);
check("2027 年按工作日规则估算（周三 10:00 为高峰）", outside.period === "peak" && outside.estimated === true,
	`${outside.period} estimated=${outside.estimated}`);
check("2026 年内不标 estimated", period.periodAt(at("2026-10-14 10:00"), cfg).estimated === false);
const appended = period.normalizePeakConfig({ holidays: ["2027-03-03"] });
check("config.holidays 可追加放假日", appended.holidays.has("2027-03-03") && appended.holidayYears.has(2027));
check("追加后该日不再算高峰", period.periodAt(at("2027-03-03 10:00"), appended).period === "idle");
check("追加不影响内置 2026 表", appended.holidays.has("2026-10-02"));

console.log("config 覆盖与容错：");
const customWindow = period.normalizePeakConfig({ windows: ["10:00-11:00"] });
expectPeriodAt("2026-10-14 09:30", "idle", "2026-10-14 10:00", "between", customWindow);
expectPeriodAt("2026-10-14 10:30", "peak", "2026-10-14 11:00", "in-peak", customWindow);
const weekendOnly = period.normalizePeakConfig({ weekdays: [0, 6] });
check("窗口外按周几配置判定（周三不在 [0,6] 内 → 全天空闲）",
	period.periodAt(at("2026-10-14 12:30"), weekendOnly).reason === "rest");
expectPeriodAt("2026-10-17 10:30", "peak", "2026-10-17 12:00", "in-peak", weekendOnly);
const bad = period.normalizePeakConfig({ windows: ["nonsense", "25:00-26:00"], weekdays: [9], zoneOffsetMinutes: "x", holidays: ["not-a-date"] });
check("非法 windows/weekdays/zone 全部退回默认",
	bad.windows.length === 2 && bad.weekdays.length === 5 && bad.zoneOffsetMinutes === 480);
check("非法 holidays 被忽略且不污染表", bad.holidays.size === holidays2026.days.size);
check("ignoreHolidays 让国庆当天也算高峰",
	period.periodAt(at("2026-10-02 10:00"), period.normalizePeakConfig({ ignoreHolidays: true })).period === "peak");
check("config 不是对象也不抛", period.normalizePeakConfig(null).windows.length === 2 && period.normalizePeakConfig("x").windows.length === 2);

console.log("文案：");
const sameZone = period.normalizePeakConfig({ zoneOffsetMinutes: localOffset });
const idleText = period.describeChip(at("2026-10-14 18:00", localOffset), sameZone, true);
check("空闲时段名", idleText.label === "空闲" && idleText.compact === "闲", idleText.label);
check("同区不标北京前缀：明天 09:00 结束", idleText.endText === "明天 09:00 结束", idleText.endText);
check("悬停含时段/结束/倒计时", /空闲时段/.test(idleText.title) && /09:00 结束（还有 15 小时/.test(idleText.title), idleText.title);
check("悬停说明空闲价是高峰一半", /空闲价格为高峰的一半/.test(idleText.title));
check("悬停含点击提示", /点击查看计费说明/.test(idleText.title));
const peakText = period.describeChip(at("2026-10-14 09:30", localOffset), sameZone, true);
check("高峰时段名", peakText.label === "高峰" && peakText.compact === "峰");
check("高峰窗口内结束时间", peakText.endText === "12:00 结束", peakText.endText);
check("高峰悬停列出窗口", /高峰窗口：工作日 09:00–12:00、14:00–18:00/.test(peakText.title), peakText.title);
const longText = period.describeChip(at("2026-10-16 18:00", localOffset), sameZone, true);
check("跨周末用周几（周一 09:00 结束）", longText.endText === "周一 09:00 结束", longText.endText);
const holidayText = period.describeChip(at("2026-10-02 10:00", localOffset), sameZone, true);
check("节假日悬停解释原因", /今天是中国法定节假日，全天空闲/.test(holidayText.title), holidayText.title);
check("节假日结束日期用周几（10-02 → 10-08 周四）", holidayText.endText === "周四 09:00 结束", holidayText.endText);
check("长假倒计时用天", /还有 5 天 23 小时/.test(holidayText.title), holidayText.title);
const foreign = period.normalizePeakConfig({ zoneOffsetMinutes: localOffset + 120 });
const foreignText = period.describeChip(at("2026-10-14 09:30", localOffset + 120), foreign, true);
check("异区标出北京前缀", foreignText.endText === "北京 12:00 结束", foreignText.endText);
check("异区悬停给出本地时间", /本地时间 /.test(foreignText.title), foreignText.title);
const enText = period.describeChip(at("2026-10-14 09:30", localOffset), sameZone, false);
check("英文文案", enText.label === "Peak" && enText.endText === "ends 12:00" && /off-peak is half price/.test(enText.title), enText.endText);
const estimateText = period.describeChip(at("2027-03-03 10:00"), cfg, true);
check("表外年份在悬停里说明", /2027 年节假日表未收录，按工作日规则估算/.test(estimateText.title), estimateText.title);

console.log("悬停排版：");
/*
 * 悬停用原生 title，Chromium 把 `\n` 渲染成换行。要求：每行只说一件事、都不长。
 * 44 字是实测的安全上界（侧边栏展开约 240px，原生 tooltip 不折行）。
 */
const samples = [
	["工作日高峰", period.describeChip(at("2026-10-14 09:30"), cfg, true)],
	["工作日窗口间", period.describeChip(at("2026-10-14 12:30"), cfg, true)],
	["工作日夜间", period.describeChip(at("2026-10-14 20:00"), cfg, true)],
	["周末", period.describeChip(at("2026-10-17 10:00"), cfg, true)],
	["节假日长假", period.describeChip(at("2026-10-02 10:00"), cfg, true)],
	["周日深夜", period.describeChip(at("2026-10-18 23:00"), cfg, true)],
	["表外年份", estimateText],
	["异区", period.describeChip(at("2026-10-14 09:30", localOffset + 120), foreign, true)],
	["英文", period.describeChip(at("2026-10-14 09:30"), cfg, false)]
];
for (const [name, chip] of samples) {
	const lines = chip.title.split("\n");
	const longest = Math.max(...lines.map((line) => line.length));
	check(`${name}：${lines.length} 行，最长 ${longest} 字`,
		lines.length >= 3 && lines.length <= 5
			&& lines.every((line) => line.length > 0 && line.length <= 44)
			&& lines[0].length <= 40
			&& !/\n/.test(chip.aria) && chip.aria.length <= 80,
		JSON.stringify(lines));
}
check("同一行不再堆满 · 分隔符", samples.every(([, chip]) => !chip.title.includes(" · 空闲价格")), JSON.stringify(samples[0][1].title));
check("首行是现状（时段 + 结束 + 倒计时）", /^空闲时段 · (北京 )?明天 09:00 结束（还有/.test(samples[2][1].title.split("\n")[0]),
	samples[2][1].title.split("\n")[0]);
check("末行是价格与入口", /空闲价格为高峰的一半 · 点击查看计费说明$/.test(samples[0][1].title), samples[0][1].title.split("\n").pop());
// 机器就在 UTC+8 时只有「异区」样例带本地时间行；不在 UTC+8 时每个中文样例都该带
const zhSamples = samples.filter(([name]) => name !== "英文");
const withLocal = zhSamples.filter(([, chip]) => /本地时间 /.test(chip.title)).map(([name]) => name);
check(`中文样例的本地时间行只在机器不在 UTC+8 时出现（本机偏移 ${localOffset} 分钟）`,
	localOffset === 480 ? withLocal.length === 1 : withLocal.length === zhSamples.length,
	withLocal.join(","));
check("英文样例用 local time 表达同一件事",
	localOffset === 480 ? !/local time/.test(samples[8][1].title) : /local time/.test(samples[8][1].title),
	samples[8][1].title);
check("表内年份没有估算行", !/估算/.test(samples[0][1].title) && /估算/.test(samples[6][1].title));
const peakEnd = at("2026-10-14 12:00");
const countdown = [
	peakEnd - 30000,      // 11:59:30 → 30 秒
	peakEnd - 120000,     // 11:58    → 2 分钟
	peakEnd - 3600000,    // 11:00    → 1 小时
	at("2026-10-16 18:00") // 周五 18:00 → 周一 09:00，跨周末 2 天 15 小时
].map((instant) => period.describeChip(instant, cfg, true).title);
check("倒计时覆盖秒/分/小时/天四档",
	/不到 1 分钟/.test(countdown[0]) && /还有 2 分钟/.test(countdown[1])
		&& /还有 1 小时/.test(countdown[2]) && /还有 2 天 15 小时/.test(countdown[3]),
	countdown.map((title) => /还有 ([^）]*)/.exec(title)[1]).join(" | "));

// ---------------------------------------------------------------- 时区无关性指纹

/*
 * 时段判断只用 UTC 取值，所以下面这串结论必须在任何 TZ 下逐字相同。
 * 用不同 TZ 跑本文件并比这一行即可验证。
 */
const fingerprint = [
	"2026-01-01 09:30", "2026-02-16 10:00", "2026-04-04 10:00", "2026-05-01 10:00",
	"2026-06-19 10:00", "2026-09-25 10:00", "2026-10-02 10:00", "2026-10-08 10:00",
	"2026-10-14 08:59", "2026-10-14 12:00", "2026-10-14 18:00", "2026-10-16 18:00",
	"2026-10-17 10:00", "2027-03-03 10:00"
].map((now) => {
	const state = period.periodAt(at(now), cfg);
	return now + "=" + state.period + "@" + wallText(state.endWallMs);
}).join("|");
console.log("SCHEDULE-FINGERPRINT " + fingerprint);

// ---------------------------------------------------------------- 渲染

console.log("渲染：");
const registered = [];
const ctx = {
	effect: (fn) => (typeof fn === "function" ? fn() : undefined),
	locale: { getSnapshot: () => ({ active: "zh" }) },
	slots: {
		inject: (_name, cb) => cb(),
		register: (desc, component) => { registered.push({ desc, component }); return () => {}; },
	},
};

nowMs = at("2026-10-14 18:00", localOffset);
mod.apply(ctx, { zoneOffsetMinutes: localOffset });
check("注册了两个条目", registered.length === 2, registered.length);
check("条目 id / order", registered.map((r) => r.desc.id + ":" + r.desc.order).join(",") === "balance:10,balance-peak:20",
	registered.map((r) => r.desc.id + ":" + r.desc.order).join(","));

const PeakChip = registered[1].component;
cursor = 0; cells = []; effects = [];
const wide = PeakChip({ wide: true });
check("宽栏渲染 button", wide.type === "button");
check("data-period = idle", wide.props["data-period"] === "idle");
check("标签是空闲", wide.props.children[0].props.children === "空闲");
check("结束时间是 明天 09:00 结束", wide.props.children[1].props.children === "明天 09:00 结束",
	wide.props.children[1] && wide.props.children[1].props.children);
check("title 是多行（3 行）", wide.props.title.split("\n").length === 3, JSON.stringify(wide.props.title.split("\n")));
check("aria-label 是单行「现状 + 依据」",
	!/\n/.test(wide.props["aria-label"]) && wide.props["aria-label"] === wide.props.title.split("\n").slice(0, 2).join("，"),
	wide.props["aria-label"]);

cursor = 0; cells = []; effects = [];
const narrow = registered[1].component({ wide: false });
check("窄轨只留时段名", narrow.props["data-compact"] === "true" && narrow.props.children[0].props.children === "闲" && narrow.props.children[1] === null,
	JSON.stringify(narrow.props.children.map((child) => child && child.props.children)));

cursor = 0; cells = []; effects = [];
const balance = registered[0].component({ wide: true });
check("余额行未被破坏", balance.type === "button" && balance.props.children[0].props.children === "余额");

openedWindow = null;
wide.props.onClick();
check("点击打开计费说明", openedWindow !== null && /api-docs\.deepseek\.com/.test(openedWindow.url), openedWindow && openedWindow.url);
check("新标签页 + noopener", openedWindow !== null && openedWindow.target === "_blank" && openedWindow.features === "noopener,noreferrer");

const customCtx = { ...ctx, slots: { ...ctx.slots, register: (desc, component) => { registered.push({ desc, component }); return () => {}; } } };
cursor = 0; cells = []; effects = [];
mod.apply(customCtx, { zoneOffsetMinutes: localOffset, pricingUrl: "https://example.test/pricing" });
const customChip = registered[registered.length - 1].component({ wide: true });
openedWindow = null;
customChip.props.onClick();
check("config.pricingUrl 生效", openedWindow !== null && openedWindow.url === "https://example.test/pricing", openedWindow && openedWindow.url);

Date.now = realNow;
console.log(failures.length === 0 ? "\n全部通过" : `\n${failures.length} 项失败`);
process.exit(failures.length === 0 ? 0 : 1);
