/* Acolytus — calendário litúrgico */
const CAL_COLORS = {
  branco: { hex: "#f5f0e6", label: "Branco" },
  vermelho: { hex: "#c41e3a", label: "Vermelho" },
  verde: { hex: "#4a7c59", label: "Verde" },
  roxo: { hex: "#6b3a8a", label: "Roxo" },
  rosa: { hex: "#e8a0bf", label: "Rosa" },
  dourado: { hex: "#c9a227", label: "Dourado" }
};

const CAL_TIPO_LABEL = {
  solenidade: "Solenidade",
  festa: "Festa",
  memoria: "Memória",
  comemoracao: "Comemoração",
  proprio: "Próprio da comunidade",
  tempo: "Tempo litúrgico"
};

const CAL_TIPO_RANK = {
  solenidade: 1, festa: 2, memoria: 3, comemoracao: 4, proprio: 5, tempo: 6
};

const CAL_TIPO_DEFAULT_COR = {
  solenidade: "dourado",
  festa: "branco",
  memoria: "branco",
  comemoracao: "branco",
  proprio: "branco",
  tempo: "verde"
};

let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth();
let calEvents = [];
let calSelectedDate = null;

function setupCalendarUI() {
  document.getElementById("cal-prev")?.addEventListener("click", () => {
    calViewMonth--;
    if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
    renderCalendar();
  });
  document.getElementById("cal-next")?.addEventListener("click", () => {
    calViewMonth++;
    if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
    renderCalendar();
  });
  document.getElementById("cal-today")?.addEventListener("click", () => {
    const now = new Date();
    calViewYear = now.getFullYear();
    calViewMonth = now.getMonth();
    calSelectedDate = toYMD(now);
    renderCalendar();
    showDayDetail(calSelectedDate);
  });

  document.getElementById("btn-add-cal-event")?.addEventListener("click", () => {
    if (!isAdmin()) {
      alert("Só o administrador altera o calendário.");
      return;
    }
    openCalModal();
  });
  document.getElementById("btn-cancel-cal")?.addEventListener("click", () => {
    document.getElementById("modal-cal").classList.add("hidden");
  });
  document.getElementById("btn-delete-cal")?.addEventListener("click", async () => {
    const id = document.getElementById("cal-event-id").value;
    if (!id || !confirm("Excluir este evento?")) return;
    if (!db || !isAdmin()) return;
    try {
      await db.ref("calendario/" + id).remove();
      document.getElementById("modal-cal").classList.add("hidden");
      await loadCalendar();
    } catch (err) {
      alert("Não deu para excluir. Tente de novo.");
    }
  });

  document.getElementById("cal-tipo")?.addEventListener("change", (e) => {
    const def = CAL_TIPO_DEFAULT_COR[e.target.value];
    if (def) document.getElementById("cal-cor").value = def;
  });

  document.getElementById("form-cal")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!db) {
      alert("Sem conexão no momento. Tente de novo.");
      return;
    }
    if (!isAdmin()) {
      alert("Só o administrador altera o calendário.");
      return;
    }

    const id = document.getElementById("cal-event-id").value;
    const titulo = document.getElementById("cal-titulo").value.trim();
    const tipo = document.getElementById("cal-tipo").value;
    const inicio = document.getElementById("cal-inicio").value;
    const fim = document.getElementById("cal-fim").value || inicio;
    const cor = document.getElementById("cal-cor").value;
    const obs = document.getElementById("cal-obs").value.trim();

    if (!titulo || !inicio) {
      alert("Preencha o título e a data de início.");
      return;
    }
    if (fim < inicio) {
      alert("A data final não pode ser antes da data de início.");
      return;
    }

    const data = {
      titulo, tipo, inicio, fim, cor, obs,
      updatedAt: Date.now(),
      autor: currentUser.nome
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Salvando..."; }
    try {
      if (id) await db.ref("calendario/" + id).update(data);
      else {
        data.createdAt = Date.now();
        await db.ref("calendario").push(data);
      }
      document.getElementById("modal-cal").classList.add("hidden");
      await loadCalendar();
      if (calSelectedDate) showDayDetail(calSelectedDate);
    } catch (err) {
      console.error(err);
      alert("Não deu para salvar o evento. Tente de novo.");
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Salvar"; }
    }
  });
}

function openCalModal(event = null) {
  const modal = document.getElementById("modal-cal");
  const form = document.getElementById("form-cal");
  form.reset();
  document.getElementById("cal-event-id").value = event?.id || "";
  document.getElementById("modal-cal-title").textContent = event ? "Editar evento" : "Novo evento";
  document.getElementById("btn-delete-cal").classList.toggle("hidden", !event);

  if (event) {
    document.getElementById("cal-titulo").value = event.titulo || "";
    document.getElementById("cal-tipo").value = event.tipo || "festa";
    document.getElementById("cal-inicio").value = event.inicio || "";
    document.getElementById("cal-fim").value = event.fim && event.fim !== event.inicio ? event.fim : "";
    document.getElementById("cal-cor").value = event.cor || "branco";
    document.getElementById("cal-obs").value = event.obs || "";
  } else {
    document.getElementById("cal-tipo").value = "festa";
    document.getElementById("cal-cor").value = CAL_TIPO_DEFAULT_COR.festa;
    if (calSelectedDate) document.getElementById("cal-inicio").value = calSelectedDate;
  }
  modal.classList.remove("hidden");
}

window.editCalEvent = function (id) {
  if (!isAdmin()) {
    alert("Só o administrador altera o calendário.");
    return;
  }
  const ev = calEvents.find((e) => e.id === id);
  if (ev) openCalModal(ev);
};

window.deleteCalEventFromList = async function (id) {
  if (!confirm("Excluir este evento?")) return;
  if (!db || !isAdmin()) return;
  try {
    await db.ref("calendario/" + id).remove();
    await loadCalendar();
    if (calSelectedDate) showDayDetail(calSelectedDate);
  } catch (err) {
    alert("Não deu para excluir. Tente de novo.");
  }
};

async function loadCalendar() {
  if (!db) {
    calEvents = [];
    renderCalendar();
    return;
  }
  try {
    const snap = await db.ref("calendario").once("value");
    const data = snap.val() || {};
    calEvents = Object.entries(data)
      .filter(([, event]) => event && typeof event === "object")
      .map(([id, event]) => ({ id, ...event }));
  } catch (e) {
    console.error(e);
    calEvents = [];
  }
  renderCalendar();
  if (calSelectedDate) showDayDetail(calSelectedDate);
}

function eventsOnDate(ymd) {
  return calEvents
    .filter((e) => {
      const start = e.inicio;
      const end = e.fim || e.inicio;
      return start && end && ymd >= start && ymd <= end;
    })
    .sort((a, b) => {
      const ra = CAL_TIPO_RANK[a.tipo] ?? 99;
      const rb = CAL_TIPO_RANK[b.tipo] ?? 99;
      if (ra !== rb) return ra - rb;
      return (a.titulo || "").localeCompare(b.titulo || "", "pt-BR");
    });
}

function calDayCell(day, ymd, other, todayYMD) {
  const evs = eventsOnDate(ymd);
  const top = evs[0];
  const cor = top ? (CAL_COLORS[top.cor]?.hex || "#c9a227") : "";
  const cls = [
    "cal-day",
    other ? "other-month" : "",
    ymd === todayYMD ? "today" : "",
    ymd === calSelectedDate ? "selected" : "",
    evs.length ? "has-events" : ""
  ].filter(Boolean).join(" ");
  const chips = evs.slice(0, 2).map((e) => {
    const c = CAL_COLORS[e.cor]?.hex || "#c9a227";
    return `<span class="cal-event-chip" style="background:${c}" title="${escapeHtml(e.titulo)}">${escapeHtml((e.titulo || "").slice(0, 18))}</span>`;
  }).join("");
  return `<div class="${cls}" data-date="${ymd}" style="${cor && !other ? `box-shadow: inset 0 -3px 0 ${cor}` : ""}">
    <span class="cal-day-num">${day}</span>
    <div class="cal-chips">${chips}</div>
  </div>`;
}

function renderCalendar() {
  const grid = document.getElementById("cal-grid");
  const label = document.getElementById("cal-month-label");
  if (!grid || !label) return;

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  label.textContent = `${monthNames[calViewMonth]} ${calViewYear}`;

  const first = new Date(calViewYear, calViewMonth, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const prevDays = new Date(calViewYear, calViewMonth, 0).getDate();
  const todayYMD = toYMD(new Date());
  let html = "";

  for (let i = startDow - 1; i >= 0; i--) {
    const day = prevDays - i;
    const m = calViewMonth === 0 ? 11 : calViewMonth - 1;
    const y = calViewMonth === 0 ? calViewYear - 1 : calViewYear;
    const ymd = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    html += calDayCell(day, ymd, true, todayYMD);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const ymd = `${calViewYear}-${String(calViewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    html += calDayCell(day, ymd, false, todayYMD);
  }
  const totalSoFar = startDow + daysInMonth;
  const remaining = totalSoFar % 7 === 0 ? 0 : 7 - (totalSoFar % 7);
  for (let day = 1; day <= remaining; day++) {
    const m = calViewMonth === 11 ? 0 : calViewMonth + 1;
    const y = calViewMonth === 11 ? calViewYear + 1 : calViewYear;
    const ymd = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    html += calDayCell(day, ymd, true, todayYMD);
  }

  grid.innerHTML = html;
  grid.querySelectorAll(".cal-day").forEach((el) => {
    el.addEventListener("click", () => {
      calSelectedDate = el.dataset.date;
      renderCalendar();
      showDayDetail(calSelectedDate);
    });
  });
}

function showDayDetail(ymd) {
  const box = document.getElementById("cal-day-detail");
  const title = document.getElementById("cal-day-title");
  const list = document.getElementById("cal-day-events");
  if (!box || !title || !list) return;

  const [y, m, d] = ymd.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  title.textContent = dateObj.toLocaleDateString("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  const evs = eventsOnDate(ymd);
  const canEdit = isAdmin();

  if (!evs.length) {
    list.innerHTML = '<li class="empty-msg">Nada marcado neste dia.</li>';
  } else {
    list.innerHTML = evs.map((e) => `
      <li>
        <strong>${escapeHtml(e.titulo)}</strong>
        <span class="cal-tipo">${escapeHtml(CAL_TIPO_LABEL[e.tipo] || e.tipo || "")}</span>
        ${e.obs ? `<p>${escapeHtml(e.obs)}</p>` : ""}
        ${canEdit ? `
          <button type="button" class="btn btn-outline btn-sm" onclick="editCalEvent('${e.id}')">Editar</button>
          <button type="button" class="btn btn-danger" onclick="deleteCalEventFromList('${e.id}')">Excluir</button>
        ` : ""}
      </li>
    `).join("");
  }
  box.classList.remove("hidden");
}
