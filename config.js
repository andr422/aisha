// Слепок настройки ребёнка — общий для «Сбора» и «Настройки».
//
// На сервер уезжает двумя путями: сам вместе с занятием (finalizeSession в
// «Сборе») и вручную кнопкой «⬆ Отправить настройку на сервер» в «Настройке» —
// для планшета, который в новой версии занятий ещё не отправлял, а
// восстанавливать его уже может понадобиться.
//
// Читает только localStorage и ни от чего на странице не зависит, поэтому
// одинаково работает откуда угодно. Держим одной копией: разъехавшиеся
// копии одного и того же мы уже проходили.
(function () {
  const GEN_CAT_KEYS = ["stim", "place", "people"];
  const GEN_SLOTS = 3; // условий в каждой категории

  function getProtocolsCount() {
    // Только протоколы с непустым названием — как в «Сборе».
    return Object.keys(localStorage)
      .map((key) => (key.match(/^protocol(\d+)_title$/) || [])[1])
      .filter(Boolean)
      .filter((i) => (localStorage.getItem(`protocol${i}_title`) || "").trim())
      .reduce((max, i) => Math.max(max, Number(i)), 0);
  }

  function existingGoalIds(protocolIndex) {
    const re = new RegExp(`^protocol${protocolIndex}_goal(\\d+)$`);
    return Object.keys(localStorage)
      .map((key) => (key.match(re) || [])[1])
      .filter(Boolean)
      .map(Number)
      .filter((j) => (localStorage.getItem(`protocol${protocolIndex}_goal${j}`) || "").trim())
      .sort((a, b) => a - b);
  }

  // Старый формат клетки обобщения (строка-дата) читаем как успешную пробу
  // без подписи — на планшетах такие записи есть, терять их нельзя.
  function normGenSlot(value) {
    if (!value) return null;
    if (typeof value === "string") return { d: value, t: "", ok: true };
    if (typeof value === "object" && value.d) {
      return { d: value.d, t: String(value.t || ""), ok: value.ok !== false };
    }
    return null;
  }

  function getGenLog(i, goalId) {
    const empty = () => Array(GEN_SLOTS).fill(null);
    const base = { stim: empty(), place: empty(), people: empty() };
    try {
      const saved = JSON.parse(localStorage.getItem(`protocol${i}_goal${goalId}_genLog`) || "{}");
      GEN_CAT_KEYS.forEach((key) => {
        if (Array.isArray(saved[key])) {
          base[key] = Array.from({ length: GEN_SLOTS }, (_, n) => normGenSlot(saved[key][n]));
        }
      });
    } catch {
      /* повреждённая запись — начинаем с пустой */
    }
    return base;
  }

  // Что именно считаем «настройкой ребёнка»: протоколы, цели, даты и журнал
  // обобщения — всё, чего на сервере нет ни в каком виде. Счётчики текущего
  // занятия сюда НЕ входят: это временное состояние.
  function build() {
    try {
      const protocols = [];
      const count = getProtocolsCount();
      for (let i = 1; i <= count; i += 1) {
        const goals = existingGoalIds(i).map((goalId) => ({
          id: goalId,
          name: localStorage.getItem(`protocol${i}_goal${goalId}`) || "",
          introDate: localStorage.getItem(`protocol${i}_goal${goalId}_introDate`) || "",
          masteryDate: localStorage.getItem(`protocol${i}_goal${goalId}_masteryDate`) || "",
          genDoneDate: localStorage.getItem(`protocol${i}_goal${goalId}_genDoneDate`) || "",
          genHold: localStorage.getItem(`protocol${i}_goal${goalId}_genHold`) === "1",
          keepDaily: localStorage.getItem(`protocol${i}_goal${goalId}_keepDaily`) === "1",
          archived: localStorage.getItem(`protocol${i}_goal${goalId}_archived`) === "1",
          genLog: getGenLog(i, goalId)
        }));
        protocols.push({
          index: i,
          title: localStorage.getItem(`protocol${i}_title`) || "",
          coldProbe: localStorage.getItem(`protocol${i}_coldProbe`) === "1",
          selected: localStorage.getItem(`protocol${i}_selectedGoals`) || "",
          goals
        });
      }

      const lists = {};
      ["abc_antecedents", "abc_behaviors", "abc_consequences", "freq_behaviors"].forEach((key) => {
        const value = localStorage.getItem(key);
        if (value) lists[key] = value;
      });

      return { version: 1, savedAt: new Date().toISOString(), protocols, lists };
    } catch (err) {
      console.error(err);
      return null; // слепок не должен мешать отправке занятия
    }
  }

  window.abaConfig = { build };
})();
