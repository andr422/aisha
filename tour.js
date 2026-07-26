// Подсказки на экране («тур») — общий модуль для всех страниц.
// Подключение: <script src="tour.js"></script> ПОСЛЕ tabbar.js
// (таб-бар должен уже существовать, чтобы его можно было подсветить).
//
// Как работает: экран затемняется, нужный элемент остаётся светлым
// («прожектор» — прозрачное окно с огромной тенью вокруг), рядом карточка
// с пояснением и кнопками. Шаги свои для каждой страницы.
//
// Запуск: автоматически при ПЕРВОМ открытии страницы (флаг в localStorage)
// и вручную — пунктом меню «💡 Подсказки» (кнопка с id="tourBtn").
(function () {
  const SEEN_KEY = "aba_tour_seen"; // { "final": true, "abc": true, ... }

  // Текущая страница по имени файла.
  function pageId() {
    const file = (location.pathname.split("/").pop() || "").toLowerCase();
    if (file.startsWith("final")) return "final";
    if (file.startsWith("summary")) return "summary";
    if (file.startsWith("abc")) return "abc";
    if (file.startsWith("frequency")) return "frequency";
    return "";
  }

  // Первый ВИДИМЫЙ элемент по селектору (на «Сборе» часть блоков скрыта CSS).
  // Видимость проверяем по наличию боксов отрисовки, а не по ширине: у
  // блочных элементов ширина может быть 0 в момент перестроения раскладки.
  function findVisible(sel) {
    const list = document.querySelectorAll(sel);
    for (const el of list) {
      if (el.getClientRects().length && getComputedStyle(el).visibility !== "hidden") {
        return el;
      }
    }
    return null;
  }

  const openMenu = () => {
    const drop = document.getElementById("menuDrop");
    if (drop && drop.hidden) document.getElementById("menuBtn").click();
  };
  const closeMenu = () => {
    const drop = document.getElementById("menuDrop");
    if (drop && !drop.hidden) document.getElementById("menuBtn").click();
  };

  // Сценарии. sel — что подсветить, before/after — подготовка шага.
  // Шаг без найденного элемента просто пропускается.
  const SCRIPTS = {
    final: [
      {
        sel: "#activeChild",
        title: "Чьё занятие",
        text: "Здесь всегда написано, с каким ребёнком вы работаете. Взяли планшет — сначала посмотрите сюда."
      },
      {
        sel: ".block .btn-set",
        title: "Три кнопки на каждую пробу",
        text: "Слева «−» — ошибка или нет реакции. В центре «P» — была помощь. Справа «+» — сделал сам. Нажимайте сразу после каждой пробы."
      },
      {
        sel: ".block .btn-prompt",
        title: "Уточнить тип помощи",
        text: "Нажмите и <b>удерживайте</b> «P» — появится список: жестовая, вербальная, эхо, физическая. Короткий тап — просто «была помощь»."
      },
      {
        sel: ".block .percent",
        title: "Процент считается сам",
        text: "Это доля самостоятельных ответов. Рядом — график последних занятий. Три занятия подряд ≥80% — цель освоена."
      },
      {
        sel: "#undoBtn",
        title: "Ошиблись — не страшно",
        text: "Кнопка убирает последнее нажатие. Можно работать быстро и не бояться промахнуться."
      },
      {
        sel: "#sendBtn",
        title: "Главное в конце занятия",
        text: "Нажмите «Отправить данные» — только тогда занятие уйдёт в таблицу. Без интернета данные подождут и уйдут сами."
      },
      {
        sel: "#menuDrop",
        title: "Здесь остальное",
        text: "Заметка о занятии, история, графики и готовый отчёт для родителей.",
        before: openMenu,
        after: closeMenu
      },
      {
        sel: ".app-tabbar",
        title: "Другие чек-листы",
        text: "ABC — эпизод поведения, «Частота» — счётчик, «Таймер» — для ребёнка, «Настройка» — протоколы и цели."
      }
    ],

    summary: [
      {
        sel: ".child-row",
        title: "Профиль ребёнка",
        text: "＋ добавить, ✎ переименовать, 🗑 удалить. В списке — переключение между детьми.<br><b>Только инициалы или ID</b>, полное имя вводить нельзя."
      },
      {
        sel: "#addProtocolBtn",
        title: "Добавить протокол",
        text: "Протокол — это направление работы: «Имитация», «Матчинг», «Речь». Название станет листом в таблице ребёнка."
      },
      {
        sel: ".add-goal",
        title: "Добавить цель",
        text: "Формулируйте наблюдаемо: не «моторика», а «хлопает в ладоши по образцу». Целей может быть сколько нужно."
      },
      {
        sel: ".goal-group .mastery-date",
        title: "Дата освоения",
        text: "Ставится автоматически, когда цель освоена (три занятия подряд ≥80%). Можно вписать и вручную — приложение не перезапишет."
      },
      {
        sel: "#menuDrop",
        title: "Памятка и обслуживание",
        text: "Здесь тренажёр для новичков, шаблоны протоколов, перенос ребёнка и резервная копия планшета.",
        before: openMenu,
        after: closeMenu
      }
    ],

    abc: [
      {
        sel: "#chipsB",
        title: "Что случилось (B)",
        text: "Отметьте поведение — <b>обязательное поле</b>. Можно выбрать несколько сразу, например «Крик» и «Падение на пол»."
      },
      {
        sel: "#chipsA",
        title: "Что было до (A)",
        text: "Что предшествовало: предъявили требование, отказали, переход между активностями. Тоже можно несколько."
      },
      {
        sel: "#chipsC",
        title: "Что было после (C)",
        text: "Как отреагировали взрослые: проигнорировали, сняли требование, дали желаемое. Именно это часто и поддерживает поведение."
      },
      {
        sel: "#saveBtn",
        title: "Записать эпизод",
        text: "Запись сразу уходит в таблицу ребёнка. Свои варианты в списках настраиваются в меню «⋮ → Списки»."
      }
    ],

    frequency: [
      {
        sel: "#obsBtn",
        title: "Сначала запустите наблюдение",
        text: "Пойдёт таймер — и приложение посчитает, сколько раз в час случилось поведение. Без таймера будет только «сколько раз»."
      },
      {
        sel: ".beh-plus",
        title: "Считайте нажатием",
        text: "Каждый раз, когда поведение случилось, жмите «+». Соседняя «−» уберёт лишнее нажатие."
      },
      {
        sel: "#saveBtn",
        title: "Завершить и записать",
        text: "Наблюдение попадёт в журнал и в таблицу ребёнка, счётчики обнулятся."
      }
    ]
  };

  const CSS = `
    #aba-tour-hole {
      position: fixed;
      border-radius: 12px;
      box-shadow: 0 0 0 9999px rgba(15, 18, 22, 0.72);
      border: 2px solid #ffffff;
      z-index: 1400;
      pointer-events: none;
      transition: all 0.25s ease;
    }
    #aba-tour-card {
      position: fixed;
      z-index: 1401;
      background: #ffffff;
      color: #1f2933;
      border-radius: 14px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
      padding: 14px 16px;
      width: min(340px, calc(100vw - 24px));
      font-family: "Onest", -apple-system, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
    }
    #aba-tour-card h4 {
      margin: 0 0 6px;
      font-family: "Unbounded", -apple-system, sans-serif;
      font-size: 16px;
      font-weight: 800;
    }
    #aba-tour-card p { margin: 0 0 12px; font-size: 14px; }
    .aba-tour-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .aba-tour-count { font-size: 12px; color: #8a9099; }
    .aba-tour-btns { display: flex; gap: 8px; }
    .aba-tour-btns button {
      border: none;
      border-radius: 9px;
      padding: 9px 14px;
      font-size: 14px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      touch-action: manipulation;
    }
    .aba-tour-skip { background: #eef1f4; color: #596270; }
    .aba-tour-next { background: #0e7490; color: #fff; }
  `;

  let steps = [];
  let idx = 0;
  let hole = null;
  let card = null;
  let currentAfter = null;

  function seen() {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function markSeen(page) {
    const s = seen();
    s[page] = true;
    localStorage.setItem(SEEN_KEY, JSON.stringify(s));
  }

  function build() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    hole = document.createElement("div");
    hole.id = "aba-tour-hole";
    hole.hidden = true;

    card = document.createElement("div");
    card.id = "aba-tour-card";
    card.hidden = true;
    card.innerHTML = `
      <h4></h4>
      <p></p>
      <div class="aba-tour-row">
        <span class="aba-tour-count"></span>
        <span class="aba-tour-btns">
          <button type="button" class="aba-tour-skip">Закрыть</button>
          <button type="button" class="aba-tour-next">Дальше</button>
        </span>
      </div>`;

    document.body.append(hole, card);
    card.querySelector(".aba-tour-skip").onclick = stop;
    card.querySelector(".aba-tour-next").onclick = next;

    // Кнопка в меню страницы (если она там есть).
    const btn = document.getElementById("tourBtn");
    if (btn) btn.onclick = () => setTimeout(start, 150); // дать меню закрыться

    // Первое открытие страницы — показываем подсказки сами.
    const page = pageId();
    if (page && SCRIPTS[page] && !seen()[page]) {
      setTimeout(() => {
        if (SCRIPTS[page].some((s) => findVisible(s.sel))) start();
      }, 900);
    }
  }

  function start() {
    const page = pageId();
    steps = SCRIPTS[page] || [];
    if (!steps.length) return;
    idx = 0;
    markSeen(page);
    show();
  }

  function show() {
    // Пропускаем шаги, элементов которых нет на этой странице.
    while (idx < steps.length) {
      const step = steps[idx];
      if (step.before) step.before();
      const el = findVisible(step.sel);
      if (el) {
        render(step, el);
        return;
      }
      if (step.after) step.after();
      idx += 1;
    }
    stop();
  }

  function render(step, el) {
    currentAfter = step.after || null;
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    // Ждём окончания прокрутки, иначе подсветим старое место.
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      const pad = 6;
      hole.hidden = false;
      hole.style.left = `${Math.max(4, r.left - pad)}px`;
      hole.style.top = `${Math.max(4, r.top - pad)}px`;
      hole.style.width = `${r.width + pad * 2}px`;
      hole.style.height = `${r.height + pad * 2}px`;

      card.hidden = false;
      card.querySelector("h4").textContent = step.title;
      card.querySelector("p").innerHTML = step.text;
      card.querySelector(".aba-tour-count").textContent = `${idx + 1} из ${steps.length}`;
      card.querySelector(".aba-tour-next").textContent =
        idx + 1 >= steps.length ? "Понятно" : "Дальше";

      // Карточка под подсветкой; не влезает снизу — ставим сверху.
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      let top = r.bottom + 14;
      if (top + ch > window.innerHeight - 8) top = Math.max(8, r.top - ch - 14);
      let left = r.left + r.width / 2 - cw / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - cw - 8));
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
    }, 320);
  }

  function next() {
    if (currentAfter) {
      currentAfter();
      currentAfter = null;
    }
    idx += 1;
    if (idx >= steps.length) {
      stop();
      return;
    }
    show();
  }

  function stop() {
    if (currentAfter) {
      currentAfter();
      currentAfter = null;
    }
    hole.hidden = true;
    card.hidden = true;
  }

  // Экран мог повернуться или прокрутиться — прячем подсветку, чтобы она
  // не «висела» в стороне от элемента.
  window.addEventListener("resize", () => {
    if (!card.hidden) show();
  });

  window.abaTour = { start };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
