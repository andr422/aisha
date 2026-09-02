// Значок во вкладке браузера — рисуется на месте и меняется по сезону.
//
// Зачем отдельный рисунок, а не уменьшенная иконка приложения: во вкладке
// значок занимает 16–32 пикселя. Композиция «кнопка + плашка + галочка»
// на таком размере превращается в кашу, поэтому здесь свои пропорции:
// плюс крупнее, уголок крупнее, мелочь выброшена.
//
// Почему холст, а не готовый PNG: рисунок должен меняться по дате, а держать
// на сервере дюжину файлов ради ёлочки — глупо. Заодно не нужен шрифт:
// плюс собран из двух полос, а не из буквы.
//
// ВАЖНО: на планшете, где приложение открыто с домашнего экрана, вкладки нет
// и значок не виден. Сезонная подмена — для кабинета и отчётов в браузере.
(function () {
  const БИРЮЗА = "#0e7490";
  const ЛИЦО = "#dff0f3";       // заливка кнопки «+»
  const СТУПЕНЬ = "#b5d9df";    // её «толщина» снизу
  const БЕЛЫЙ = "#ffffff";
  const ЗЕЛЁНЫЙ = "#4c9a63";

  // Сезоны: первый подошедший выигрывает. Даты — включительно, месяц с единицы.
  // Добавить праздник = добавить строку; ничего больше трогать не нужно.
  const СЕЗОНЫ = [
    { с: [12, 1], по: [1, 14], знак: "ёлка", подпись: "Новый год" }
  ];

  function вСезоне(дата, сезон) {
    const м = дата.getMonth() + 1, д = дата.getDate();
    const [см, сд] = сезон.с, [пм, пд] = сезон.по;
    const позже = м > см || (м === см && д >= сд);
    const раньше = м < пм || (м === пм && д <= пд);
    // Диапазон через новый год (декабрь → январь) читается как «или».
    return см > пм ? позже || раньше : позже && раньше;
  }

  function знакДня(дата) {
    const сезон = СЕЗОНЫ.find((с) => вСезоне(дата, с));
    return сезон ? сезон.знак : "галочка";
  }

  function скруглённый(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function нарисовать(знак) {
    const S = 64;
    const холст = document.createElement("canvas");
    холст.width = холст.height = S;
    const ctx = холст.getContext("2d");

    ctx.fillStyle = БИРЮЗА;
    ctx.fillRect(0, 0, S, S);

    // Кнопка со ступенькой, как в приложении.
    ctx.fillStyle = СТУПЕНЬ; скруглённый(ctx, 7, 13, 40, 34, 8);
    ctx.fillStyle = ЛИЦО;    скруглённый(ctx, 7, 10, 40, 34, 8);

    // Плюс двумя полосами: без шрифта и без зависимостей.
    ctx.fillStyle = БИРЮЗА;
    скруглённый(ctx, 24, 16, 6, 22, 3);
    скруглённый(ctx, 16, 24, 22, 6, 3);

    // Уголок: белая плашка со своей ступенькой.
    ctx.fillStyle = "#dfe3e6"; скруглённый(ctx, 33, 34, 25, 22, 6);
    ctx.fillStyle = БЕЛЫЙ;     скруглённый(ctx, 33, 32, 25, 22, 6);

    ctx.strokeStyle = ЗЕЛЁНЫЙ;
    ctx.fillStyle = ЗЕЛЁНЫЙ;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (знак === "ёлка") {
      // Ёлочка силуэтом: на 16 пикселях важен только контур.
      ctx.beginPath();
      ctx.moveTo(45.5, 36);
      ctx.lineTo(51, 43); ctx.lineTo(48, 43);
      ctx.lineTo(53, 49); ctx.lineTo(38, 49);
      ctx.lineTo(43, 43); ctx.lineTo(40, 43);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(44, 49, 3, 3);
    } else {
      ctx.beginPath();
      ctx.moveTo(38, 43);
      ctx.lineTo(43, 48);
      ctx.lineTo(53, 38);
      ctx.stroke();
    }

    return холст.toDataURL("image/png");
  }

  function поставить(дата) {
    try {
      const знак = знакДня(дата || new Date());
      const href = нарисовать(знак);
      let link = document.querySelector('link[rel="icon"][data-aba]');
      if (!link) {
        // Старые ссылки на PNG убираем: иначе браузер выберет любую из них.
        document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
          .forEach((el) => el.remove());
        link = document.createElement("link");
        link.rel = "icon";
        link.type = "image/png";
        link.dataset.aba = "1";
        document.head.append(link);
      }
      link.href = href;
      return знак;
    } catch (err) {
      // Значок во вкладке — украшение. Не вышло — молчим и живём дальше.
      return null;
    }
  }

  поставить();
  // Открытая сутками вкладка кабинета должна встретить декабрь сама.
  setInterval(() => поставить(), 60 * 60 * 1000);

  // Наружу — для проверки: window.abaFavicon.поставить(new Date(2026, 11, 25)).
  window.abaFavicon = { поставить, знакДня, нарисовать };
})();
