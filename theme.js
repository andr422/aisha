// Оформление интерфейса: выбор темы, общий для всех страниц.
//
// Тема — это набор переменных в theme.css; здесь только выбор и хранение.
// Настройка НЕ относится к данным ребёнка: она про планшет и того, кто им
// пользуется, поэтому живёт в отдельном ключе и не переносится вместе с
// профилем ребёнка.
//
// Файл подключается в <head> ДО стилей страницы и сам сразу выставляет
// data-theme на <html> — иначе при загрузке моргнёт светлым.

(function () {
  const KEY = "aba_theme";

  const THEMES = [
    {
      id: "",
      name: "Обычная",
      note: "Как было: тёплый фон, скруглённые карточки",
      swatch: ["#f3f2ed", "#0e7490", "#dff0f3"]
    },
    {
      id: "soft",
      name: "Пастельная",
      note: "Как в современных приложениях: системный шрифт, мягкий синий, пастельные кнопки",
      swatch: ["#f2f3f7", "#0a84ff", "#e3f6ea"]
    },
    {
      id: "hand",
      name: "Как от руки",
      note: "Тетрадный лист и синяя ручка: рукописный весь текст, включая цифры",
      swatch: ["#fbf7ec", "#3557a8", "#e2f0d9"]
    },
    {
      id: "mono",
      name: "Монохром",
      note: "Совсем без цвета: кнопки различаются светлотой — белая, серая, чёрная",
      swatch: ["#ffffff", "#111111", "#dcdcdc"]
    },
    {
      id: "dark",
      name: "Тёмная",
      note: "Для вечерних занятий и тёмных кабинетов",
      swatch: ["#14181b", "#4fb3c9", "#1b3a40"]
    },
    {
      id: "contrast",
      name: "Контрастная",
      note: "Солнце на экране, слабое зрение: жирные линии, чистый чёрный",
      swatch: ["#ffffff", "#00527a", "#cfeadf"]
    }
  ];

  function get() {
    try {
      const saved = localStorage.getItem(KEY) || "";
      return THEMES.some((t) => t.id === saved) ? saved : "";
    } catch {
      return "";
    }
  }

  function apply(id) {
    const root = document.documentElement;
    if (id) root.setAttribute("data-theme", id);
    else root.removeAttribute("data-theme");
  }

  function set(id) {
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      // приватный режим — тема продержится до перезагрузки, и ладно
    }
    apply(id);
  }

  apply(get());

  // Рисует переключатель в переданном контейнере. Вызывается со страницы
  // настройки; остальным страницам достаточно применённой темы.
  function renderPicker(box) {
    if (!box) return;
    box.innerHTML = "";
    const current = get();
    THEMES.forEach((theme) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-btn" + (theme.id === current ? " on" : "");
      btn.setAttribute("aria-pressed", theme.id === current ? "true" : "false");

      const dots = document.createElement("span");
      dots.className = "theme-dots";
      theme.swatch.forEach((color) => {
        const dot = document.createElement("span");
        dot.style.background = color;
        dots.appendChild(dot);
      });

      const text = document.createElement("span");
      text.className = "theme-text";
      const name = document.createElement("b");
      name.textContent = theme.name;
      const note = document.createElement("span");
      note.textContent = theme.note;
      text.append(name, note);

      btn.append(dots, text);
      btn.onclick = () => {
        set(theme.id);
        renderPicker(box);
      };
      box.appendChild(btn);
    });
  }

  window.ABATheme = { get, set, renderPicker, list: THEMES };
})();
