// Визуальный таймер (тающее кольцо) — общий модуль для всех страниц.
// Подключение: <script src="timer.js"></script> ПЕРЕД tabbar.js.
// Открытие: window.abaTimer.open() — вызывается вкладкой «Таймер» в таб-баре.
// Состояние хранится в localStorage по метке времени, поэтому отсчёт
// переживает переход между страницами и сворачивание браузера.
(function () {
  const STATE_KEY = "aba_timer_state"; // { endAt, total, paused, remaining }
  const SOUND_KEY = "aba_timer_sound"; // "on" | "off"
  const PRESETS = [
    { label: "3с", sec: 3 },
    { label: "10с", sec: 10 },
    { label: "30с", sec: 30 },
    { label: "1м", sec: 60 },
    { label: "2м", sec: 120 },
    { label: "5м", sec: 300 }
  ];
  const R = 78;
  const CIRC = 2 * Math.PI * R;

  let rafId = null;
  let finishedShown = false;
  let audioCtx = null; // создаётся в start() (жест пользователя), иначе браузер глушит звук

  const CSS = `
    #aba-timer-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 1300;
      background: rgba(31, 36, 41, 0.45);
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #aba-timer-overlay.open { display: flex; }
    .aba-timer-card {
      background: #f3f2ed;
      border-radius: 20px;
      padding: 22px 16px;
      text-align: center;
      width: 100%;
      max-width: 360px;
    }
    .aba-timer-ring { display: block; margin: 0 auto; cursor: pointer; }
    .aba-timer-digits {
      font-family: "Unbounded", -apple-system, "Segoe UI", Roboto, sans-serif;
      font-weight: 900;
    }
    .aba-timer-presets {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 18px;
    }
    .aba-timer-presets button {
      background: #ffffff;
      border: 1px solid #e4e2d9;
      border-radius: 999px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 700;
      color: #1f2429;
      cursor: pointer;
    }
    .aba-timer-presets button.active {
      background: #0e7490;
      border-color: #0e7490;
      color: #fff;
    }
    .aba-timer-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    .aba-timer-actions button {
      background: #ffffff;
      border: 1px solid #e4e2d9;
      border-radius: 10px;
      padding: 9px 16px;
      font-size: 13px;
      font-weight: 600;
      color: #596270;
      cursor: pointer;
    }
    #aba-timer-pill {
      display: none;
      position: fixed;
      right: 14px;
      bottom: calc(84px + env(safe-area-inset-bottom, 0px));
      z-index: 1250;
      background: #0e7490;
      color: #fff;
      border: none;
      border-radius: 999px;
      padding: 9px 16px;
      font-size: 15px;
      font-weight: 800;
      font-family: "Unbounded", -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 3px 10px rgba(14, 116, 144, 0.35);
      cursor: pointer;
    }
    #aba-timer-pill.low { background: #b4552d; box-shadow: 0 3px 10px rgba(180, 85, 45, 0.35); }
    @keyframes abaTimerFlash {
      0% { background: rgba(180, 85, 45, 0.55); }
      100% { background: rgba(31, 36, 41, 0.45); }
    }
    #aba-timer-overlay.finished { animation: abaTimerFlash 0.9s ease-out 3; }
  `;

  // === Состояние ===
  function getState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || "null"); } catch { return null; }
  }
  function setState(state) {
    if (state) localStorage.setItem(STATE_KEY, JSON.stringify(state));
    else localStorage.removeItem(STATE_KEY);
  }
  function remainingMs(state) {
    if (!state) return 0;
    if (state.paused) return state.remaining;
    return Math.max(0, state.endAt - Date.now());
  }
  function soundOn() { return localStorage.getItem(SOUND_KEY) !== "off"; }

  // === Звук: два коротких сигнала через WebAudio, без файлов ===
  function beep() {
    if (!soundOn()) return;
    try {
      const ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      audioCtx = ctx;
      if (ctx.state === "suspended") ctx.resume();
      [0, 0.22].forEach((t) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.18, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.15);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.16);
      });
    } catch (e) { /* звук недоступен — не критично */ }
  }

  function fmt(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
  }

  // === DOM ===
  let overlay, ringFg, digits, subtext, pill;

  function build() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = document.createElement("div");
    overlay.id = "aba-timer-overlay";
    overlay.innerHTML = `
      <div class="aba-timer-card">
        <svg class="aba-timer-ring" width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="${R}" fill="none" stroke="#e4e2d9" stroke-width="12"/>
          <circle class="ring-fg" cx="90" cy="90" r="${R}" fill="none" stroke="#0e7490" stroke-width="12"
            stroke-linecap="round" stroke-dasharray="${CIRC}" stroke-dashoffset="0" transform="rotate(-90 90 90)"/>
          <text class="aba-timer-digits" x="90" y="88" text-anchor="middle" font-size="38" fill="#1f2429">—</text>
          <text class="ring-sub" x="90" y="112" text-anchor="middle" font-size="11" font-weight="600" fill="#6b7280">выберите время</text>
        </svg>
        <div class="aba-timer-presets"></div>
        <div class="aba-timer-actions">
          <button type="button" data-act="reset">Сброс</button>
          <button type="button" data-act="sound"></button>
          <button type="button" data-act="min">Свернуть ▾</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    ringFg = overlay.querySelector(".ring-fg");
    digits = overlay.querySelector(".aba-timer-digits");
    subtext = overlay.querySelector(".ring-sub");

    const presetsEl = overlay.querySelector(".aba-timer-presets");
    PRESETS.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = p.label;
      b.dataset.sec = String(p.sec);
      b.onclick = () => start(p.sec);
      presetsEl.appendChild(b);
    });

    overlay.querySelector(".aba-timer-ring").onclick = togglePause;
    overlay.querySelector('[data-act="reset"]').onclick = reset;
    overlay.querySelector('[data-act="min"]').onclick = close;
    const soundBtn = overlay.querySelector('[data-act="sound"]');
    soundBtn.onclick = () => {
      localStorage.setItem(SOUND_KEY, soundOn() ? "off" : "on");
      updateSoundBtn();
    };
    // Тап по фону — свернуть (не сбрасывая отсчёт).
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });

    pill = document.createElement("button");
    pill.id = "aba-timer-pill";
    pill.type = "button";
    pill.onclick = open;
    document.body.appendChild(pill);

    updateSoundBtn();

    // Если на странице «застали» идущий таймер — показать таблетку.
    if (getState()) {
      tick();
      showPill();
    }
  }

  function updateSoundBtn() {
    const b = overlay.querySelector('[data-act="sound"]');
    b.textContent = soundOn() ? "🔔 звук вкл" : "🔇 звук выкл";
  }

  function markPreset(sec) {
    overlay.querySelectorAll(".aba-timer-presets button").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.sec) === sec);
    });
  }

  // === Управление ===
  function start(sec) {
    finishedShown = false;
    overlay.classList.remove("finished");
    // Прогрев звука в жесте пользователя — иначе сигнал окончания заглушат.
    if (soundOn()) {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
      } catch (e) { /* без звука */ }
    }
    setState({ endAt: Date.now() + sec * 1000, total: sec * 1000, paused: false, remaining: sec * 1000 });
    markPreset(sec);
    loop();
  }

  function togglePause() {
    const st = getState();
    if (!st) return;
    if (st.paused) {
      st.endAt = Date.now() + st.remaining;
      st.paused = false;
    } else {
      st.remaining = remainingMs(st);
      st.paused = true;
    }
    setState(st);
    loop();
  }

  function reset() {
    setState(null);
    stopLoop();
    finishedShown = false;
    overlay.classList.remove("finished");
    markPreset(-1);
    digits.textContent = "—";
    subtext.textContent = "выберите время";
    ringFg.setAttribute("stroke-dashoffset", "0");
    ringFg.setAttribute("stroke", "#0e7490");
    hidePill();
  }

  function finish() {
    stopLoop();
    setState(null);
    hidePill();
    if (!finishedShown) {
      finishedShown = true;
      openOverlayOnly();
      overlay.classList.add("finished");
      digits.textContent = "0:00";
      subtext.textContent = "время вышло";
      ringFg.setAttribute("stroke-dashoffset", String(CIRC));
      if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
      beep();
    }
  }

  // === Отрисовка ===
  function tick() {
    const st = getState();
    if (!st) { stopLoop(); return; }
    const rem = remainingMs(st);
    if (rem <= 0 && !st.paused) { finish(); return; }

    const frac = rem / st.total;
    ringFg.setAttribute("stroke-dashoffset", String(CIRC * (1 - frac)));
    const low = frac <= 0.2;
    ringFg.setAttribute("stroke", low ? "#b4552d" : "#0e7490");
    digits.textContent = fmt(rem);
    subtext.textContent = st.paused ? "пауза · тап — продолжить" : `из ${fmt(st.total)} · пауза по тапу`;

    pill.textContent = "⏱ " + fmt(rem);
    pill.classList.toggle("low", low);
  }

  function loop() {
    stopLoop();
    const step = () => {
      tick();
      if (getState()) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  // === Открытие/сворачивание ===
  function openOverlayOnly() {
    overlay.classList.add("open");
    hidePill();
  }

  function open() {
    openOverlayOnly();
    if (getState()) loop();
  }

  function close() {
    overlay.classList.remove("open");
    if (getState()) showPill();
  }

  function showPill() { pill.style.display = "block"; loop(); }
  function hidePill() { pill.style.display = "none"; }

  // Вкладка могла быть скрыта в момент окончания — при возвращении досчитать.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && getState()) loop();
  });

  window.abaTimer = { open };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
