
/* ========== config.js ========== */

/* Acolytus — configuração e níveis de acesso */
const firebaseConfig = {
  databaseURL: "https://acolytus-3ae68-default-rtdb.firebaseio.com"
};

let db = null;
let currentUser = null;
let membrosCache = [];
let relatoriosCache = [];
let selectedMembroId = null;

const ADMIN_SEED = {
  nome: "GUILHERME PEREIRA BATISTA",
  nasc: "22072009",
  role: "admin"
};

const titles = {
  inicio: "Início",
  formulario: "Formulário SAL",
  escalas: "Escalas",
  atas: "Atas",
  liturgia: "Liturgia",
  financas: "Finanças",
  diversos: "Diversos",
  membros: "Membros",
  relatorios: "Relatórios",
  avisos: "Avisos",
  usuarios: "Quem pode entrar"
};

/* admin = tudo | coordenador = tudo menos usuários e editar calendário | servo = escalas, liturgia, calendário (ver), avisos */
function getRole() {
  const r = (currentUser && currentUser.role) || "servo";
  if (r === "membro") return "servo";
  return r;
}
function isAdmin() { return getRole() === "admin"; }
function isCoordUp() { return getRole() === "admin" || getRole() === "coordenador"; }
function isServo() { return getRole() === "servo"; }

const SERVO_SECTIONS = new Set(["inicio", "escalas", "liturgia", "avisos"]);
const ROLE_LABEL = {
  admin: "Administrador",
  coordenador: "Coordenador",
  servo: "Servo",
  membro: "Servo"
};


/* ========== utils.js ========== */

/* Acolytus — utilitários */
function normalizeName(n) {
  return (n || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNasc(str) {
  const digits = (str || "").replace(/\D/g, "");
  return digits.length === 8 ? digits : digits;
}

function formatNascDisplay(digits) {
  if (!digits || digits.length !== 8) return digits || "—";
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function formatDate(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleString("pt-BR"); } catch { return ""; }
}

function formatYMD(ymd) {
  if (!ymd || ymd.length < 10) return ymd || "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setupUppercase() {
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (["password", "email", "url", "file", "checkbox", "radio", "hidden"].includes(el.type)) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const upper = el.value.toUpperCase();
    if (el.value !== upper) {
      el.value = upper;
      if (start != null && end != null) {
        try { el.setSelectionRange(start, end); } catch (_) {}
      }
    }
  });
}

function setupDateMask() {
  ["login-nasc", "user-nasc", "membro-nasc"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", (e) => {
      let v = e.target.value.replace(/\D/g, "").slice(0, 8);
      if (v.length > 4) v = v.slice(0, 2) + "/" + v.slice(2, 4) + "/" + v.slice(4);
      else if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2);
      e.target.value = v;
    });
  });
}

function setupDate() {
  const el = document.getElementById("current-date");
  if (!el) return;
  el.textContent = new Date().toLocaleDateString("pt-BR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

function setFirebaseStatus(message, state = "warning") {
  if (state === "error") console.warn(message);
  else console.log(message);
}


/* ========== auth.js ========== */

/* Acolytus — login, acesso e navegação */
function initFirebase() {
  try {
    if (!window.firebase || !firebase.database) {
      setFirebaseStatus("Sem conexão.", "error");
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    db.ref(".info/connected").on("value", (snap) => {
      setFirebaseStatus(snap.val() === true ? "online" : "offline", snap.val() ? "ok" : "warning");
    });
    ensureAdminExists();
  } catch (e) {
    console.error(e);
    setFirebaseStatus(String(e.message || e), "error");
  }
}

async function ensureAdminExists() {
  if (!db) return;
  try {
    const snap = await db.ref("users").once("value");
    const users = snap.val() || {};
    const exists = Object.values(users).some(
      (u) => normalizeName(u.nome) === normalizeName(ADMIN_SEED.nome)
    );
    if (!exists) {
      await db.ref("users").push({
        nome: ADMIN_SEED.nome,
        nasc: ADMIN_SEED.nasc,
        role: "admin",
        createdAt: Date.now()
      });
    }
  } catch (e) {
    console.warn("Seed admin:", e);
  }
}

function setupLogin() {
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("login-nome").value.trim();
    const nasc = normalizeNasc(document.getElementById("login-nasc").value);
    const errEl = document.getElementById("login-error");

    if (!nome || nasc.length !== 8) {
      errEl.textContent = "Preencha o nome e a data no formato DD/MM/AAAA, por favor.";
      errEl.classList.remove("hidden");
      return;
    }

    errEl.classList.add("hidden");
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Entrando...";

    try {
      const user = await findUser(nome, nasc);
      if (!user) {
        errEl.textContent = "Não encontramos esse nome com essa data. Confira e tente de novo.";
        errEl.classList.remove("hidden");
        return;
      }
      currentUser = user;
      sessionStorage.setItem("acolytus_user", JSON.stringify(user));
      showApp();
    } catch (err) {
      console.error(err);
      if (
        normalizeName(nome) === normalizeName(ADMIN_SEED.nome) &&
        nasc === ADMIN_SEED.nasc
      ) {
        currentUser = { ...ADMIN_SEED, id: "local-admin" };
        sessionStorage.setItem("acolytus_user", JSON.stringify(currentUser));
        showApp();
      } else {
        errEl.textContent = "Não deu para conectar agora. Confira a internet e tente de novo.";
        errEl.classList.remove("hidden");
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  });
}

async function findUser(nome, nasc) {
  if (!db) {
    if (
      normalizeName(nome) === normalizeName(ADMIN_SEED.nome) &&
      nasc === ADMIN_SEED.nasc
    ) {
      return { ...ADMIN_SEED, id: "local-admin" };
    }
    return null;
  }
  const snap = await db.ref("users").once("value");
  const users = snap.val() || {};
  for (const [id, u] of Object.entries(users)) {
    if (
      normalizeName(u.nome) === normalizeName(nome) &&
      normalizeNasc(u.nasc) === nasc
    ) {
      const role = u.role === "membro" ? "servo" : (u.role || "servo");
      return { id, nome: u.nome, nasc: u.nasc, role };
    }
  }
  if (
    normalizeName(nome) === normalizeName(ADMIN_SEED.nome) &&
    nasc === ADMIN_SEED.nasc
  ) {
    return { ...ADMIN_SEED, id: "admin-seed" };
  }
  return null;
}

function showLogin() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

function showApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("user-display").textContent = currentUser.nome;

  applyAccessControl();
  updateWelcomeBanner();

  loadAvisos();
  loadCalendar();
  if (isCoordUp()) {
    loadMembros();
    loadRelatorios();
  }
  if (isAdmin()) loadUsers();
}

function applyAccessControl() {
  const admin = isAdmin();
  const coord = isCoordUp();
  const servo = isServo();

  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", !admin);
  });
  document.querySelectorAll(".coord-up").forEach((el) => {
    el.classList.toggle("hidden", !coord);
  });

  document.querySelectorAll(".nav-item[data-section]").forEach((btn) => {
    const sec = btn.dataset.section;
    if (sec === "usuarios") {
      btn.classList.toggle("hidden", !admin);
      return;
    }
    if (servo && !SERVO_SECTIONS.has(sec)) btn.classList.add("hidden");
    else if (sec !== "usuarios") btn.classList.remove("hidden");
  });

  document.querySelectorAll(".nav-card[data-goto]").forEach((card) => {
    const sec = card.dataset.goto;
    if (servo && !SERVO_SECTIONS.has(sec)) card.classList.add("hidden");
    else card.classList.remove("hidden");
  });
}

function updateWelcomeBanner() {
  const el = document.getElementById("welcome-text");
  if (!el || !currentUser) return;
  const primeiro = (currentUser.nome || "").trim().split(/\s+/)[0] || "";
  const nomeBonito = primeiro
    ? primeiro.charAt(0) + primeiro.slice(1).toLowerCase()
    : "";
  el.innerHTML = nomeBonito
    ? `Seja bem-vindo(a), <strong>${escapeHtml(nomeBonito)}</strong>.`
    : "Seja bem-vindo(a).";
}

function setupLogout() {
  document.getElementById("btn-logout").addEventListener("click", () => {
    currentUser = null;
    sessionStorage.removeItem("acolytus_user");
    showLogin();
    document.getElementById("login-form").reset();
  });
}

function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.section));
  });
}

function setupNavCards() {
  document.querySelectorAll(".nav-card[data-goto]").forEach((card) => {
    card.addEventListener("click", () => navigateTo(card.dataset.goto));
  });
}

function navigateTo(section) {
  if (section === "usuarios" && !isAdmin()) return;
  if (isServo() && !SERVO_SECTIONS.has(section)) section = "inicio";

  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add("active");

  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.getElementById(`section-${section}`)?.classList.add("active");

  document.getElementById("page-title").textContent = titles[section] || section;
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (section === "usuarios" && isAdmin()) loadUsers();
  if (section === "avisos") loadAvisos();
  if (section === "inicio") loadCalendar();
  if (section === "membros" && isCoordUp()) {
    selectedMembroId = null;
    showMembrosList();
    loadMembros();
    loadRelatorios();
  }
  if (section === "relatorios" && isCoordUp()) {
    loadMembros();
    loadRelatorios();
  }
}

window.navigateTo = navigateTo;

function setupMobileMenu() {
  const btn = document.getElementById("btn-menu");
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (!btn || !sidebar) return;

  function openMenu() {
    sidebar.classList.add("open");
    overlay?.classList.remove("hidden");
    document.body.classList.add("menu-open");
  }
  function closeMenu() {
    sidebar.classList.remove("open");
    overlay?.classList.add("hidden");
    document.body.classList.remove("menu-open");
  }

  btn.addEventListener("click", () => {
    if (sidebar.classList.contains("open")) closeMenu();
    else openMenu();
  });
  overlay?.addEventListener("click", closeMenu);
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 900px)").matches) closeMenu();
    });
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMenu();
  });
}


/* ========== calendar.js ========== */

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


/* ========== membros.js ========== */

/* Acolytus — membros e perfil do coroinha */
function setupMembrosUI() {
  document.getElementById("btn-add-membro")?.addEventListener("click", () => openMembroModal());
  document.getElementById("btn-cancel-membro")?.addEventListener("click", () => {
    document.getElementById("modal-membro").classList.add("hidden");
  });
  document.getElementById("form-membro")?.addEventListener("submit", saveMembroForm);
  document.getElementById("membro-search")?.addEventListener("input", renderMembrosTable);
  document.getElementById("membro-filter-funcao")?.addEventListener("change", renderMembrosTable);
  document.getElementById("membro-filter-status")?.addEventListener("change", renderMembrosTable);
  document.getElementById("btn-print-membros")?.addEventListener("click", printMembrosLista);
  document.getElementById("btn-voltar-membros")?.addEventListener("click", () => {
    selectedMembroId = null;
    showMembrosList();
  });
  document.getElementById("btn-add-relatorio-perfil")?.addEventListener("click", () => {
    openRelatorioModal(null, selectedMembroId);
  });
  document.getElementById("btn-edit-membro-perfil")?.addEventListener("click", () => {
    if (selectedMembroId) editMembro(selectedMembroId);
  });
  document.getElementById("btn-edit-obs-geral")?.addEventListener("click", () => {
    if (selectedMembroId) editMembro(selectedMembroId);
  });
}

function showMembrosList() {
  document.getElementById("membros-list-view")?.classList.remove("hidden");
  document.getElementById("membro-perfil-view")?.classList.add("hidden");
}

function openMembroModal(m = null) {
  document.getElementById("modal-membro-title").textContent = m ? "Editar membro" : "Novo membro";
  document.getElementById("form-membro").reset();
  document.getElementById("membro-id").value = m?.id || "";
  if (m) {
    document.getElementById("membro-nome").value = m.nome || "";
    document.getElementById("membro-funcao").value = m.funcao || "Coroinha";
    document.getElementById("membro-nasc").value = formatNascDisplay(normalizeNasc(m.nasc));
    document.getElementById("membro-telefone").value = m.telefone || "";
    document.getElementById("membro-email").value = m.email || "";
    document.getElementById("membro-status").value = m.status || "ativo";
    document.getElementById("membro-obs").value = m.obs || "";
  } else {
    document.getElementById("membro-status").value = "ativo";
  }
  document.getElementById("modal-membro").classList.remove("hidden");
}

async function saveMembroForm(e) {
  e.preventDefault();
  if (!db) { alert("Sem conexão no momento. Tente de novo."); return; }
  if (!isCoordUp()) { alert("Só coordenadores e administradores cadastram membros."); return; }
  const id = document.getElementById("membro-id").value;
  const nome = document.getElementById("membro-nome").value.trim();
  const funcao = document.getElementById("membro-funcao").value;
  const nasc = normalizeNasc(document.getElementById("membro-nasc").value);
  const telefone = document.getElementById("membro-telefone").value.trim();
  const email = document.getElementById("membro-email").value.trim();
  const status = document.getElementById("membro-status").value;
  const obs = document.getElementById("membro-obs").value.trim();
  if (!nome) { alert("Informe o nome."); return; }
  const data = { nome, funcao, nasc, telefone, email, status, obs, updatedAt: Date.now(), autor: currentUser.nome };
  try {
    if (id) await db.ref("membros/" + id).update(data);
    else {
      data.createdAt = Date.now();
      await db.ref("membros").push(data);
    }
    document.getElementById("modal-membro").classList.add("hidden");
    await loadMembros();
    if (id && selectedMembroId === id) openMembroPerfil(id);
  } catch (err) {
    alert("Não deu para salvar. Tente de novo.");
  }
}

async function loadMembros() {
  const tbody = document.getElementById("membros-tbody");
  if (!tbody) return;
  if (!db) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Sem conexão no momento</td></tr>';
    return;
  }
  try {
    const snap = await db.ref("membros").once("value");
    const data = snap.val() || {};
    membrosCache = Object.entries(data)
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
    renderMembrosTable();
    fillMembroSelects();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Não deu para carregar os membros.</td></tr>';
  }
}

function countRelatoriosMembro(membroId) {
  return relatoriosCache.filter((r) => r.membroId === membroId).length;
}

function renderMembrosTable() {
  const tbody = document.getElementById("membros-tbody");
  if (!tbody) return;
  const q = (document.getElementById("membro-search")?.value || "").toLowerCase().trim();
  const fFunc = document.getElementById("membro-filter-funcao")?.value || "";
  const fStat = document.getElementById("membro-filter-status")?.value || "";
  let list = membrosCache.slice();
  if (q) {
    list = list.filter((m) =>
      (m.nome || "").toLowerCase().includes(q) ||
      (m.funcao || "").toLowerCase().includes(q) ||
      (m.telefone || "").includes(q)
    );
  }
  if (fFunc) list = list.filter((m) => m.funcao === fFunc);
  if (fStat) list = list.filter((m) => (m.status || "ativo") === fStat);
  const canEdit = isCoordUp();
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-msg">Nenhum membro por aqui ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map((m) => {
    const nRel = countRelatoriosMembro(m.id);
    return `
    <tr class="membro-row" data-id="${m.id}">
      <td><button type="button" class="link-nome" onclick="openMembroPerfil('${m.id}')">${escapeHtml(m.nome)}</button></td>
      <td>${escapeHtml(m.funcao || "—")}</td>
      <td>${escapeHtml(m.telefone || "—")}</td>
      <td><span class="rel-count">${nRel}</span></td>
      <td><span class="status-badge ${m.status === "inativo" ? "inativo" : "ativo"}">${m.status === "inativo" ? "Inativo" : "Ativo"}</span></td>
      <td class="coord-up ${canEdit ? "" : "hidden"}">
        <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();editMembro('${m.id}')">Editar</button>
        <button class="btn btn-danger" onclick="event.stopPropagation();deleteMembro('${m.id}')">Excluir</button>
      </td>
    </tr>`;
  }).join("");
}

window.openMembroPerfil = function (id) {
  const m = membrosCache.find((x) => x.id === id);
  if (!m) return;
  selectedMembroId = id;
  document.getElementById("membros-list-view")?.classList.add("hidden");
  document.getElementById("membro-perfil-view")?.classList.remove("hidden");

  const initial = (m.nome || "C").trim().charAt(0).toUpperCase();
  document.getElementById("perfil-avatar").textContent = initial;
  document.getElementById("perfil-nome").textContent = m.nome || "—";
  document.getElementById("perfil-meta").textContent =
    `${m.funcao || "Membro"} · ${(m.status || "ativo") === "inativo" ? "Inativo" : "Ativo"}` +
    (m.nasc ? ` · Nasc. ${formatNascDisplay(normalizeNasc(m.nasc))}` : "");
  const contato = [m.telefone, m.email].filter(Boolean).join(" · ");
  document.getElementById("perfil-contato").textContent = contato || "";
  document.getElementById("perfil-obs-texto").textContent = m.obs?.trim() || "Nenhuma observação geral.";

  document.querySelectorAll("#membro-perfil-view .coord-up, #membro-perfil-view .admin-only").forEach((el) => {
    el.classList.toggle("hidden", !isCoordUp());
  });

  renderPerfilRelatorios(id);
};

function renderPerfilRelatorios(membroId) {
  const list = document.getElementById("perfil-relatorios-list");
  if (!list) return;
  const items = relatoriosCache
    .filter((r) => r.membroId === membroId)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const canManage = isCoordUp();
  if (!items.length) {
    list.innerHTML = '<p class="empty-msg">Ainda não há relatório deste coroinha. Clique em "Novo relatório" para anotar.</p>';
    return;
  }
  list.innerHTML = items.map((r) => relatorioCardHtml(r, canManage)).join("");
}

window.editMembro = function (id) {
  const m = membrosCache.find((x) => x.id === id);
  if (m) openMembroModal(m);
};

window.deleteMembro = async function (id) {
  if (!confirm("Excluir este membro? Os relatórios vinculados ficam no histórico.")) return;
  if (!db) return;
  try {
    await db.ref("membros/" + id).remove();
    if (selectedMembroId === id) {
      selectedMembroId = null;
      showMembrosList();
    }
    loadMembros();
  } catch (e) {
    alert("Não deu para excluir. Tente de novo.");
  }
};

function printMembrosLista() {
  const ativos = membrosCache.filter((m) => (m.status || "ativo") === "ativo");
  const rows = (ativos.length ? ativos : membrosCache).map((m, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(m.nome || "")}</td>
      <td>${escapeHtml(m.funcao || "")}</td>
      <td>${escapeHtml(m.telefone || "")}</td>
      <td>${formatNascDisplay(normalizeNasc(m.nasc))}</td>
    </tr>
  `).join("");
  openPrint(`
    <h1>Lista de Membros da Pastoral</h1>
    <p class="print-meta">Emitido em ${new Date().toLocaleDateString("pt-BR")}${currentUser ? " · " + escapeHtml(currentUser.nome) : ""}</p>
    <table>
      <thead><tr><th>#</th><th>Nome</th><th>Função</th><th>Telefone</th><th>Nascimento</th></tr></thead>
      <tbody>${rows || "<tr><td colspan='5'>Nenhum membro</td></tr>"}</tbody>
    </table>
  `);
}

function fillMembroSelects() {
  const opts = membrosCache
    .filter((m) => (m.status || "ativo") === "ativo")
    .map((m) => `<option value="${m.id}">${escapeHtml(m.nome)} (${escapeHtml(m.funcao || "")})</option>`)
    .join("");
  const selForm = document.getElementById("relatorio-membro");
  const selFilter = document.getElementById("relatorio-filter-membro");
  if (selForm) {
    const cur = selForm.value;
    selForm.innerHTML = '<option value="">Selecione o membro...</option>' + opts;
    if (cur) selForm.value = cur;
  }
  if (selFilter) {
    const cur = selFilter.value;
    selFilter.innerHTML = '<option value="">Todos os membros</option>' + opts;
    if (cur) selFilter.value = cur;
  }
}


/* ========== relatorios.js ========== */

/* Acolytus — relatórios por coroinha */
function setupRelatoriosUI() {
  document.getElementById("btn-add-relatorio")?.addEventListener("click", () => openRelatorioModal());
  document.getElementById("btn-cancel-relatorio")?.addEventListener("click", () => {
    document.getElementById("modal-relatorio").classList.add("hidden");
  });
  document.getElementById("form-relatorio")?.addEventListener("submit", saveRelatorioForm);
  document.getElementById("relatorio-search")?.addEventListener("input", renderRelatoriosList);
  document.getElementById("relatorio-filter-membro")?.addEventListener("change", renderRelatoriosList);
}

function openRelatorioModal(rel = null, forceMembroId = null) {
  document.getElementById("modal-relatorio-title").textContent = rel ? "Editar relatório" : "Novo relatório";
  document.getElementById("form-relatorio").reset();
  document.getElementById("relatorio-id").value = rel?.id || "";
  fillMembroSelects();
  if (rel) {
    document.getElementById("relatorio-membro").value = rel.membroId || "";
    document.getElementById("relatorio-titulo").value = rel.titulo || "";
    document.getElementById("relatorio-tipo").value = rel.tipo || "Acompanhamento";
    document.getElementById("relatorio-data").value = rel.data || "";
    document.getElementById("relatorio-conteudo").value = rel.conteudo || "";
  } else {
    const mid = forceMembroId || selectedMembroId || "";
    if (mid) document.getElementById("relatorio-membro").value = mid;
    document.getElementById("relatorio-data").value = toYMD(new Date());
    document.getElementById("relatorio-tipo").value = "Acompanhamento";
  }
  document.getElementById("modal-relatorio").classList.remove("hidden");
}

async function saveRelatorioForm(e) {
  e.preventDefault();
  if (!db) { alert("Sem conexão no momento. Tente de novo."); return; }
  if (!isCoordUp()) { alert("Só coordenadores e administradores registram relatórios."); return; }
  const id = document.getElementById("relatorio-id").value;
  const membroId = document.getElementById("relatorio-membro").value;
  const titulo = document.getElementById("relatorio-titulo").value.trim();
  const tipo = document.getElementById("relatorio-tipo").value;
  const dataRel = document.getElementById("relatorio-data").value;
  const conteudo = document.getElementById("relatorio-conteudo").value.trim();
  if (!membroId) { alert("Selecione o membro (coroinha)."); return; }
  if (!titulo || !conteudo) { alert("Preencha título e observações."); return; }
  const membro = membrosCache.find((m) => m.id === membroId);
  const data = {
    membroId,
    membroNome: membro?.nome || "",
    titulo, tipo, data: dataRel, conteudo,
    updatedAt: Date.now(),
    autor: currentUser?.nome || "—"
  };
  try {
    if (id) await db.ref("relatorios/" + id).update(data);
    else {
      data.createdAt = Date.now();
      await db.ref("relatorios").push(data);
    }
    document.getElementById("modal-relatorio").classList.add("hidden");
    await loadRelatorios();
    if (selectedMembroId) renderPerfilRelatorios(selectedMembroId);
    renderMembrosTable();
  } catch (err) {
    alert("Não deu para salvar. Tente de novo.");
  }
}

async function loadRelatorios() {
  const list = document.getElementById("relatorios-list");
  if (!db) {
    if (list) list.innerHTML = '<p class="empty-msg">Não foi possível carregar os relatórios agora.</p>';
    return;
  }
  try {
    const snap = await db.ref("relatorios").once("value");
    const data = snap.val() || {};
    relatoriosCache = Object.entries(data)
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    renderRelatoriosList();
    if (selectedMembroId) renderPerfilRelatorios(selectedMembroId);
    renderMembrosTable();
  } catch (e) {
    if (list) list.innerHTML = '<p class="empty-msg">Não deu para carregar os relatórios.</p>';
  }
}

function relatorioCardHtml(r, canManage) {
  const preview = (r.conteudo || "").slice(0, 200) + ((r.conteudo || "").length > 200 ? "…" : "");
  return `
    <div class="relatorio-item">
      <h4>${escapeHtml(r.titulo)}</h4>
      <div class="rel-meta">
        <strong>${escapeHtml(r.membroNome || "—")}</strong>
        · ${escapeHtml(r.tipo || "Relatório")}
        ${r.data ? " · " + formatYMD(r.data) : ""}
        ${r.autor ? " · " + escapeHtml(r.autor) : ""}
        ${r.createdAt ? " · " + formatDate(r.createdAt) : ""}
      </div>
      <div class="rel-preview">${escapeHtml(preview)}</div>
      <div class="relatorio-actions">
        <button class="btn btn-gold btn-sm" onclick="printRelatorio('${r.id}')">Imprimir</button>
        ${canManage ? `
          <button class="btn btn-outline btn-sm" onclick="editRelatorio('${r.id}')">Editar</button>
          <button class="btn btn-danger" onclick="deleteRelatorio('${r.id}')">Excluir</button>
        ` : ""}
      </div>
    </div>`;
}

function renderRelatoriosList() {
  const list = document.getElementById("relatorios-list");
  if (!list) return;
  const q = (document.getElementById("relatorio-search")?.value || "").toLowerCase().trim();
  const fMid = document.getElementById("relatorio-filter-membro")?.value || "";
  let items = relatoriosCache.slice();
  if (fMid) items = items.filter((r) => r.membroId === fMid);
  if (q) {
    items = items.filter((r) =>
      (r.titulo || "").toLowerCase().includes(q) ||
      (r.membroNome || "").toLowerCase().includes(q) ||
      (r.conteudo || "").toLowerCase().includes(q)
    );
  }
  const canManage = isCoordUp();
  if (!items.length) {
    list.innerHTML = '<p class="empty-msg">Nenhum relatório por enquanto. Quando quiser, clique em "Novo relatório".</p>';
    return;
  }
  list.innerHTML = items.map((r) => relatorioCardHtml(r, canManage)).join("");
}

window.editRelatorio = function (id) {
  const r = relatoriosCache.find((x) => x.id === id);
  if (r) openRelatorioModal(r);
};

window.deleteRelatorio = async function (id) {
  if (!confirm("Excluir este relatório?")) return;
  if (!db) return;
  try {
    await db.ref("relatorios/" + id).remove();
    await loadRelatorios();
  } catch (e) {
    alert("Não deu para excluir. Tente de novo.");
  }
};

window.printRelatorio = function (id) {
  const r = relatoriosCache.find((x) => x.id === id);
  if (!r) return;
  const paragrafos = (r.conteudo || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
  openPrint(`
    <h1>${escapeHtml(r.titulo)}</h1>
    <p class="print-meta">
      Membro: <strong>${escapeHtml(r.membroNome || "—")}</strong><br/>
      ${escapeHtml(r.tipo || "Relatório")}
      ${r.data ? " · " + formatYMD(r.data) : ""}
      ${r.autor ? " · Elaborado por " + escapeHtml(r.autor) : ""}
    </p>
    ${paragrafos}
    <div class="print-signature">
      <div><div class="line"></div><p>Responsável</p></div>
      <div><div class="line"></div><p>Coordenação da Pastoral</p></div>
    </div>
  `);
}


/* ========== avisos.js ========== */

/* Acolytus — avisos */
function setupAvisosUI() {
  document.getElementById("btn-add-aviso")?.addEventListener("click", () => {
    document.getElementById("form-aviso").reset();
    document.getElementById("modal-aviso").classList.remove("hidden");
  });
  document.getElementById("btn-cancel-aviso")?.addEventListener("click", () => {
    document.getElementById("modal-aviso").classList.add("hidden");
  });
  document.getElementById("form-aviso")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!db || !isCoordUp()) return;
    const titulo = document.getElementById("aviso-titulo").value.trim();
    const texto = document.getElementById("aviso-texto").value.trim();
    try {
      await db.ref("avisos").push({
        titulo, texto,
        autor: currentUser.nome,
        createdAt: Date.now()
      });
      document.getElementById("modal-aviso").classList.add("hidden");
      loadAvisos();
    } catch (err) {
      alert("Não deu para publicar. Tente de novo.");
    }
  });
}

async function loadAvisos() {
  const list = document.getElementById("avisos-list");
  if (!list) return;
  if (!db) {
    list.innerHTML = '<p class="empty-msg">Não foi possível carregar os avisos agora.</p>';
    return;
  }
  try {
    const snap = await db.ref("avisos").orderByChild("createdAt").once("value");
    const data = snap.val() || {};
    const items = Object.entries(data)
      .map(([id, a]) => ({ id, ...a }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!items.length) {
      list.innerHTML = '<p class="empty-msg">Nenhum aviso no momento.</p>';
      return;
    }

    const canManage = isCoordUp();
    list.innerHTML = items.map((a) => `
      <div class="aviso-item">
        <h4>${escapeHtml(a.titulo)}</h4>
        <p>${escapeHtml(a.texto)}</p>
        <div class="aviso-meta">
          ${a.autor ? escapeHtml(a.autor) + " · " : ""}${formatDate(a.createdAt)}
          ${canManage ? ` · <button class="btn btn-danger" onclick="deleteAviso('${a.id}')" style="margin-left:6px">Excluir</button>` : ""}
        </div>
      </div>
    `).join("");
  } catch (e) {
    list.innerHTML = '<p class="empty-msg">Não deu para carregar os avisos.</p>';
  }
}

window.deleteAviso = async function (id) {
  if (!confirm("Excluir este aviso?")) return;
  if (!db) return;
  await db.ref("avisos/" + id).remove();
  loadAvisos();
};


/* ========== users.js ========== */

/* Acolytus — quem pode entrar (só administrador) */
function setupUsersUI() {
  document.getElementById("btn-add-user")?.addEventListener("click", () => {
    document.getElementById("modal-user-title").textContent = "Nova pessoa";
    document.getElementById("form-user").reset();
    document.getElementById("user-id").value = "";
    document.getElementById("user-role").value = "servo";
    document.getElementById("modal-user").classList.remove("hidden");
  });

  document.getElementById("btn-cancel-user")?.addEventListener("click", () => {
    document.getElementById("modal-user").classList.add("hidden");
  });

  document.getElementById("form-user")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin()) {
      alert("Só o administrador cadastra quem pode entrar.");
      return;
    }
    const id = document.getElementById("user-id").value;
    const nome = document.getElementById("user-nome").value.trim();
    const nasc = normalizeNasc(document.getElementById("user-nasc").value);
    const role = document.getElementById("user-role").value;

    if (nasc.length !== 8) {
      alert("Data de nascimento inválida. Use DD/MM/AAAA.");
      return;
    }
    if (!db) {
      alert("Sem conexão no momento. Tente de novo.");
      return;
    }

    const data = { nome, nasc, role, updatedAt: Date.now() };
    try {
      if (id) await db.ref("users/" + id).update(data);
      else {
        data.createdAt = Date.now();
        await db.ref("users").push(data);
      }
      document.getElementById("modal-user").classList.add("hidden");
      loadUsers();
    } catch (err) {
      alert("Não deu para salvar. Tente de novo.");
    }
  });
}

async function loadUsers() {
  const tbody = document.getElementById("users-tbody");
  if (!tbody || !db) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Sem conexão no momento</td></tr>';
    return;
  }
  try {
    const snap = await db.ref("users").once("value");
    const users = snap.val() || {};
    const rows = Object.entries(users);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Ninguém cadastrado ainda</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(([id, u]) => `
      <tr>
        <td>${escapeHtml(u.nome)}</td>
        <td>${formatNascDisplay(normalizeNasc(u.nasc))}</td>
        <td>${ROLE_LABEL[u.role] || u.role || "Servo"}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editUser('${id}')">Editar</button>
          <button class="btn btn-danger" onclick="deleteUser('${id}')">Excluir</button>
        </td>
      </tr>
    `).join("");
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="4">Não deu para carregar</td></tr>';
  }
}

window.editUser = async function (id) {
  if (!db || !isAdmin()) return;
  const snap = await db.ref("users/" + id).once("value");
  const u = snap.val();
  if (!u) return;
  document.getElementById("modal-user-title").textContent = "Editar pessoa";
  document.getElementById("user-id").value = id;
  document.getElementById("user-nome").value = u.nome || "";
  document.getElementById("user-nasc").value = formatNascDisplay(normalizeNasc(u.nasc));
  document.getElementById("user-role").value = (u.role === "membro" ? "servo" : (u.role || "servo"));
  document.getElementById("modal-user").classList.remove("hidden");
};

window.deleteUser = async function (id) {
  if (!confirm("Excluir esta pessoa?")) return;
  if (!db || !isAdmin()) return;
  try {
    await db.ref("users/" + id).remove();
    loadUsers();
  } catch (e) {
    alert("Não deu para excluir. Tente de novo.");
  }
};


/* ========== print.js ========== */

/* Acolytus — impressão no modelo oficial */
function openPrint(bodyHtml) {
  const area = document.getElementById("print-area");
  const body = document.getElementById("print-body");
  if (!area || !body) return;
  body.innerHTML = bodyHtml;
  area.setAttribute("aria-hidden", "false");
  const imgs = area.querySelectorAll("img");
  let pending = 0;
  const doPrint = () => setTimeout(() => window.print(), 80);
  imgs.forEach((img) => {
    if (!img.complete) {
      pending++;
      img.onload = img.onerror = () => {
        pending--;
        if (pending <= 0) doPrint();
      };
    }
  });
  if (pending === 0) doPrint();
}


/* ========== main.js ========== */

/* Acolytus — inicialização */
function hideLoadingAndStart() {
  const loading = document.getElementById("loading");
  if (loading) loading.classList.add("hidden");
  const saved = sessionStorage.getItem("acolytus_user");
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      showApp();
      return;
    } catch (_) {}
  }
  showLogin();
}

document.addEventListener("DOMContentLoaded", () => {
  try {
    initFirebase();
    setupUppercase();
    setupDateMask();
    setupLogin();
    setupNavigation();
    setupNavCards();
    setupDate();
    setupLogout();
    setupUsersUI();
    setupAvisosUI();
    setupCalendarUI();
    setupMembrosUI();
    setupRelatoriosUI();
    setupMobileMenu();
    renderCalendar();
  } catch (err) {
    console.error("Erro ao iniciar:", err);
  }
  setTimeout(hideLoadingAndStart, 900);
});

setTimeout(() => {
  const loading = document.getElementById("loading");
  if (loading && !loading.classList.contains("hidden")) {
    hideLoadingAndStart();
  }
}, 4000);
