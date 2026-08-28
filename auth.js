// Вход по логину — общий модуль для всех страниц приложения.
// Подключается ПОСЛЕ tabbar.js, до кода страницы: window.abaAuth.
//
// Главное правило: вход НЕ управляет сбором данных. Не вошли, кончился
// токен, нет сети — кнопки на «Сборе» работают, занятие собирается, очередь
// ждёт. Вход нужен для того, чтобы у записей появился автор и чтобы позже
// планшет мог получать данные с сервера.
//
// Токен — настройка УСТРОЙСТВА и одновременно ключ доступа. Поэтому он:
//   • не входит в данные ребёнка (isChildDataKey) и в экспорт профиля;
//   • НЕ входит в резервную копию планшета — копию носят на флешке и
//     пересылают, а вместе с токеном уехал бы и доступ к серверу.
(function () {
  const KEY = "aba_auth";
  const BASE = "https://api.abachecklist.ru";
  const COLLECTION = "staff";

  function читать() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const данные = JSON.parse(raw);
      return данные && данные.token ? данные : null;
    } catch {
      return null;
    }
  }

  function записать(данные) {
    try {
      if (данные) localStorage.setItem(KEY, JSON.stringify(данные));
      else localStorage.removeItem(KEY);
    } catch {
      /* приватный режим — вход продержится до перезагрузки */
    }
  }

  function изОтвета(ответ) {
    const запись = ответ.record || {};
    return {
      token: ответ.token,
      id: запись.id || "",
      email: запись.email || "",
      name: (запись.full_name || "").trim(),
      role: запись.role || "",
      at: Date.now()
    };
  }

  async function login(identity, password) {
    const resp = await fetch(`${BASE}/api/collections/${COLLECTION}/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: String(identity || "").trim(), password: String(password || "") })
    });
    if (!resp.ok) {
      // Разделяем «не тот пароль» и «сервер недоступен»: терапист должен
      // понимать, идти ли за паролем или подождать сети.
      if (resp.status === 400) throw new Error("Не подошли логин или пароль");
      throw new Error(`Сервер ответил ${resp.status}`);
    }
    const данные = изОтвета(await resp.json());
    if (!данные.token) throw new Error("Сервер не выдал вход");
    записать(данные);
    return данные;
  }

  // Продление входа при запуске приложения. Молчаливое: не вышло — работаем
  // дальше с тем, что есть, и уж точно ничего не блокируем.
  async function refresh() {
    const текущий = читать();
    if (!текущий) return null;
    try {
      const resp = await fetch(`${BASE}/api/collections/${COLLECTION}/auth-refresh`, {
        method: "POST",
        headers: { Authorization: `Bearer ${текущий.token}` }
      });
      if (resp.status === 401 || resp.status === 403) {
        // Сервер прямо сказал, что вход больше не годится.
        записать(null);
        return null;
      }
      if (!resp.ok) return текущий; // сеть шалит — оставляем как есть
      const данные = изОтвета(await resp.json());
      if (данные.token) записать(данные);
      return данные.token ? данные : текущий;
    } catch {
      return текущий; // офлайн: вход остаётся в силе
    }
  }

  function logout() {
    записать(null);
  }

  window.abaAuth = {
    get: читать,
    login,
    logout,
    refresh,
    // Имя для подписи записей. Вошли — берём из учётной записи; нет —
    // остаётся ручная подпись устройства (её поле сейчас скрыто).
    name() {
      const данные = читать();
      if (данные && данные.name) return данные.name;
      try {
        return (localStorage.getItem("aba_staff_name") || "").trim();
      } catch {
        return "";
      }
    },
    // Заголовок для запросов к нашему серверу. Без входа — пусто.
    headers() {
      const данные = читать();
      return данные ? { Authorization: `Bearer ${данные.token}` } : {};
    }
  };
})();
