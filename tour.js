// Подсказки на экране («тур») — общий модуль для всех страниц.
// Подключение: <script src="tour.js"></script> ПОСЛЕ tabbar.js
// (таб-бар должен уже существовать, чтобы его можно было подсветить).
//
// Как работает: экран затемняется, нужный элемент остаётся светлым
// («прожектор» — прозрачное окно с огромной тенью вокруг), рядом карточка
// с пояснением и кнопками. Шаги свои для каждой страницы.
//
// Запуск: автоматически при ПЕРВОМ открытии страницы и ещё раз, когда
// подсказки этой страницы обновились (см. VERSIONS ниже); вручную — пунктом
// меню «💡 Подсказки» (кнопка с id="tourBtn").
(function () {
  // { "final": 2, "abc": 1, ... } — какую ВЕРСИЮ подсказок здесь уже видели.
  // Старый формат (true) считаем первой версией.
  const SEEN_KEY = "aba_tour_seen";

  // ВАЖНО: меняете шаги страницы — поднимите её номер здесь. Тогда подсказки
  // один раз покажутся заново всем, кто их уже видел (иначе новое пройдёт
  // мимо тех, у кого приложение стоит давно). Номер чужой страницы не трогать —
  // иначе людям заново покажут то, что не менялось.
  const VERSIONS = {
    final: 5,     // 5 — две кнопки: «P/−» и «+», ошибка в списке подсказок
    summary: 2,   // 2 — шаги-мастера: ждут реального нажатия на пустом планшете
    abc: 2, // 2 — порядок A → B → C, поведение выделено
    frequency: 2 // 2 — добавлен шаг про график по журналу наблюдений
  };

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

  // Меню «⋮» живёт в шапке страницы, а его выпадашка — position: fixed с
  // координатами от кнопки. Если страница прокручена вниз (например, после
  // шага про блок «Генерализация»), кнопка уходит выше экрана, выпадашка
  // получает отрицательный top и открывается ЗА экраном — вместе с карточкой
  // подсказки. Поэтому перед открытием возвращаемся наверх.
  const openMenu = () => {
    const drop = document.getElementById("menuDrop");
    if (!drop) return;
    window.scrollTo(0, 0);
    if (drop.hidden) document.getElementById("menuBtn").click();
  };
  const closeMenu = () => {
    const drop = document.getElementById("menuDrop");
    if (drop && !drop.hidden) document.getElementById("menuBtn").click();
  };

  // Сценарии. Поля шага:
  //   sel    — что подсветить;
  //   until  — селектор «результата»: если такого элемента ещё НЕТ, шаг ждёт,
  //            пока пользователь сам нажмёт подсвеченную кнопку (режим мастера
  //            для пустого планшета). Если результат уже есть — обычный шаг;
  //   doText — строчка-задание, показывается только в режиме ожидания;
  //   empty  — { title, text }: что показать, если элемента на странице нет
  //            (карточка по центру, без подсветки). Без empty шаг пропускается;
  //   before/after — подготовка шага (например, открыть меню).
  const SCRIPTS = {
    final: [
      {
        sel: "#activeChild",
        title: "Чьё занятие",
        text: "Здесь всегда написано, с каким ребёнком вы работаете. Взяли планшет — сначала посмотрите сюда."
      },
      {
        sel: ".proto-toggle",
        title: "Протоколы свёрнуты",
        text: "Каждый протокол — одна строка: название и сколько в нём целей. <b>Нажмите на название</b> — раскроются цели с кнопками, нажмёте ещё раз — свернётся. Протокол, по которому уже собирали данные, раскроется сам.",
        // Если всё уже раскрыто, шаг просто рассказывает; если свёрнуто —
        // ждём настоящего нажатия, так понятнее.
        until: ".protocol-container:not(.collapsed)",
        doText: "Нажмите на название протокола — и продолжим."
      },
      {
        sel: ".select-goals",
        title: "Если сегодня не все цели",
        text: "Нажмите «Выбрать цели» и отметьте те, с которыми работаете сегодня. Остальные просто спрячутся с экрана — их история и данные сохранятся.",
        before: () => {
          const collapsed = document.querySelector(".protocol-container.collapsed .proto-toggle");
          if (collapsed) collapsed.click();
        }
      },
      {
        sel: ".block .btn-set",
        title: "Две кнопки на каждую пробу",
        // Протоколы на «Сборе» свёрнуты — раскрываем первый, иначе кнопок
        // на экране нет и шаг подменился бы заглушкой «целей пока нет».
        before: () => {
          const collapsed = document.querySelector(".protocol-container.collapsed .proto-toggle");
          if (collapsed) collapsed.click();
        },
        text: "Справа большая «+» — сделал сам. Слева «P/−» — была помощь; ошибку или отсутствие реакции выбирают в списке под долгим нажатием этой же кнопки. Нажимайте сразу после каждой пробы.",
        // На новом планшете целей ещё нет — объясняем, откуда они возьмутся.
        empty: {
          title: "Здесь появятся кнопки оценки",
          text: "Пока не заведено ни одной цели, оценивать нечего. Откройте <b>«Настройка»</b> — последняя вкладка внизу — и добавьте протокол и цели. После этого на этой странице для каждой цели появится строка с кнопками <b>P/−</b> и <b>+</b> и процентом самостоятельных ответов."
        }
      },
      {
        sel: ".block .btn-prompt",
        title: "Уточнить тип помощи",
        text: "Нажмите и <b>удерживайте</b> «P/−» — появится список: жестовая, вербальная, эхо, физическая, «/» — частично верный ответ, а внизу «Ошибка — не выполнил». Короткий тап — просто «была помощь»."
      },
      {
        sel: ".block .percent",
        title: "Процент считается сам",
        text: "Это доля самостоятельных ответов за сегодня — справа от названия цели. Три занятия подряд ≥80% — цель освоена."
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
        // Появляется только когда есть освоенные цели — иначе шаг пропускается.
        sel: "#genBox",
        title: "Освоенные цели уходят сюда",
        text: "Когда цель освоена, она пропадает из списка выше и появляется здесь. Осталось проверить навык в девяти условиях: три материала, три места, три человека. Нажмите на условие, когда проба прошла."
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
        text: "Протокол — это направление работы: «Имитация», «Матчинг», «Речь». Название станет листом в таблице ребёнка.",
        until: ".protocol-container",
        doText: "Нажмите подсвеченную кнопку — и продолжим."
      },
      {
        sel: ".protocol-title",
        title: "Название протокола",
        text: "Впишите направление работы одним-двумя словами. Это же название вы увидите на странице «Сбор» и листом в таблице ребёнка."
      },
      {
        sel: ".add-goal",
        title: "Добавить цель",
        text: "Цель — конкретный навык внутри протокола. Их может быть сколько нужно.",
        until: ".goal-group",
        doText: "Нажмите подсвеченную кнопку — и продолжим."
      },
      {
        sel: ".goal-input",
        title: "Как формулировать цель",
        text: "Наблюдаемо, чтобы любой терапист понял одинаково: не «моторика», а «хлопает в ладоши по образцу». Цель должна быть видна со стороны."
      },
      {
        sel: ".goal-group .mastery-date",
        title: "Дата освоения",
        text: "Ставится автоматически, когда цель освоена (три занятия подряд ≥80%). Можно вписать и вручную — приложение не перезапишет."
      },
      {
        sel: "#menuDrop",
        title: "Памятка и обслуживание",
        text: "Здесь памятка, шаблоны протоколов, перенос ребёнка и резервная копия планшета.",
        before: openMenu,
        after: closeMenu
      }
    ],

    abc: [
      {
        sel: "#chipsA",
        title: "Что было до (A)",
        text: "Что предшествовало: предъявили требование, отказали, переход между активностями. Можно выбрать несколько."
      },
      {
        sel: "#chipsB",
        title: "Что случилось (B)",
        text: "Отметьте поведение — <b>единственное обязательное поле</b>. Можно выбрать несколько сразу, например «Крик» и «Падение на пол»."
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
      },
      {
        sel: "#menuDrop",
        title: "График по наблюдениям",
        text: "Меню «⋮» → «📊 График»: линия на каждое поведение, видно, растёт оно или уходит. Нужно хотя бы два наблюдения.",
        before: openMenu,
        after: closeMenu
      }
    ]
  };

  const CSS = `
    #aba-tour-hole {
      position: fixed;
      border-radius: 12px;
      box-shadow: 0 0 0 9999px rgba(15, 18, 22, 0.72);
      border: 2px solid var(--card);
      z-index: 1400;
      pointer-events: none;
      transition: all 0.25s ease;
    }
    #aba-tour-card {
      position: fixed;
      z-index: 1401;
      background: var(--card);
      color: var(--text);
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
    /* Строка-задание в режиме ожидания: «нажмите подсвеченную кнопку». */
    #aba-tour-card .aba-tour-do {
      margin: -4px 0 12px;
      padding: 8px 10px;
      background: var(--accent-soft);
      border-left: 3px solid var(--accent);
      border-radius: 0 8px 8px 0;
      font-size: 14px;
      font-weight: 700;
      color: var(--accent);
    }
    #aba-tour-card .aba-tour-do[hidden] { display: none; }
    /* Показывается один раз, когда подсказки страницы обновились: человек уже
       знает приложение и должен понять, почему они всплыли снова. */
    #aba-tour-card .aba-tour-new {
      margin: -2px 0 8px;
      font-size: 13px;
      font-weight: 700;
      color: var(--prompt-ink);
    }
    #aba-tour-card .aba-tour-new[hidden] { display: none; }
    .aba-tour-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .aba-tour-count { font-size: 12px; color: var(--muted); }
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
    .aba-tour-skip { background: var(--soft); color: var(--soft-ink); }
    .aba-tour-next { background: var(--accent); color: var(--accent-ink); }
  `;

  let steps = [];
  let idx = 0;
  let hole = null;
  let card = null;
  let currentAfter = null;
  let stopWatching = null; // снять слежение за результатом шага
  let isUpdate = false;    // тур всплыл из-за обновления, а не в первый раз

  // Ждём, пока на странице появится результат шага (нажали кнопку — возник
  // блок протокола или цели). Следим и мутациями, и таймером: разметку рисуют
  // разными путями, а MutationObserver молчит, если элемент лишь показали.
  function watchFor(sel) {
    unwatch();
    const check = () => {
      if (!findVisible(sel)) return;
      unwatch();
      next();
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = setInterval(check, 400);
    stopWatching = () => {
      observer.disconnect();
      clearInterval(timer);
    };
  }

  function unwatch() {
    if (stopWatching) {
      stopWatching();
      stopWatching = null;
    }
  }

  function seen() {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  // Какую версию подсказок на этой странице уже видели.
  // 0 — не видели вовсе; true из старого формата — первая версия.
  function seenVersion(page) {
    const value = seen()[page];
    if (value === true) return 1;
    return Number(value) || 0;
  }

  function markSeen(page) {
    const s = seen();
    s[page] = VERSIONS[page] || 1;
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
      <p class="aba-tour-new" hidden>Подсказки обновились — появилось новое.</p>
      <p class="aba-tour-text"></p>
      <p class="aba-tour-do" hidden></p>
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
    if (btn) {
      btn.onclick = () => {
        isUpdate = false; // запустили руками — про обновление сообщать незачем
        setTimeout(start, 150); // дать меню закрыться
      };
    }

    // Показ руководству (страницы demo/) открывает приложение внутри рамки
    // телефона с адресом ...?notour=1 — там подсказки только мешают, а
    // отмечать их «уже виденными» нельзя: планшет тераписта общий с показом.
    if (location.search.indexOf("notour=1") !== -1) {
      return;
    }

    // Показываем сами: при первом открытии страницы и один раз после того,
    // как подсказки этой страницы обновились.
    const page = pageId();
    if (page && SCRIPTS[page] && seenVersion(page) < (VERSIONS[page] || 1)) {
      // Человек уже видел прошлую версию — предупреждаем, почему всплыло снова.
      isUpdate = seenVersion(page) > 0;
      setTimeout(() => {
        // Пустой планшет — как раз тот случай, когда подсказки нужнее всего:
        // запускаем и если показать пока нечего, кроме заглушек и заданий.
        const worth = SCRIPTS[page].some(
          (s) => s.empty || s.until || findVisible(s.sel)
        );
        if (worth) start();
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
    unwatch();
    // Шаг открываем следующим тактом: клик по «Дальше» ещё всплывает к
    // document, а там обработчик «клик мимо меню» закрыл бы меню, которое шаг
    // только что открыл (before: openMenu).
    setTimeout(openStep, 0);
  }

  function openStep() {
    while (idx < steps.length) {
      const step = steps[idx];
      if (step.before) step.before();
      const el = findVisible(step.sel);
      if (el) {
        render(step, el);
        return;
      }
      // Элемента нет. Есть запасной текст — показываем карточку по центру,
      // иначе шаг пропускаем.
      if (step.empty) {
        renderEmpty(step);
        return;
      }
      if (step.after) step.after();
      idx += 1;
    }
    stop();
  }

  // Общая часть карточки: заголовок, текст, счётчик, подписи кнопок.
  function fillCard(title, text, doText) {
    card.hidden = false;
    // Пометка об обновлении — только на первой карточке прохода.
    card.querySelector(".aba-tour-new").hidden = !(isUpdate && idx === 0);
    card.querySelector("h4").textContent = title;
    // По классу, а не по первому <p>: выше него лежит пометка об обновлении.
    card.querySelector(".aba-tour-text").innerHTML = text;
    const doLine = card.querySelector(".aba-tour-do");
    doLine.hidden = !doText;
    if (doText) doLine.textContent = doText;
    card.querySelector(".aba-tour-count").textContent = `${idx + 1} из ${steps.length}`;
    // В режиме ожидания «Дальше» превращается в «Пропустить»: терапист может
    // не захотеть заводить данные прямо сейчас.
    card.querySelector(".aba-tour-next").textContent = doText
      ? "Пропустить"
      : idx + 1 >= steps.length
        ? "Понятно"
        : "Дальше";
  }

  // Шаг без своего элемента: карточка по центру экрана, подсвечивать нечего.
  function renderEmpty(step) {
    currentAfter = step.after || null;
    hole.hidden = true;
    fillCard(step.empty.title, step.empty.text, "");
    // Тот же запас по размерам экрана, что и в render(): при innerHeight = 0
    // карточка иначе прижалась бы к верхнему краю и могла уйти за него.
    const vw = window.innerWidth || document.documentElement.clientWidth || 360;
    const vh = window.innerHeight || document.documentElement.clientHeight || 640;
    card.style.top = `${Math.max(8, (vh - card.offsetHeight) / 2)}px`;
    card.style.left = `${Math.max(8, (vw - card.offsetWidth) / 2)}px`;
  }

  function render(step, el) {
    currentAfter = step.after || null;
    // Результата шага ещё нет — значит ведём за руку и ждём реального нажатия.
    const waiting = Boolean(step.until) && !findVisible(step.until);
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

      fillCard(step.title, step.text, waiting ? step.doText : "");
      if (waiting) watchFor(step.until);

      // Карточка под подсветкой; не влезает снизу — ставим сверху.
      // Размеры экрана берём с запасом: в некоторых обёртках innerHeight = 0,
      // и без фолбэка карточка уехала бы в отрицательные координаты.
      const vw = window.innerWidth || document.documentElement.clientWidth || 360;
      const vh = window.innerHeight || document.documentElement.clientHeight || 640;
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      let top = r.bottom + 14;
      if (top + ch > vh - 8) top = r.top - ch - 14;
      // ГЛАВНОЕ: карточка обязана остаться на экране. Если подсвечиваемый
      // элемент сам за экраном (или он выше экрана целиком), обе прикидки
      // дают координаты вне видимой области — тогда терапист видит затемнение
      // без карточки и не может её закрыть.
      top = Math.max(8, Math.min(top, vh - ch - 8));
      let left = r.left + r.width / 2 - cw / 2;
      left = Math.max(8, Math.min(left, vw - cw - 8));
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
    }, 320);
  }

  function next() {
    unwatch();
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
    unwatch();
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
