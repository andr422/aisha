// Нижний таб-бар, общий для всех страниц приложения.
// ДОБАВЛЕНИЕ НОВОГО ЧЕК-ЛИСТА: дописать один объект в массив TABS ниже —
// бар обновится на всех страницах, где подключён этот файл.
// Подключение на странице: <script src="tabbar.js"></script> перед </body>.
(function () {
  const TABS = [
    {
      href: "final_fixed_aisha.html",
      label: "Сбор",
      icon:
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M9 12l2 2 4-4"/></svg>'
    },
    {
      href: "abc.html",
      label: "ABC",
      icon:
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="16" rx="3"/><text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="800" fill="currentColor" stroke="none" font-family="inherit">ABC</text></svg>'
    },
    {
      // Вкладка-действие: не ссылка, а вызов функции (визуальный таймер).
      action: () => window.abaTimer && window.abaTimer.open(),
      label: "Таймер",
      icon:
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9.5v3.5l2.5 2.5"/><path d="M9 2h6"/></svg>'
    },
    {
      href: "summary_fixed_aisha.html",
      label: "Настройка",
      icon:
        '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2.4" fill="#fff"/><line x1="4" y1="15" x2="20" y2="15"/><circle cx="15" cy="15" r="2.4" fill="#fff"/></svg>'
    }
    // Примеры на будущее:
    // { href: "frequency.html", label: "Частота", icon: '<svg ...>...</svg>' },
  ];

  // Стили самодостаточны (без зависимостей от переменных страницы),
  // чтобы бар выглядел одинаково на любой странице.
  const CSS = `
    body { padding-bottom: calc(76px + env(safe-area-inset-bottom, 0px)); }
    .app-tabbar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1200;
      display: flex;
      justify-content: space-around;
      background: #ffffff;
      border-top: 1px solid #e4e2d9;
      box-shadow: 0 -2px 10px rgba(31, 36, 41, 0.05);
      padding: 8px 8px calc(10px + env(safe-area-inset-bottom, 0px));
    }
    .app-tabbar a {
      text-decoration: none;
      text-align: center;
      min-width: 72px;
      color: #9aa0a8;
    }
    .app-tabbar a.active {
      color: #0e7490;
    }
    .app-tabbar .tab-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      margin-top: 2px;
    }
    .app-tabbar a.active .tab-label {
      font-weight: 700;
    }
    .app-tabbar .tab-indicator {
      width: 22px;
      height: 3px;
      border-radius: 2px;
      margin: 4px auto 0;
      background: transparent;
    }
    .app-tabbar a.active .tab-indicator {
      background: #0e7490;
    }
  `;

  function currentFile() {
    const parts = window.location.pathname.split("/");
    return parts[parts.length - 1] || TABS[0].href;
  }

  function build() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const nav = document.createElement("nav");
    nav.className = "app-tabbar";
    const here = currentFile();

    TABS.forEach((tab) => {
      const a = document.createElement("a");
      if (tab.action) {
        // Вкладка-действие: без перехода, вызывает функцию.
        a.href = "#";
        a.addEventListener("click", (e) => {
          e.preventDefault();
          tab.action();
        });
      } else {
        a.href = tab.href;
        if (tab.href === here) {
          a.className = "active";
          // Тап по активной вкладке не перезагружает страницу.
          a.addEventListener("click", (e) => e.preventDefault());
        }
      }
      a.innerHTML =
        tab.icon +
        `<span class="tab-label"></span>` +
        `<span class="tab-indicator"></span>`;
      a.querySelector(".tab-label").textContent = tab.label;
      nav.appendChild(a);
    });

    document.body.appendChild(nav);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
