/**
 * 对 dsh-balance-chip 的客户端 bundle 做离线验证。
 *
 * 不依赖浏览器：手工搭一套最小的 React hooks 运行时、假的 ctx 和假的
 * account Remote，然后驱动组件走一遍「首次渲染 → effect 读余额 → 重渲染」。
 * 峰谷时段行的用例在 test-peak.cjs。
 *
 * 用法：node test-client.cjs <包目录>
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.argv[2] || ".";
const SRC = path.join(ROOT, "lib/client.js");

// ---------------------------------------------------------------- 环境桩

let definition = null;
let openedWindow = null;
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

// ---------------------------------------------------------------- 最小 hooks

let cursor = 0;
let cells = [];
let effects = [];
const registered = [];

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
const jsxRuntime = { jsx, jsxs: jsx };

function render(Chip) {
  cursor = 0;
  return Chip();
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// ---------------------------------------------------------------- 断言工具

const failures = [];
function check(label, ok, extra) {
  console.log((ok ? "  ok   " : "  FAIL ") + label + (extra === undefined ? "" : "  -> " + extra));
  if (!ok) failures.push(label);
}

/**
 * 按注册 id 取插槽条目；峰谷行也注册在同一个 list 里，所以不能靠下标。
 * @param id - 注册 id。
 * @returns 该条目。
 */
function findRow(id) {
  const row = registered.find((entry) => entry.desc.id === id);
  if (row === undefined) throw new Error("没有注册插槽条目: " + id);
  return row;
}

// ---------------------------------------------------------------- 装配

eval(fs.readFileSync(SRC, "utf8"));
if (definition === null) throw new Error("bundle 没有调用 __ModuleLoader__.load");

const mod = definition.factory((name) => {
  if (name === "react") return react;
  if (name === "react/jsx-runtime") return jsxRuntime;
  throw new Error("未预期的 require: " + name);
});

const BALANCE = {
  status: "ready",
  value: [{ balance: "1234.567", currency: "CNY" }],
  bonusWallets: [
    { balance: "0.5", currency: "CNY" },
    { balance: "0", currency: "CNY" },          // 0 应被过滤
    { balance: "3.00", currency: "USD" },
  ],
};

/**
 * 装好一个实例并驱动到「挂载 + 首次读取完成」。
 * @param getBalance - 假的余额接口。
 * @returns 组件与前后两次渲染结果。
 */
async function setup(getBalance, options) {
  const opts = options || {};
  let meta = null;
  const remote = {};
  if (opts.noAccount !== true) {
    remote.account = { getBalance: async (m) => { meta = m; return getBalance(); } };
  }
  const ctx = {
    effect: (fn) => (typeof fn === "function" ? fn() : undefined),
    locale: { getSnapshot: () => ({ active: "zh" }) },
    remote,
    slots: {
      inject: (_name, cb) => cb(),
      register: (desc, component) => { registered.push({ desc, component }); return () => {}; },
    },
  };

  cursor = 0;
  cells = [];
  effects = [];
  registered.length = 0;

  mod.apply(ctx);
  const Chip = findRow("balance").component;
  const first = render(Chip);
  effects[0]();
  await tick();
  return { first, second: render(Chip), meta: () => meta };
}

(async () => {
  console.log("声明：");
  check("inject 是数组", Array.isArray(mod.inject), typeof mod.inject);
  for (const service of ["slots", "locale", "remote", "remote.account"]) {
    check("inject 声明了 " + service, Array.isArray(mod.inject) && mod.inject.includes(service));
  }
  // 回归：访问未声明的服务会抛 "cannot get property ... without inject"，
  // 而不是返回 undefined —— 所以必须声明 remote.account 才能访问 ctx.remote.account
  check("remote.account 必须在 inject 里",
    Array.isArray(mod.inject) && mod.inject.includes("remote.account"));

  console.log("注册：");
  const okRun = await setup(() => ({ ok: true, value: BALANCE }));
  check("注册了两个插槽条目（余额 + 峰谷）", registered.length === 2, registered.length);
  check("插槽名都是 sidebar.footer.action",
    registered.every((row) => row.desc.name === "sidebar.footer.action"),
    registered.map((row) => row.desc.name).join(","));
  // 回归：list 插槽强制要求 id，缺了会在运行时抛
  // "list slot requires options.id"（插槽名报错、界面无痕）
  check("list 插槽条目带 id（余额在前）",
    registered.map((row) => row.desc.id).join(",") === "balance,balance-peak",
    registered.map((row) => row.desc.id).join(","));

  console.log("正常读取：");
  const firstText = okRun.first === null ? "" : JSON.stringify(okRun.first.props.children);
  check("读取中渲染可见占位（不静默）", /余额/.test(firstText), firstText);
  check("重渲染出 button", okRun.second !== null && okRun.second.type === "button");

  const meta = okRun.meta();
  check("请求带 version", meta !== null && typeof meta.version === "string", meta && meta.version);
  check("请求带 locale", meta !== null && meta.locale === "zh", meta && meta.locale);
  check("请求带时区偏移", meta !== null && typeof meta.timezoneOffsetSeconds === "number",
    meta && meta.timezoneOffsetSeconds);

  if (okRun.second !== null) {
    const text = okRun.second.props.children.map((k) => (k && k.props ? k.props.children : null));
    console.log("  children =", JSON.stringify(text));
    check("第一段是标签", text[0] === "余额", text[0]);
    check("充值余额截断到分且带千分位", text[1] === "¥1,234.56", text[1]);
    check("赠金只保留正额并分币种", text[2] === "+¥0.50 + $3.00", text[2]);
    check("title 含查看用量提示", /查看用量/.test(okRun.second.props.title), okRun.second.props.title);
    // 悬停分两行：金额一行、入口一行；读屏只念金额那一行
    const lines = String(okRun.second.props.title).split("\n");
    check("悬停两行且每行都短", lines.length === 2 && lines.every((line) => line.length <= 44),
      JSON.stringify(lines));
    check("悬停首行是完整金额（含赠金）", lines[0] === "充值余额 ¥1,234.56（赠金 ¥0.50 + $3.00）", lines[0]);
    check("aria-label 是单行金额", okRun.second.props["aria-label"] === lines[0] && !/\n/.test(okRun.second.props["aria-label"]),
      okRun.second.props["aria-label"]);
  }

  console.log("接口失败：");
  const badRun = await setup(() => ({ ok: false, error: "nope" }));
  check("失败时给出可见占位（不再静默）", badRun.second !== null, String(badRun.second));
  check("提示里带失败原因，便于定位",
    badRun.second !== null && /not-ok/.test(String(badRun.second.props.title)),
    badRun.second && badRun.second.props.title);
  check("失败提示按行拆开（原因单独一行）",
    badRun.second !== null && String(badRun.second.props.title).split("\n").length === 3,
    badRun.second && JSON.stringify(String(badRun.second.props.title).split("\n")));

  console.log("remote.account 缺失：");
  const noService = await setup(() => ({ ok: true, value: BALANCE }), { noAccount: true });
  check("仍渲染可见内容而非静默", noService.second !== null, String(noService.second));
  check("异常被捕获并带 threw 原因",
    noService.second !== null && /threw/.test(String(noService.second.props.title)),
    noService.second && noService.second.props.title);

  console.log("点击跳转用量：");
  openedWindow = null;
  const usageCtx = {
    effect: (fn) => (typeof fn === "function" ? fn() : undefined),
    locale: { getSnapshot: () => ({ active: "zh" }) },
    remote: {
      account: { getBalance: async () => ({ ok: true, value: BALANCE }) },
      $stream: () => ({
        async *[Symbol.asyncIterator]() {
          yield { value: { status: "credential-stored", links: { usageUrl: "https://platform.example/usage" } }, accept() {} };
          await new Promise(() => {}); // 挂起，保持流开
        },
        dispose() {},
      }),
    },
    slots: { inject: (_n, cb) => cb(), register: (d, c) => { registered.push({ desc: d, component: c }); return () => {}; } },
  };
  cursor = 0; cells = []; effects = []; registered.length = 0;
  mod.apply(usageCtx);
  const UsageChip = findRow("balance").component;
  render(UsageChip);
  for (const ef of effects) ef();
  await tick(); await tick();
  const usageEl = render(UsageChip);
  check("渲染为 button", usageEl !== null && usageEl.type === "button", String(usageEl && usageEl.type));
  if (usageEl !== null) {
    usageEl.props.onClick();
    check("点击打开用量地址", openedWindow !== null && openedWindow.url === "https://platform.example/usage",
      openedWindow && openedWindow.url);
    check("新标签页打开", openedWindow !== null && openedWindow.target === "_blank",
      openedWindow && openedWindow.target);
    check("提示改为查看用量", /查看用量/.test(String(usageEl.props.title)), usageEl.props.title);
  }

  console.log(failures.length === 0 ? "\n全部通过" : `\n${failures.length} 项失败`);
  process.exit(failures.length === 0 ? 0 : 1);
})();
