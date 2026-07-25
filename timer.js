// Визуальный таймер в стиле Time Timer — общий модуль для всех страниц.
// Подключение: <script src="timer.js"></script> ПЕРЕД tabbar.js.
// Открытие: window.abaTimer.open() — вызывается вкладкой «Таймер» в таб-баре.
// Красный диск убывает по кругу; время задаётся вращением/тапом по диску
// (а не из пресетов). Состояние хранится в localStorage по метке времени,
// поэтому отсчёт переживает переход между страницами и сворачивание.
(function () {
  const STATE_KEY = "aba_timer_state"; // запущенный таймер: { endAt, total, paused, remaining }
  const DRAFT_KEY = "aba_timer_draft"; // выбранное, но не запущенное время (сек)
  const SOUND_KEY = "aba_timer_sound"; // "on" | "off"

  const SET_SCALE = 900; // полный оборот диска = 15 минут (шкала настройки)
  const STEP = 5;        // шаг привязки при вращении, сек
  const MAX_SEC = 3600;  // потолок (кнопками можно добрать сверх круга)

  const CX = 150, CY = 150, R = 118, OUTER_R = 134;
  const OUTER_CIRC = 2 * Math.PI * OUTER_R;

  let rafId = null;
  let finishedShown = false;
  let audioCtx = null; // создаётся в жесте пользователя, иначе браузер глушит звук

  const CSS = `
    #aba-timer-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 1300;
      background: rgba(10, 12, 14, 0.72);
      align-items: center;
      justify-content: center;
      padding: 16px;
    }
    #aba-timer-overlay.open { display: flex; }
    .aba-timer-card {
      background: #14171a;
      border-radius: 24px;
      padding: 20px 16px 18px;
      text-align: center;
      width: 100%;
      max-width: 360px;
      color: #f3f4f5;
    }
    .aba-timer-disc { display: block; margin: 0 auto; touch-action: none; user-select: none; -webkit-user-select: none; }
    .aba-timer-time {
      font-family: "Unbounded", -apple-system, "Segoe UI", Roboto, sans-serif;
      font-weight: 900;
      font-size: 40px;
      letter-spacing: 1px;
      margin: 8px 0 2px;
    }
    .aba-timer-hint { font-size: 13px; color: #9aa0a6; min-height: 18px; }
    .aba-timer-steppers {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 12px;
    }
    .aba-timer-steppers button {
      background: #23272b;
      border: none;
      border-radius: 12px;
      padding: 10px 12px;
      font-size: 14px;
      font-weight: 700;
      color: #e9eaec;
      cursor: pointer;
      min-width: 58px;
      touch-action: manipulation;
    }
    .aba-timer-steppers button:disabled { opacity: 0.35; cursor: default; }
    .aba-timer-main {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      margin-top: 16px;
    }
    .aba-timer-play {
      width: 74px; height: 74px;
      border-radius: 50%;
      border: none;
      background: #e11d2a;
      color: #fff;
      font-size: 30px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(225, 29, 42, 0.4);
      touch-action: manipulation;
    }
    .aba-timer-play:disabled { background: #3a3f44; box-shadow: none; cursor: default; }
    .aba-timer-icon {
      width: 52px; height: 52px;
      border-radius: 50%;
      border: none;
      background: #23272b;
      color: #cfd2d6;
      font-size: 20px;
      cursor: pointer;
      touch-action: manipulation;
    }
    .aba-timer-min {
      margin-top: 14px;
      background: none;
      border: none;
      color: #9aa0a6;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    #aba-timer-pill {
      display: none;
      position: fixed;
      right: 14px;
      bottom: calc(84px + env(safe-area-inset-bottom, 0px));
      z-index: 1250;
      background: #e11d2a;
      color: #fff;
      border: none;
      border-radius: 999px;
      padding: 9px 16px;
      font-size: 15px;
      font-weight: 800;
      font-family: "Unbounded", -apple-system, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 3px 10px rgba(225, 29, 42, 0.4);
      cursor: pointer;
    }
    @keyframes abaTimerFlash {
      0% { background: rgba(225, 29, 42, 0.6); }
      100% { background: rgba(10, 12, 14, 0.72); }
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
  function getDraft() {
    const v = Number(localStorage.getItem(DRAFT_KEY) || 0);
    return v > 0 ? v : 0;
  }
  function setDraft(sec) {
    const v = Math.max(0, Math.min(MAX_SEC, Math.round(sec)));
    if (v > 0) localStorage.setItem(DRAFT_KEY, String(v));
    else localStorage.removeItem(DRAFT_KEY);
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
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // Путь красного сектора: доля f (0..1) остатка, растёт от 12 часов по часовой.
  function piePath(f) {
    if (f <= 0) return "";
    if (f >= 0.9999) {
      // Полный круг двумя дугами (одной дугой SVG вырождается).
      return `M ${CX} ${CY - R} A ${R} ${R} 0 1 1 ${CX} ${CY + R} A ${R} ${R} 0 1 1 ${CX} ${CY - R} Z`;
    }
    // Красное = остаток: от границы съеденного (по часовой от 12) назад к 12.
    const eaten = (1 - f) * 2 * Math.PI; // угол съеденного, по часовой от верха
    const sx = CX + R * Math.sin(eaten);
    const sy = CY - R * Math.cos(eaten);
    const large = f > 0.5 ? 1 : 0;
    return `M ${CX} ${CY} L ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${CX} ${CY - R} Z`;
  }

  // === DOM ===
  let overlay, pieEl, outerEl, handleEl, timeEl, hintEl, playEl, pill;

  function build() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    overlay = document.createElement("div");
    overlay.id = "aba-timer-overlay";
    overlay.innerHTML = `
      <div class="aba-timer-card">
        <svg class="aba-timer-disc" width="272" height="272" viewBox="0 0 300 300">
          <circle cx="${CX}" cy="${CY}" r="${OUTER_R}" fill="none" stroke="#2a2f34" stroke-width="8"/>
          <circle class="t-outer" cx="${CX}" cy="${CY}" r="${OUTER_R}" fill="none" stroke="#5b6167"
            stroke-width="8" stroke-linecap="round" stroke-dasharray="${OUTER_CIRC}"
            stroke-dashoffset="${OUTER_CIRC}" transform="rotate(-90 ${CX} ${CY})"/>
          <circle cx="${CX}" cy="${CY}" r="${R}" fill="#1c2024"/>
          <path class="t-pie" d="" fill="#e11d2a"/>
          <circle class="t-handle" cx="${CX}" cy="${CY - OUTER_R}" r="9" fill="#fff" stroke="#14171a" stroke-width="2"/>
        </svg>
        <div class="aba-timer-time">0:00</div>
        <div class="aba-timer-hint">Крутите или коснитесь диска, чтобы задать время</div>
        <div class="aba-timer-steppers">
          <button type="button" data-step="-60">−1:00</button>
          <button type="button" data-step="-10">−0:10</button>
          <button type="button" data-step="10">+0:10</button>
          <button type="button" data-step="60">+1:00</button>
        </div>
        <div class="aba-timer-main">
          <button class="aba-timer-icon" type="button" data-act="reset" title="Сброс">↺</button>
          <button class="aba-timer-play" type="button" data-act="play">▶</button>
          <button class="aba-timer-icon" type="button" data-act="sound" title="Звук">🔔</button>
        </div>
        <button class="aba-timer-min" type="button" data-act="min">Свернуть ▾</button>
      </div>`;
    document.body.appendChild(overlay);

    pieEl = overlay.querySelector(".t-pie");
    outerEl = overlay.querySelector(".t-outer");
    handleEl = overlay.querySelector(".t-handle");
    timeEl = overlay.querySelector(".aba-timer-time");
    hintEl = overlay.querySelector(".aba-timer-hint");
    playEl = overlay.querySelector('[data-act="play"]');

    overlay.querySelectorAll(".aba-timer-steppers button").forEach((b) => {
      b.onclick = () => stepDraft(Number(b.dataset.step));
    });
    playEl.onclick = onPlay;
    overlay.querySelector('[data-act="reset"]').onclick = reset;
    overlay.querySelector('[data-act="min"]').onclick = close;
    overlay.querySelector('[data-act="sound"]').onclick = () => {
      localStorage.setItem(SOUND_KEY, soundOn() ? "off" : "on");
      updateSoundBtn();
    };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    wireDiscInput(overlay.querySelector(".aba-timer-disc"));

    pill = document.createElement("button");
    pill.id = "aba-timer-pill";
    pill.type = "button";
    pill.onclick = open;
    document.body.appendChild(pill);

    updateSoundBtn();
    render();
    if (getState()) { loop(); showPill(); }
  }

  function updateSoundBtn() {
    overlay.querySelector('[data-act="sound"]').textContent = soundOn() ? "🔔" : "🔇";
  }

  // === Ввод по диску: тап или вращение задают время (только когда не запущен) ===
  function wireDiscInput(svg) {
    let dragging = false;

    const angleToSec = (clientX, clientY) => {
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let a = Math.atan2(clientX - cx, -(clientY - cy)); // по часовой от 12 часов
      if (a < 0) a += 2 * Math.PI;
      const sec = Math.round((a / (2 * Math.PI)) * SET_SCALE / STEP) * STEP;
      return Math.max(0, Math.min(SET_SCALE, sec));
    };

    const apply = (e) => {
      if (getState()) return; // запущенный таймер диском не трогаем
      const p = e.touches ? e.touches[0] : e;
      setDraft(angleToSec(p.clientX, p.clientY));
      render();
    };

    svg.addEventListener("pointerdown", (e) => {
      if (getState()) { togglePause(); return; } // по запущенному — пауза/продолжить
      dragging = true;
      svg.setPointerCapture(e.pointerId);
      apply(e);
    });
    svg.addEventListener("pointermove", (e) => { if (dragging) apply(e); });
    const end = () => { dragging = false; };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
  }

  function stepDraft(delta) {
    if (getState()) return;
    setDraft(getDraft() + delta);
    render();
  }

  // === Отрисовка ===
  // Сектор: остаток/полное. Внешняя дуга + бегунок: выбранная длительность на
  // 15-минутной шкале (визуальный ориентир). Когда идёт отсчёт — бегунок скрыт.
  function paintDisc(remFrac, setFrac, showHandle) {
    pieEl.setAttribute("d", piePath(remFrac));
    const sf = Math.max(0, Math.min(1, setFrac));
    outerEl.setAttribute("stroke-dashoffset", String(OUTER_CIRC * (1 - sf)));
    if (showHandle) {
      const a = sf * 2 * Math.PI;
      handleEl.setAttribute("cx", String(CX + OUTER_R * Math.sin(a)));
      handleEl.setAttribute("cy", String(CY - OUTER_R * Math.cos(a)));
      handleEl.style.display = "";
    } else {
      handleEl.style.display = "none";
    }
  }

  function render() {
    const st = getState();
    if (st) { tick(); return; }
    // Не запущен: показываем выбранное время (диск полный), настройка активна.
    const draft = getDraft();
    const setFrac = Math.min(1, draft / SET_SCALE);
    paintDisc(draft > 0 ? 1 : 0, setFrac, true);
    timeEl.textContent = fmt(draft * 1000);
    hintEl.textContent = draft > 0 ? "Готово к запуску — нажмите ▶" : "Крутите или коснитесь диска, чтобы задать время";
    playEl.textContent = "▶";
    playEl.disabled = draft <= 0;
    setSteppersDisabled(false);
  }

  function setSteppersDisabled(v) {
    overlay.querySelectorAll(".aba-timer-steppers button").forEach((b) => { b.disabled = v; });
  }

  function tick() {
    const st = getState();
    if (!st) { stopLoop(); return; }
    const rem = remainingMs(st);
    if (rem <= 0 && !st.paused) { finish(); return; }

    const frac = st.total ? rem / st.total : 0;
    const setFrac = Math.min(1, (st.total / 1000) / SET_SCALE);
    paintDisc(frac, setFrac, false);
    pieEl.setAttribute("fill", frac <= 0.1 ? "#f2b01e" : "#e11d2a");
    timeEl.textContent = fmt(rem);
    hintEl.textContent = st.paused ? "Пауза · коснитесь диска, чтобы продолжить" : "Идёт отсчёт · коснитесь диска для паузы";
    playEl.textContent = st.paused ? "▶" : "⏸";
    playEl.disabled = false;
    setSteppersDisabled(true);

    pill.textContent = "⏱ " + fmt(rem);
  }

  // === Управление ===
  function onPlay() {
    const st = getState();
    if (!st) { start(getDraft()); return; }
    togglePause();
  }

  function start(sec) {
    if (!sec || sec <= 0) return;
    finishedShown = false;
    overlay.classList.remove("finished");
    if (soundOn()) {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === "suspended") audioCtx.resume();
      } catch (e) { /* без звука */ }
    }
    setState({ endAt: Date.now() + sec * 1000, total: sec * 1000, paused: false, remaining: sec * 1000 });
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
    // Сброс возвращает к настройке того же времени (draft сохраняем).
    setState(null);
    stopLoop();
    finishedShown = false;
    overlay.classList.remove("finished");
    hidePill();
    render();
  }

  function finish() {
    stopLoop();
    setState(null);
    hidePill();
    if (!finishedShown) {
      finishedShown = true;
      openOverlayOnly();
      overlay.classList.add("finished");
      paintDisc(0, 0, false);
      timeEl.textContent = "0:00";
      hintEl.textContent = "Время вышло";
      playEl.textContent = "▶";
      playEl.disabled = getDraft() <= 0;
      setSteppersDisabled(false);
      if (navigator.vibrate) navigator.vibrate([180, 90, 180]);
      beep();
    }
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
    render();
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
