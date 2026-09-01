// Общая часть страниц показа: загрузка данных с сервера и разбор.
//
// Данные НАСТОЯЩИЕ: те самые занятия, которые терапистки собрали на планшетах.
// Читаются одним запросом к /api/demo (только чтение, отдельный ключ).
// Если сервер недоступен — страницы честно скажут об этом, а не покажут
// выдуманные числа.
//
// Правила «сигналов» здесь те же, что в приложении, — иначе кабинет и планшет
// говорили бы о цели разное:
//   освоено          — три последних замера ≥ 80%
//   стоит на месте   — от 4 замеров, разброс < 10 п.п., среднее < 80%
//   нет данных N дней — по дате последнего занятия

const DEMO_API = "https://api.abachecklist.ru/api/demo?k=c82788010a537040880ab4cf";

// Кабинет супервизора: загрузка данных с сервера и разбор.
//
// Отличие от demo/demo.js, откуда это выросло: там данные брались по ключу
// в адресе (страницы показа), здесь — ТОЛЬКО ПО ВХОДУ, и сервер сам решает,
// кого пускать: кабинет открыт супервизорам, а терапист получит
// внятный отказ. Папка demo/ временная и уедет после показа; правила разбора
// с тех пор живут здесь.
//
// Правила «сигналов» те же, что в приложении, — иначе кабинет и планшет
// говорили бы о цели разное:
//   освоено          — три последних замера ≥ 80%
//   стоит на месте   — от 4 замеров, разброс < 10 п.п., среднее < 80%
//   нет данных N дней — по дате последнего занятия
//
// Поверх этого есть РЕШЕНИЯ супервизора (goal_status на сервере): «освоено»
// и «в архив». Решение — это не сигнал, а факт: его поставил человек, и оно
// сильнее любой арифметики. Планшеты забирают решения и убирают архивные
// цели со «Сбора».

const CABINET_API = "https://api.abachecklist.ru/api/cabinet";

const MASTERY_MIN = 80;
const PLATEAU_MIN_POINTS = 4;
const PLATEAU_SPREAD = 10;
const PLATEAU_MEAN_MAX = 80;
const SILENT_DAYS = 5;

async function loadCabinet() {
  if (!window.abaAuth || !window.abaAuth.get()) {
    const err = new Error("нужен вход");
    err.needAuth = true;
    throw err;
  }
  const res = await fetch(CABINET_API, { cache: "no-store", headers: window.abaAuth.headers() });
  let data = {};
  try { data = await res.json(); } catch (_) { /* сервер ответил не JSON */ }
  if (!res.ok || !data.ok) {
    const err = new Error(data.error || "сервер ответил " + res.status);
    // 401 — вход устарел, надо войти заново. 403 — вошёл, но не тот, кому
    // сюда можно: это разные разговоры с человеком, и путать их нельзя.
    if (res.status === 401) err.needAuth = true;
    if (res.status === 403) err.forbidden = true;
    throw err;
  }
  return prepare(data);
}

// Решение супервизора по цели или по протоколу целиком (goal = "").
// status: "mastered" | "archived" | "active" (последнее — снять решение).
async function sendDecision(child, protocol, goal, status) {
  const res = await fetch(CABINET_API + "/decision", {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, window.abaAuth.headers()),
    body: JSON.stringify({ child: child, protocol: protocol, goal: goal || "", status: status })
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || "сервер ответил " + res.status);
  return data;
}

// Из плоского списка замеров собираем удобную структуру: ребёнок → цели → ряд.
function prepare(data) {
  const now = new Date(data.now);
  const kids = new Map();

  const kid = (label) => {
    if (!kids.has(label)) {
      kids.set(label, { label: label, goals: new Map(), dates: new Set(), behavior: [], abc: [], gen: new Map() });
    }
    return kids.get(label);
  };

  (data.children || []).forEach((c) => {
    const k = kid(c.label);
    k.sessions = Number(c.sessions) || 0;
    k.lastDate = c.last_date ? day(c.last_date) : "";
  });

  (data.measurements || []).forEach((m) => {
    const k = kid(m.child);
    const d = day(m.date);
    k.dates.add(d);
    if (m.no_data) return;                    // цель была на экране, но не отрабатывалась
    const id = m.protocol + " ‖ " + m.goal;
    if (!k.goals.has(id)) {
      k.goals.set(id, { protocol: m.protocol, goal: m.goal, points: [] });
    }
    k.goals.get(id).points.push({ date: d, percent: Number(m.percent) || 0, responses: m.responses, prompts: m.prompts, staff: m.staff || "" });
  });

  (data.behavior || []).forEach((b) => kid(b.child).behavior.push({
    behavior: b.behavior, date: day(b.date), count: Number(b.count) || 0,
    minutes: Number(b.minutes) || 0, rate: Number(b.rate) || 0
  }));
  // Эпизоды ABC супервизор читает целиком: что было до, что случилось,
  // что было после. Ради этого их и записывают.
  // Пробы обобщения: девять условий на цель — три стимула, три места, три
  // человека. Собираем по цели, чтобы показать «сколько из девяти пройдено».
  (data.generalization || []).forEach((g) => {
    const k = kid(g.child);
    const id = g.protocol + " ‖ " + g.goal;
    if (!k.gen.has(id)) {
      k.gen.set(id, { protocol: g.protocol, goal: g.goal, passed: new Map(), failed: new Map(), removed: 0, last: "" });
    }
    const item = k.gen.get(id);
    // Ключ условия — категория и НОМЕР слота (1..3). По тексту нельзя:
    // терапист может переписать «2» на «Дом», и это то же самое условие,
    // а не новое. У проб до 26.08.2026 номера нет — там ключом остаётся
    // текст, как и было.
    // У старых проб номера нет, но там условием как раз и был номер слота
    // («1», «2», «3») — используем его, тогда старая «2» и новая «Дом»
    // в том же слоте не задваиваются.
    const legacy = /^[123]$/.test(String(g.condition).trim()) ? Number(g.condition) : 0;
    const slotNum = Number(g.slot) > 0 ? Number(g.slot) : legacy;
    const key = g.category + "#" + (slotNum || g.condition);
    // Три исхода, и «не прошла» — это НЕ пройденное условие. Раньше сюда
    // приходило только passed/removed, поэтому важно считать явно.
    if (g.mark === "removed") { item.removed += 1; item.passed.delete(key); item.failed.delete(key); }
    else if (g.mark === "failed") { item.failed.set(key, g.condition); item.passed.delete(key); }
    // Условие словами: «кубик», «коридор». У проб, отмеченных до 21.08.2026,
    // подписи нет — там придёт номер 1/2/3, и это честно видно.
    else { item.passed.set(key, g.condition); item.failed.delete(key); }
    const d = day(g.date);
    if (d > item.last) item.last = d;
  });

  (data.abc || []).forEach((a) => kid(a.child).abc.push({
    date: day(a.date), time: a.time || "",
    antecedent: a.antecedent || "", behavior: a.behavior || "", consequence: a.consequence || "",
    intensity: a.intensity || "", duration: a.duration || ""
  }));

  // Решения супервизора. Решение по протоколу (goal пустой) накрывает все
  // его цели — так и задумано: «протокол освоен» означает освоен целиком.
  const byChild = new Map();
  (data.decisions || []).forEach((d) => {
    if (!byChild.has(d.child)) byChild.set(d.child, { protocols: new Map(), goals: new Map() });
    const store = byChild.get(d.child);
    const item = { status: d.status, at: day(d.decided_at), by: d.decided_by || "" };
    if (d.goal) store.goals.set(d.protocol + " ‖ " + d.goal, item);
    else store.protocols.set(d.protocol, item);
  });

  // Состав планшета из последнего слепка настройки. Нужен, чтобы отличить
  // «цель ведут» от «цель на планшете уже удалили, а замеры остались».
  // Слепка может не быть вовсе — тогда ничего не помечаем: молчание честнее
  // ложной пометки «нет на планшете» у ребёнка, чей планшет просто ещё не
  // присылал настройку.
  const снимки = data.snapshots || {};

  const children = [...kids.values()].map((k) => {
    const decisions = byChild.get(k.label) || { protocols: new Map(), goals: new Map() };
    const снимок = снимки[k.label]
      ? {
          at: day(снимки[k.label].at),
          protocols: new Set(снимки[k.label].protocols || []),
          goals: new Set(снимки[k.label].goals || [])
        }
      : null;
    const goals = [...k.goals.values()].map((g) => {
      g.points.sort((a, b) => a.date.localeCompare(b.date));
      const values = g.points.map((p) => p.percent);
      g.last = values.length ? values[values.length - 1] : null;
      g.status = goalStatus(values);
      g.lastDate = g.points.length ? g.points[g.points.length - 1].date : "";
      // Решение по самой цели важнее решения по протоколу: супервизор мог
      // архивировать протокол, а одну цель вернуть в работу.
      g.decision = decisions.goals.get(g.protocol + " ‖ " + g.goal)
        || decisions.protocols.get(g.protocol) || null;
      // null = не знаем (слепка нет), true/false = есть или нет на планшете.
      g.onDevice = снимок ? снимок.goals.has(g.protocol + " ‖ " + g.goal) : null;
      return g;
    }).sort((a, b) => a.protocol.localeCompare(b.protocol) || a.goal.localeCompare(b.goal));

    const dates = [...k.dates].sort();
    const last = k.lastDate || (dates.length ? dates[dates.length - 1] : "");
    const recent = goals.flatMap((g) => g.points.filter((p) => daysBetween(p.date, now) <= 14).map((p) => p.percent));

    // Протоколы, отмеченные супервизором, но без единого замера, в списке
    // целей не всплывут — держим решения по протоколам отдельным списком.
    return {
      label: k.label,
      protocolDecisions: decisions.protocols,
      goalDecisions: decisions.goals,
      snapshot: снимок,
      sessions: k.sessions != null ? k.sessions : dates.length,
      days: dates.length,
      lastDate: last,
      silentDays: last ? daysBetween(last, now) : null,
      goals: goals,
      // «Освоено» — это ПОМЕТКА, а не уборка: такая цель остаётся в списке,
      // просто с ярлыком. Из списка убирает архив, а «удалено» убирает
      // отовсюду: такой цели у ребёнка больше нет.
      active: goals.filter((g) => !g.decision || g.decision.status === "mastered"),
      archived: goals.filter((g) => g.decision && g.decision.status === "archived"),
      done: goals.filter((g) => g.decision && g.decision.status === "mastered"),
      // Счётчики — по целям, которые не убраны в архив. Решение супервизора
      // «освоено» считается наравне с расчётным критерием: он посмотрел
      // глазами, это сильнее арифметики.
      mastered: goals.filter((g) => {
        if (g.decision && g.decision.status !== "mastered") return false;
        if (g.decision && g.decision.status === "mastered") return true;
        return g.status === "mastered";
      }).length,
      stuck: goals.filter((g) => !g.decision && g.status === "plateau").length,
      avg14: recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null,
      behavior: k.behavior,
      gen: [...k.gen.values()]
        .map((g) => ({
          protocol: g.protocol,
          goal: g.goal,
          passed: g.passed.size,
          passedNames: [...g.passed.values()],
          // Условия, где проба не прошла и с тех пор не была пройдена.
          failed: [...g.failed.values()],
          last: g.last
        }))
        .sort((a, b) => b.passed - a.passed),
      abc: k.abc.sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time))
    };
  }).sort((a, b) => a.label.localeCompare(b.label));

  return {
    now: now,
    me: data.me || { name: "", role: "" },   // кто вошёл — рисуем в шапке
    totals: data.totals || {},
    children: children,
    feed: data.feed || []
  };
}

// Статус цели по тем же правилам, что в приложении.
function goalStatus(values) {
  if (!values.length) return "new";
  const last3 = values.slice(-3);
  if (last3.length === 3 && last3.every((v) => v >= MASTERY_MIN)) return "mastered";
  // Ряд из одних 0 и 100 — это цель с одной пробой за занятие: там процент
  // означает «получилось / не получилось», и любая «динамика» по нему —
  // выдумка. Такие цели оставляем без ярлыка (правило то же, что в отчёте).
  const binary = values.every((v) => v === 0 || v === 100);
  if (binary) return "work";

  if (values.length >= PLATEAU_MIN_POINTS) {
    const tail = values.slice(-PLATEAU_MIN_POINTS);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    const spread = Math.max(...tail) - Math.min(...tail);
    if (spread < PLATEAU_SPREAD && mean < PLATEAU_MEAN_MAX) return "plateau";
  }
  // «Растёт» — по тому же строгому правилу, что в отчёте для родителей:
  // мало разницы между первым и последним замером, нужен именно ступенчатый
  // подъём (худший замер второй половины не ниже лучшего из первой).
  // Иначе ряд 10 · 90 · 20 · 85 читался бы как рост.
  if (values.length >= PLATEAU_MIN_POINTS) {
    const half = Math.floor(values.length / 2);
    const first = values.slice(0, half);
    const second = values.slice(-half);
    const delta = second.reduce((a, b) => a + b, 0) / second.length - first.reduce((a, b) => a + b, 0) / first.length;
    const steppedUp = Math.min(...second) >= Math.max(...first);
    if (delta >= 15 && steppedUp) return "growth";
  }
  return "work";
}

const STATUS_TEXT = {
  mastered: ["good", "освоено"],
  plateau: ["warn", "стоит на месте"],
  growth: ["good", "растёт"],
  work: ["", "в работе"],
  new: ["", "первое занятие"]
};

// ── Мелочи ────────────────────────────────────────────────────────────────
function day(value) { return String(value || "").slice(0, 10); }

function daysBetween(dateStr, now) {
  const a = new Date(dateStr + "T00:00:00Z");
  const b = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((b - a) / 86400000);
}

function plural(n, one, few, many) {
  const t = n % 10, h = n % 100;
  if (t === 1 && h !== 11) return one;
  if (t >= 2 && t <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

function humanDays(n) {
  if (n == null) return "нет занятий";
  if (n === 0) return "сегодня";
  if (n === 1) return "вчера";
  return n + " " + plural(n, "день", "дня", "дней") + " назад";
}

function humanDate(d) {
  const m = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const dt = new Date(d + "T00:00:00Z");
  return dt.getUTCDate() + " " + m[dt.getUTCMonth()];
}

function humanTime(iso) {
  const dt = new Date(String(iso).replace(" ", "T").replace("Z", "Z"));
  const p = (n) => String(n).padStart(2, "0");
  return p(dt.getHours()) + ":" + p(dt.getMinutes());
}

function pctClass(v) {
  if (v == null) return "pct";
  return "pct " + (v >= MASTERY_MIN ? "green" : v < 50 ? "low" : "");
}

// Маленький график ряда процентов — тот же приём, что на «Сборе».
function sparkline(values, w, h) {
  w = w || 96; h = h || 26;
  if (!values.length) return "";
  if (values.length === 1) {
    return `<svg class="spark" width="${w}" height="${h}"><circle cx="${w - 4}" cy="${h - 4 - (values[0] / 100) * (h - 8)}" r="3" fill="var(--accent)"/></svg>`;
  }
  const step = (w - 8) / (values.length - 1);
  const pts = values.map((v, i) => [4 + i * step, h - 4 - (v / 100) * (h - 8)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const lastPoint = pts[pts.length - 1];
  return `<svg class="spark" width="${w}" height="${h}" aria-hidden="true">
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${lastPoint[0].toFixed(1)}" cy="${lastPoint[1].toFixed(1)}" r="3" fill="var(--accent)"/>
  </svg>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Шапка кабинета: кто вошёл и выход. Вкладок нет — кабинет одностраничный,
// архив и отчёт открываются кнопками внутри.
function renderTop(who, role) {
  // Роль owner шире супервизорской и пригодится, когда появится управление
  // учётными записями. На экране называем её «владелец»: со вторым
  // супервизором в центре два одинаковых ярлыка при разных правах сбивали
  // бы с толку.
  const ROLE_NAME = { supervisor: "супервизор", owner: "владелец", therapist: "терапист" };
  const initials = (who || "").split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return `<div class="topbar">
    <div class="brand">ABA Чек-лист <span>кабинет</span></div>
    <nav class="topnav"><a href="index.html">‹ приложение</a></nav>
    <div class="who">
      <span>${escapeHtml(who || "")}${role ? ` · ${ROLE_NAME[role] || escapeHtml(role)}` : ""}</span>
      <span class="avatar">${initials}</span>
      <button class="linkbtn" type="button" id="logoutBtn">выйти</button>
    </div>
  </div>`;
}

// Большой график по цели: тот же смысл, что в отчёте для родителей —
// проценты по датам, пунктиром критерий освоения (80%) и половина (50%).
// Рисуем руками в SVG: никаких библиотек, страница должна открываться
// где угодно и без интернета сверх нашего сервера.
function chart(points, opts) {
  opts = opts || {};
  const W = 660, H = 230, L = 34, R = 12, T = 14, B = 34;
  if (!points.length) return '<p class="muted">Замеров пока нет.</p>';

  const innerW = W - L - R, innerH = H - T - B;
  const x = (i) => points.length === 1 ? L + innerW / 2 : L + (i * innerW) / (points.length - 1);
  const y = (v) => T + innerH - (v / 100) * innerH;

  const grid = [0, 50, 80, 100].map((v) => `
    <line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}"
          stroke="var(--line)" stroke-width="1" ${v === 80 || v === 50 ? 'stroke-dasharray="4 4"' : ""}/>
    <text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end"
          font-size="11" fill="var(--muted)">${v}</text>`).join("");

  const line = points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.percent).toFixed(1)).join(" ");

  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.percent).toFixed(1)}" r="4.5"
      fill="${p.percent >= MASTERY_MIN ? "var(--mastered)" : "var(--accent)"}"><title>${humanDate(p.date)}: ${p.percent}%</title></circle>`).join("");

  // Подписи дат: если замеров много, показываем каждую вторую-третью,
  // иначе они наезжают друг на друга.
  const stepEvery = Math.ceil(points.length / 8);
  const labels = points.map((p, i) => (i % stepEvery === 0 || i === points.length - 1)
    ? `<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--muted)">${humanDate(p.date)}</text>`
    : "").join("");

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${opts.height || 230}" role="img"
      aria-label="Проценты по датам">
    ${grid}
    <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${labels}
    <text x="${W - R}" y="${(y(80) - 6).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)">критерий освоения</text>
  </svg>`;
}

// Журнал ответов в человеческий вид: «+ + P -» → значки с расшифровкой.
const RESPONSE_NAME = {
  "+": "сам", "P": "подсказка", "-": "ошибка", "/": "частично верно",
  "G": "жестовая", "V": "вербальная", "E": "эхо", "PF": "частичная физическая", "FF": "полная физическая"
};

function responsesHtml(str) {
  const items = String(str || "").trim().split(/\s+/).filter(Boolean);
  if (!items.length) return '<span class="muted">—</span>';
  return items.map((code) => {
    const name = RESPONSE_NAME[code] || code;
    const cls = code === "+" ? "good" : code === "-" ? "alert" : "";
    return `<span class="flag ${cls}" title="${name}">${code === "-" ? "−" : code}</span>`;
  }).join(" ");
}

// ── График по поведениям ──────────────────────────────────────────────────
// Как на вкладке «Частота» в приложении: одна линия на поведение, две шкалы.
// «Раз в час» честно сравнивает наблюдения разной длины, но требует таймера —
// наблюдения без него в эту шкалу не попадают (в приложении так же).
const BEH_COLORS = ["var(--accent)", "var(--low-ink)", "var(--mastered)", "var(--warn)", "var(--prompt-ink)", "var(--danger)"];

// Складываем наблюдения одного дня: два наблюдения по 10 минут — это
// 20 минут, а не среднее двух частот.
function behaviorSeries(rows, mode) {
  const byName = new Map();
  rows.forEach((r) => {
    if (!byName.has(r.behavior)) byName.set(r.behavior, new Map());
    const days = byName.get(r.behavior);
    const cur = days.get(r.date) || { count: 0, minutes: 0 };
    cur.count += Number(r.count) || 0;
    cur.minutes += Number(r.minutes) || 0;
    days.set(r.date, cur);
  });

  return [...byName.entries()].map(([name, days], i) => {
    const points = [...days.entries()]
      .map(([date, v]) => ({
        date: date,
        value: mode === "rate" ? (v.minutes ? (v.count / v.minutes) * 60 : null) : v.count
      }))
      .filter((p) => p.value != null)
      .sort((a, b) => a.date.localeCompare(b.date));
    const total = [...days.values()].reduce((n, v) => n + v.count, 0);
    return { name: name, points: points, total: total, color: BEH_COLORS[i % BEH_COLORS.length] };
  }).filter((s) => s.points.length).sort((a, b) => b.total - a.total);
}

// Много линий на одной сетке. Шкала считается по данным, а не фиксированная:
// у поведения нет «ста процентов».
function multiChart(series, opts) {
  opts = opts || {};
  const W = 760, H = 260, L = 44, R = 14, T = 14, B = 40;
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  if (!dates.length) return '<p class="muted" style="margin:0">Для графика нужно хотя бы одно наблюдение.</p>';
  if (dates.length === 1) {
    return '<p class="muted" style="margin:0">Пока одно наблюдение — линию строить не из чего. График появится со второго.</p>';
  }

  const maxValue = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value)));
  const top = niceTop(maxValue);
  const innerW = W - L - R, innerH = H - T - B;
  const x = (date) => L + (dates.indexOf(date) * innerW) / (dates.length - 1);
  const y = (v) => T + innerH - (v / top) * innerH;

  const ticks = [0, top / 2, top].map((v) => `
    <line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>
    <text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)">${round1(v)}</text>`).join("");

  const lines = series.map((s) => {
    const d = s.points.map((p, i) => (i ? "L" : "M") + x(p.date).toFixed(1) + " " + y(p.value).toFixed(1)).join(" ");
    const dots = s.points.map((p) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3.5" fill="${s.color}"><title>${escapeHtml(s.name)} · ${humanDate(p.date)}: ${round1(p.value)}</title></circle>`).join("");
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join("");

  const stepEvery = Math.ceil(dates.length / 8);
  const labels = dates.map((d, i) => (i % stepEvery === 0 || i === dates.length - 1)
    ? `<text x="${x(d).toFixed(1)}" y="${H - 12}" text-anchor="middle" font-size="11" fill="var(--muted)">${humanDate(d)}</text>` : "").join("");

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${opts.height || 260}" role="img" aria-label="Частота поведения по датам">
    ${ticks}${lines}${labels}
    <text x="${L}" y="${T - 2}" font-size="11" fill="var(--muted)">${opts.unit || ""}</text>
  </svg>`;
}

function niceTop(v) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  for (const s of steps) if (v <= s) return s;
  return Math.ceil(v / 1000) * 1000;
}

function round1(v) {
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1);
}

// ── Общая картина по ребёнку ─────────────────────────────────────────────
// Живёт здесь, а не в кабинете: ту же строку показывает отчёт для родителей,
// и считаться она обязана одинаково (27.08.2026).
const LOW_PERCENT = 30;      // «низкий замер»
const LOW_IN_A_ROW = 3;      // сколько таких подряд, чтобы сказать вслух
const FEW_TRIALS = 2;        // проб за занятие, при которых процент бинарный

function trialsOf(point) {
  return String(point.responses || "").trim().split(/\s+/).filter(Boolean).length;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Общая картина по ребёнку. Складывается из трёх вещей: что с целями,
// что с поведением и насколько данным вообще можно верить. Последнее —
// не придирка: на одиночных пробах процент бинарный, и «100%» там значит
// «один раз получилось», а не «освоено».
function summaryLine(c, now) {
  // Общая картина — по целям в работе: архив её больше не характеризует.
  const goals = c.active || c.goals;
  const mastered = goals.filter((g) => g.status === "mastered").length;
  const growth = goals.filter((g) => g.status === "growth").length;
  const plateau = goals.filter((g) => g.status === "plateau").length;
  const low = goals.filter((g) => {
    const v = g.points.map((p) => p.percent);
    return v.length >= LOW_IN_A_ROW && v.slice(-LOW_IN_A_ROW).every((x) => x <= LOW_PERCENT);
  }).length;

  // ── Цели ──
  let goalsText;
  if (!goals.length) goalsText = "данных по целям ещё нет";
  else if (mastered + growth && !plateau && !low) goalsText = `движение есть: ${mastered + growth} из ${goals.length} ${plural(goals.length, "цели", "целей", "целей")} растут или достигли критерия`;
  else if (plateau + low) goalsText = `застой: ${plateau + low} из ${goals.length} ${plural(goals.length, "цели", "целей", "целей")} стоят на месте или держатся внизу`;
  else goalsText = `${goals.length} ${plural(goals.length, "цель в работе", "цели в работе", "целей в работе")}, резких изменений нет`;

  // ── Поведение ──
  const byDay = new Map();
  c.behavior.forEach((b) => byDay.set(b.date, (byDay.get(b.date) || 0) + b.count));
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let behText, behBad = false;
  if (!days.length) behText = "подсчётов поведения не было";
  else if (days.length < 3) behText = `наблюдений за поведением пока ${days.length} — сравнивать не с чем`;
  else {
    const last = days[days.length - 1][1];
    const earlier = days.slice(0, -1).map((d) => d[1]);
    const mean = earlier.reduce((a, b) => a + b, 0) / earlier.length;
    if (last >= 3 && last > mean * 1.5) { behText = `поведение стало чаще: ${last} против ${round1(mean)} в среднем раньше`; behBad = true; }
    else if (mean >= 3 && last < mean * 0.6) behText = `поведение стало реже: ${last} против ${round1(mean)} в среднем раньше`;
    else behText = "по поведению без заметных изменений";
  }

  // ── Эпизоды ABC ──
  // Считаем отдельно от частоты и НЕ складываем: одно и то же поведение
  // может попасть и в счётчик наблюдения, и в эпизод. Это два разных
  // взгляда, и супервизору нужны оба.
  const ABC_WINDOW = 14;
  const inWindow = (from, to) => c.abc.filter((a) => {
    const d = daysBetween(a.date, now);
    return d >= from && d < to;
  }).length;
  const abcLast = inWindow(0, ABC_WINDOW);
  const abcPrev = inWindow(ABC_WINDOW, ABC_WINDOW * 2);

  // «Стало чаще» имеет смысл, только если прошлое окно вообще существовало.
  // У ребёнка, которого начали вести две недели назад, «3 против 0» значит
  // «раньше не записывали», а не «поведение участилось» — и такой ярлык
  // отправил бы супервизора разбираться на пустом месте.
  const allDates = [
    ...c.goals.flatMap((g) => g.points.map((p) => p.date)),
    ...c.behavior.map((b) => b.date),
    ...c.abc.map((a) => a.date)
  ].filter(Boolean).sort();
  const historyDays = allDates.length ? daysBetween(allDates[0], now) : 0;
  const canCompare = historyDays >= ABC_WINDOW * 2;

  let abcText, abcBad = false;
  if (!c.abc.length) {
    abcText = "эпизодов ABC не записывали";
  } else if (c.abc.length < 3) {
    abcText = `${c.abc.length} ${plural(c.abc.length, "эпизод", "эпизода", "эпизодов")} ABC, последний ${humanDate(c.abc[0].date)}`;
  } else if (!canCompare) {
    abcText = `${c.abc.length} ${plural(c.abc.length, "эпизод", "эпизода", "эпизодов")} ABC за всё время наблюдения`;
  } else if (abcLast >= 3 && abcLast > abcPrev) {
    abcText = `эпизоды ABC участились: ${abcLast} за две недели против ${abcPrev} до этого`;
    abcBad = true;
  } else if (abcPrev && abcLast < abcPrev) {
    abcText = `эпизоды ABC стали реже: ${abcLast} за две недели против ${abcPrev} до этого`;
  } else {
    abcText = `эпизодов ABC за две недели: ${abcLast}`;
  }

  // ── Можно ли верить цифрам ──
  const caveats = [];
  if (c.days && c.days < 3) caveats.push(`занятий записано ${c.days}`);
  const measured = goals.reduce((n, g) => n + g.points.length, 0);
  const single = goals.reduce((n, g) => n + g.points.filter((p) => trialsOf(p) <= FEW_TRIALS).length, 0);
  if (measured && single / measured >= 0.5) {
    caveats.push(`в ${Math.round((single / measured) * 100)}% замеров одна-две пробы`);
  }

  // ── Ярлык ──
  let tone = "", label = "в целом ровно";
  if (c.silentDays != null && c.silentDays >= SILENT_DAYS) { tone = "alert"; label = "данные не поступают"; }
  else if (plateau + low || behBad || abcBad) { tone = "warn"; label = "есть на что посмотреть"; }
  else if (mastered + growth) { tone = "good"; label = "идёт хорошо"; }
  if (!goals.length && !c.behavior.length && !c.abc.length) { tone = ""; label = "данных пока нет"; }

  if (!goals.length && !c.behavior.length && !c.abc.length) {
    return `<p class="verdict"><span class="flag">данных пока нет</span> По этому ребёнку не записано ни одного занятия, ни наблюдения, ни эпизода.</p>`;
  }

  return `<p class="verdict"><span class="flag ${tone}">${label}</span>
    ${escapeHtml(capitalize(goalsText))}; ${escapeHtml(behText)}; ${escapeHtml(abcText)}.
    ${caveats.length ? `<span class="muted">Судить осторожно: ${escapeHtml(caveats.join(", "))}.</span>` : ""}</p>`;
}
