/* MagnumCWS – запись: несколько услуг, день, время, контакты, живой текст заявки (30.10.2026).
   Даты и время – по Ижевску (Europe/Samara, UTC+4), прошедшие не выбрать. Ничего не отправляет само:
   открывает WhatsApp с готовым текстом, Telegram – копирует текст и открывает чат, или копирует заявку. */
(() => {
  const form = document.querySelector("[data-b-booking]");
  if (!form) return;

  const WA = "79225140101";                 // WhatsApp с карточки на Яндекс.Картах
  const TG = "https://t.me/+79225140101";   // Telegram с карточки (по номеру)
  const TZ = "Europe/Samara";
  const SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
  const DAYS = 14, LEAD_MIN = 30;           // окно записи – 2 недели, ближайший слот – не раньше чем через 30 минут
  const KEY = "magnumcws-zayavka";

  const $ = (s, r = form) => r.querySelector(s);
  const $$ = (s, r = form) => [...r.querySelectorAll(s)];
  const daysBox = $("[data-b-days]"), timesBox = $("[data-b-times]"), timesNote = $("[data-b-times-note]");
  const textEl = $("[data-b-text]"), errEl = $("[data-b-error]"), noteEl = $("[data-b-note]");
  const rub = (n) => Math.round(n).toLocaleString("ru-RU").replace(/\s/g, " ") + " ₽";

  // ---- «сейчас» в Ижевске, независимо от часового пояса посетителя
  const izhNow = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, min: +p.hour * 60 + +p.minute };
  };
  const wd = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
  const wdFull = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const mon = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const monShort = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

  // ---- черновик: если посетитель перезагрузил страницу, введённое не теряется
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) { return null; } };
  const save = (st) => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (_) {} };
  const draft = load();

  // ---- дни
  let today = izhNow();
  const buildDays = (keep) => {
    today = izhNow();
    daysBox.innerHTML = "";
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d));
    const lastSlot = toMin(SLOTS[SLOTS.length - 1]);
    for (let i = 0; i < DAYS; i++) {
      const d = new Date(base); d.setUTCDate(base.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const full = (i === 0 ? "сегодня, " : i === 1 ? "завтра, " : "") + d.getUTCDate() + " " + mon[d.getUTCMonth()] + ", " + wdFull[d.getUTCDay()];
      const top = i === 0 ? "сегодня" : i === 1 ? "завтра" : wd[d.getUTCDay()];
      const off = i === 0 && today.min + LEAD_MIN > lastSlot;
      daysBox.insertAdjacentHTML("beforeend",
        `<label class="b-day"><input type="radio" name="day" value="${iso}" data-full="${full}"${off ? " disabled" : ""}><span><small>${top}</small><b>${d.getUTCDate()}</b><em>${monShort[d.getUTCMonth()]}</em></span></label>`);
    }
    const pick = keep && daysBox.querySelector(`input[value="${keep}"]:not(:disabled)`) || daysBox.querySelector("input:not(:disabled)");
    if (pick) pick.checked = true;
  };

  // ---- время для выбранного дня; выбранное время сохраняется, если оно ещё доступно
  const buildTimes = (keep) => {
    const day = daysBox.querySelector("input:checked");
    const isToday = day && day === daysBox.querySelector("input");
    timesBox.innerHTML = "";
    SLOTS.forEach((t) => {
      const past = isToday && toMin(t) < izhNow().min + LEAD_MIN;
      timesBox.insertAdjacentHTML("beforeend", `<label class="b-time"><input type="radio" name="time" value="${t}"${past ? " disabled" : ""}><span>${t}</span></label>`);
    });
    timesNote.hidden = true;
    if (keep) {
      const inp = timesBox.querySelector(`input[value="${keep}"]`);
      if (inp && !inp.disabled) inp.checked = true;
      else if (inp) { timesNote.textContent = `На этот день ${keep} уже недоступно – выберите другое время.`; timesNote.hidden = false; }
    }
  };

  // ---- услуги и сумма
  const services = () => $$("input[name=svc]:checked").map((i) => ({ name: i.value, price: i.dataset.price ? +i.dataset.price : null, from: !!i.dataset.from }));
  const priceText = (s) => s.price == null ? "стоимость уточняется" : (s.from ? "от " : "") + rub(s.price);
  const renderSum = (list) => {
    $("[data-b-count]").textContent = list.length;
    const known = list.filter((s) => s.price != null), ask = list.length - known.length;
    let total;
    if (!list.length) total = "выберите услугу";
    else if (!known.length) total = "уточняется";
    else total = (known.some((s) => s.from) ? "от " : "") + rub(known.reduce((a, s) => a + s.price, 0)) + (ask ? " + уточняется" : "");
    $("[data-b-total]").textContent = total;
    $("[data-b-ask]").hidden = !ask;
  };

  // ---- текст заявки
  const val = (n) => (form.elements[n].value || "").trim();
  const buildText = () => {
    const list = services(), day = daysBox.querySelector("input:checked"), time = timesBox.querySelector("input:checked");
    const lines = ["Здравствуйте! Хочу записаться в MagnumCWS.", "", "Услуги:"];
    if (list.length) list.forEach((s) => lines.push("– " + s.name + " – " + priceText(s)));
    else lines.push("– пока не выбрал(а)");
    lines.push("", "Желаемая дата: " + (day ? day.dataset.full : "не выбрана"), "Желаемое время: " + (time ? time.value : "не выбрано"));
    lines.push("Автомобиль: " + (val("car") || "–"), "Имя: " + (val("name") || "–"), "Телефон: " + (val("phone") || "–"));
    if (val("comment")) lines.push("Комментарий: " + val("comment"));
    lines.push("", "Прошу подтвердить возможность записи и уточнить итоговую стоимость.");
    return lines.join("\n");
  };

  const markSteps = () => {
    const done = { svc: services().length > 0, day: !!daysBox.querySelector("input:checked"), time: !!timesBox.querySelector("input:checked"), contacts: !!(val("name") && phoneOk()) };
    $$("[data-b-step]").forEach((f) => f.classList.toggle("is-done", !!done[f.dataset.bStep]));
  };
  const phoneOk = () => val("phone").replace(/\D/g, "").length >= 10;

  const update = () => {
    const list = services();
    renderSum(list);
    textEl.textContent = buildText();
    markSteps();
    save({ svc: list.map((s) => s.name), day: daysBox.querySelector("input:checked")?.value, time: timesBox.querySelector("input:checked")?.value,
      name: val("name"), phone: val("phone"), car: val("car"), comment: val("comment") });
    if (!errEl.hidden) check(false);
  };

  // ---- проверка перед отправкой
  const check = (focus = true) => {
    const miss = []; let first = null;
    const need = (ok, label, el) => { if (!ok) { miss.push(label); first = first || el; } };
    need(services().length > 0, "услугу", $("input[name=svc]"));
    need(!!daysBox.querySelector("input:checked"), "день", daysBox.querySelector("input:not(:disabled)"));
    need(!!timesBox.querySelector("input:checked"), "время", timesBox.querySelector("input:not(:disabled)"));
    need(!!val("name"), "имя", form.elements.name);
    need(phoneOk(), "телефон", form.elements.phone);
    form.elements.name.closest(".b-field").classList.toggle("is-bad", !val("name") && !errEl.hidden);
    form.elements.phone.closest(".b-field").classList.toggle("is-bad", !phoneOk() && !errEl.hidden);
    if (miss.length) {
      errEl.textContent = "Чтобы отправить заявку, укажите: " + miss.join(", ") + ".";
      errEl.hidden = false;
      form.elements.name.closest(".b-field").classList.toggle("is-bad", !val("name"));
      form.elements.phone.closest(".b-field").classList.toggle("is-bad", !phoneOk());
      if (focus && first) first.focus({ preventScroll: false });
      return false;
    }
    errEl.hidden = true;
    $$(".b-field.is-bad").forEach((f) => f.classList.remove("is-bad"));
    return true;
  };

  const say = (t) => { noteEl.textContent = t; noteEl.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => (noteEl.hidden = true), 7000); };
  const copy = async (t) => {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (_) {
      const ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (_) {} ta.remove(); return ok;
    }
  };

  form.addEventListener("click", async (e) => {
    const send = e.target.closest("[data-b-send]"), cp = e.target.closest("[data-b-copy]");
    if (!send && !cp) return;
    e.preventDefault();
    if (!check()) return;
    const text = buildText();
    if (cp) { say(await copy(text) ? "Заявка скопирована – вставьте её в любой мессенджер или SMS." : "Не получилось скопировать – выделите текст заявки выше вручную."); $(".b-preview").open = true; return; }
    if (send.dataset.bSend === "whatsapp") {
      window.open("https://wa.me/" + WA + "?text=" + encodeURIComponent(text), "_blank", "noopener");
      say("Открываем WhatsApp с готовой заявкой. Запись подтвердят в ответном сообщении.");
    } else {
      const ok = await copy(text);
      window.open(TG, "_blank", "noopener");
      say(ok ? "Заявка скопирована. Вставьте её в открывшийся чат Telegram и отправьте." : "Откройте чат Telegram и вставьте заявку из блока «Текст заявки».");
      if (!ok) $(".b-preview").open = true;
    }
  });

  // ---- события: смена услуг не трогает день, время и контакты
  daysBox.addEventListener("change", () => { const t = timesBox.querySelector("input:checked")?.value; buildTimes(t); update(); });
  form.addEventListener("change", (e) => { if (!e.target.closest("[data-b-days]")) update(); });
  form.addEventListener("input", (e) => { if (e.target.matches("input[type=text], input[type=tel], textarea")) update(); });

  // ---- кнопки «Записаться» по странице: прокрутка к форме и фокус на первом шаге
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-b-go]"); if (!go) return;
    e.preventDefault();
    document.getElementById("widget").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    setTimeout(() => $("input[name=svc]").focus({ preventScroll: true }), 450);
  });

  // ---- старт: черновик или значения по умолчанию
  if (draft) {
    if (Array.isArray(draft.svc)) $$("input[name=svc]").forEach((i) => (i.checked = draft.svc.includes(i.value)));
    ["name", "phone", "car", "comment"].forEach((n) => { if (draft[n]) form.elements[n].value = draft[n]; });
  }
  buildDays(draft && draft.day);
  buildTimes(draft && draft.time);
  update();

  // страница открыта долго: раз в минуту закрываем прошедшее время, выбор не сбрасываем без нужды
  setInterval(() => {
    const now = izhNow();
    const dayChanged = now.d !== today.d, onToday = daysBox.querySelector("input:checked") === daysBox.querySelector("input");
    if (!dayChanged && !onToday) return;
    const d = daysBox.querySelector("input:checked")?.value, t = timesBox.querySelector("input:checked")?.value;
    buildDays(d); buildTimes(t); update();
  }, 60000);
})();
