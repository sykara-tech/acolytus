/* ============================================
   ACOLYTUS — Firebase RTDB + login por data nasc.
   ============================================ */

const firebaseConfig = {
  databaseURL: "https://acolytus-3ae68-default-rtdb.firebaseio.com"
};

let db = null;
let currentUser = null;

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
  avisos: "Avisos",
  usuarios: "Usuários",
  sobre: "Sobre"
};

/* ——— Init ——— */
document.addEventListener("DOMContentLoaded", () => {
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
  setupMobileMenu();
  renderCalendar();

  setTimeout(() => {
    document.getElementById("loading").classList.add("hidden");
    const saved = sessionStorage.getItem("acolytus_user");
    if (saved) {
      try {
        currentUser = JSON.parse(saved);
        showApp();
      } catch {
        showLogin();
      }
    } else {
      showLogin();
    }
  }, 1300);
});

function initFirebase() {
  try {
    if (!window.firebase || !firebase.database) {
      setFirebaseStatus("Firebase não carregou. Verifique sua conexão com a internet.", "error");
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    // O estado conectado/desconectado ajuda a diferenciar falha de rede de falha nas regras.
    db.ref(".info/connected").on("value", (snap) => {
      setFirebaseStatus(
        snap.val() === true
          ? "Conectado ao Firebase. Os dados podem ser sincronizados."
          : "Sem conexão com o Firebase. Verifique a internet e as regras do Realtime Database.",
        snap.val() === true ? "ok" : "warning"
      );
    });
    ensureAdminExists();
  } catch (e) {
    console.error("Firebase:", e);
    setFirebaseStatus("Não foi possível iniciar o Firebase: " + (e.message || e), "error");
  }
}

function setFirebaseStatus(message, state = "warning") {
  const el = document.getElementById("firebase-status");
  if (!el) return;
  el.textContent = message;
  el.dataset.state = state;
  el.classList.remove("hidden");
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

/* ——— Normalização ——— */
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
  if (digits.length === 8) return digits;
  return digits;
}

function formatNascDisplay(digits) {
  if (!digits || digits.length !== 8) return digits || "—";
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}


/* Força maiúsculas em todos os campos de texto */
function setupUppercase() {
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (el.type === "password" || el.type === "email" || el.type === "url" || el.type === "file" || el.type === "checkbox" || el.type === "radio" || el.type === "hidden") return;
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

/* Máscara DD/MM/AAAA */
function setupDateMask() {
  const inputs = ["login-nasc", "user-nasc"];
  inputs.forEach((id) => {
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

/* ——— Login ——— */
function setupLogin() {
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("login-nome").value.trim();
    const nascRaw = document.getElementById("login-nasc").value;
    const nasc = normalizeNasc(nascRaw);
    const errEl = document.getElementById("login-error");

    if (!nome || nasc.length !== 8) {
      errEl.textContent = "Preencha o nome e a data no formato DD/MM/AAAA.";
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
        errEl.textContent = "Nome ou data de nascimento incorretos.";
        errEl.classList.remove("hidden");
        return;
      }
      currentUser = user;
      sessionStorage.setItem("acolytus_user", JSON.stringify(user));
      showApp();
    } catch (err) {
      console.error(err);
      // Fallback admin offline
      if (
        normalizeName(nome) === normalizeName(ADMIN_SEED.nome) &&
        nasc === ADMIN_SEED.nasc
      ) {
        currentUser = { ...ADMIN_SEED, id: "local-admin" };
        sessionStorage.setItem("acolytus_user", JSON.stringify(currentUser));
        showApp();
      } else {
        errEl.textContent = "Erro de conexão. Tente novamente.";
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
      return { id, nome: u.nome, nasc: u.nasc, role: u.role || "membro" };
    }
  }
  // Admin seed match even if not in DB yet
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

  const isAdmin = currentUser.role === "admin";
  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.toggle("hidden", !isAdmin);
  });

  loadAvisos();
  loadCalendar();
  if (isAdmin) loadUsers();
}

function setupLogout() {
  document.getElementById("btn-logout").addEventListener("click", () => {
    currentUser = null;
    sessionStorage.removeItem("acolytus_user");
    showLogin();
    document.getElementById("login-form").reset();
  });
}

/* ——— Navegação ——— */
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
  if (section === "usuarios" && currentUser?.role !== "admin") return;

  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
  document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add("active");

  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.getElementById(`section-${section}`)?.classList.add("active");

  document.getElementById("page-title").textContent = titles[section] || section;
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (section === "usuarios") loadUsers();
  if (section === "avisos") loadAvisos();
  if (section === "inicio") loadCalendar();
}

window.navigateTo = navigateTo;

function setupDate() {
  document.getElementById("current-date").textContent = new Date().toLocaleDateString(
    "pt-BR",
    { weekday: "long", year: "numeric", month: "long", day: "numeric" }
  );
}

/* ——— Usuários (admin) ——— */
function setupUsersUI() {
  document.getElementById("btn-add-user")?.addEventListener("click", () => {
    document.getElementById("modal-user-title").textContent = "Criar usuário";
    document.getElementById("form-user").reset();
    document.getElementById("user-id").value = "";
    document.getElementById("modal-user").classList.remove("hidden");
  });

  document.getElementById("btn-cancel-user")?.addEventListener("click", () => {
    document.getElementById("modal-user").classList.add("hidden");
  });

  document.getElementById("form-user")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("user-id").value;
    const nome = document.getElementById("user-nome").value.trim();
    const nasc = normalizeNasc(document.getElementById("user-nasc").value);
    const role = document.getElementById("user-role").value;

    if (nasc.length !== 8) {
      alert("Data de nascimento inválida. Use DD/MM/AAAA.");
      return;
    }
    if (!db) {
      alert("Firebase não disponível.");
      return;
    }

    const data = { nome, nasc, role, updatedAt: Date.now() };
    try {
      if (id) {
        await db.ref("users/" + id).update(data);
      } else {
        data.createdAt = Date.now();
        await db.ref("users").push(data);
      }
      document.getElementById("modal-user").classList.add("hidden");
      loadUsers();
    } catch (err) {
      alert("Erro ao salvar: " + err.message);
    }
  });
}

async function loadUsers() {
  const tbody = document.getElementById("users-tbody");
  if (!tbody || !db) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">Firebase indisponível</td></tr>';
    return;
  }
  try {
    const snap = await db.ref("users").once("value");
    const users = snap.val() || {};
    const rows = Object.entries(users);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Nenhum usuário</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        ([id, u]) => `
      <tr>
        <td>${escapeHtml(u.nome)}</td>
        <td>${formatNascDisplay(normalizeNasc(u.nasc))}</td>
        <td>${u.role === "admin" ? "Administrador" : "Membro"}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="editUser('${id}')">Editar</button>
          <button class="btn btn-danger" onclick="deleteUser('${id}')">Excluir</button>
        </td>
      </tr>`
      )
      .join("");
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="4">Erro ao carregar</td></tr>';
  }
}

window.editUser = async function (id) {
  if (!db) return;
  const snap = await db.ref("users/" + id).once("value");
  const u = snap.val();
  if (!u) return;
  document.getElementById("modal-user-title").textContent = "Editar usuário";
  document.getElementById("user-id").value = id;
  document.getElementById("user-nome").value = u.nome || "";
  document.getElementById("user-nasc").value = formatNascDisplay(normalizeNasc(u.nasc));
  document.getElementById("user-role").value = u.role || "membro";
  document.getElementById("modal-user").classList.remove("hidden");
};

window.deleteUser = async function (id) {
  if (!confirm("Excluir este usuário?")) return;
  if (!db) return;
  try {
    await db.ref("users/" + id).remove();
    loadUsers();
  } catch (e) {
    alert("Erro ao excluir: " + e.message);
  }
};

/* ——— Avisos ——— */
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
    if (!db || currentUser?.role !== "admin") return;
    const titulo = document.getElementById("aviso-titulo").value.trim();
    const texto = document.getElementById("aviso-texto").value.trim();
    try {
      await db.ref("avisos").push({
        titulo,
        texto,
        autor: currentUser.nome,
        createdAt: Date.now()
      });
      document.getElementById("modal-aviso").classList.add("hidden");
      loadAvisos();
    } catch (err) {
      alert("Erro: " + err.message);
    }
  });
}

async function loadAvisos() {
  const list = document.getElementById("avisos-list");
  if (!list) return;
  if (!db) {
    list.innerHTML = '<p class="empty-msg">Avisos indisponíveis offline.</p>';
    return;
  }
  try {
    const snap = await db.ref("avisos").orderByChild("createdAt").once("value");
    const data = snap.val() || {};
    const items = Object.entries(data)
      .map(([id, a]) => ({ id, ...a }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!items.length) {
      list.innerHTML = '<p class="empty-msg">Nenhum aviso publicado.</p>';
      return;
    }

    const isAdmin = currentUser?.role === "admin";
    list.innerHTML = items
      .map(
        (a) => `
      <div class="aviso-item">
        <h4>${escapeHtml(a.titulo)}</h4>
        <p>${escapeHtml(a.texto)}</p>
        <div class="aviso-meta">
          ${a.autor ? escapeHtml(a.autor) + " · " : ""}${formatDate(a.createdAt)}
          ${isAdmin ? ` · <button class="btn btn-danger" onclick="deleteAviso('${a.id}')" style="margin-left:6px">Excluir</button>` : ""}
        </div>
      </div>`
      )
      .join("");
  } catch (e) {
    list.innerHTML = '<p class="empty-msg">Erro ao carregar avisos.</p>';
  }
}

window.deleteAviso = async function (id) {
  if (!confirm("Excluir este aviso?")) return;
  if (!db) return;
  await db.ref("avisos/" + id).remove();
  loadAvisos();
};


/* Menu mobile */
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

/* ——— Calendário litúrgico ——— */
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
  solenidade: 1,
  festa: 2,
  memoria: 3,
  comemoracao: 4,
  proprio: 5,
  tempo: 6
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
let calViewMonth = new Date().getMonth(); // 0-11
let calEvents = [];
let calSelectedDate = null;

function setupCalendarUI() {
  document.getElementById("cal-prev")?.addEventListener("click", () => {
    calViewMonth--;
    if (calViewMonth < 0) {
      calViewMonth = 11;
      calViewYear--;
    }
    renderCalendar();
  });
  document.getElementById("cal-next")?.addEventListener("click", () => {
    calViewMonth++;
    if (calViewMonth > 11) {
      calViewMonth = 0;
      calViewYear++;
    }
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

  document.getElementById("btn-add-cal-event")?.addEventListener("click", () => openCalModal());
  document.getElementById("btn-cancel-cal")?.addEventListener("click", () => {
    document.getElementById("modal-cal").classList.add("hidden");
  });
  document.getElementById("btn-delete-cal")?.addEventListener("click", async () => {
    const id = document.getElementById("cal-event-id").value;
    if (!id || !confirm("Excluir este evento?")) return;
    if (!db) return;
    try {
      await db.ref("calendario/" + id).remove();
      document.getElementById("modal-cal").classList.add("hidden");
      await loadCalendar();
    } catch (err) {
      alert("Erro: " + err.message);
    }
  });

  document.getElementById("cal-tipo")?.addEventListener("change", (e) => {
    const def = CAL_TIPO_DEFAULT_COR[e.target.value];
    if (def) document.getElementById("cal-cor").value = def;
  });

  document.getElementById("form-cal")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!db) {
      alert("O Firebase não está disponível. O evento não foi salvo. Verifique a conexão e a configuração do Realtime Database.");
      return;
    }
    if (currentUser?.role !== "admin") {
      alert("Somente o administrador pode gerenciar o calendário.");
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
      alert("Preencha título e data de início.");
      return;
    }
    const parsedStart = new Date(inicio + "T12:00:00");
    if (Number.isNaN(parsedStart.getTime()) || toYMD(parsedStart) !== inicio) {
      alert("A data de início é inválida.");
      return;
    }
    if (fim) {
      const parsedEnd = new Date(fim + "T12:00:00");
      if (Number.isNaN(parsedEnd.getTime()) || toYMD(parsedEnd) !== fim) {
        alert("A data final é inválida.");
        return;
      }
    }
    if (fim < inicio) {
      alert("A data fim não pode ser anterior à data início.");
      return;
    }

    const data = {
      titulo,
      tipo,
      inicio,
      fim,
      cor,
      obs,
      updatedAt: Date.now(),
      autor: currentUser.nome
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Salvando..."; }
    try {
      if (id) {
        await db.ref("calendario/" + id).update(data);
      } else {
        data.createdAt = Date.now();
        await db.ref("calendario").push(data);
      }
      document.getElementById("modal-cal").classList.add("hidden");
      setFirebaseStatus("Evento salvo no Firebase com sucesso.", "ok");
      await loadCalendar();
      if (calSelectedDate) showDayDetail(calSelectedDate);
    } catch (err) {
      console.error("Erro ao salvar evento do calendário:", err);
      setFirebaseStatus("Falha ao salvar no Firebase: " + (err.message || err) + ". Confira as regras de leitura/gravação.", "error");
      alert("Não foi possível salvar o evento no Firebase.\n\n" + (err.message || err) + "\n\nConfira as regras do Realtime Database.");
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
  document.getElementById("modal-cal-title").textContent = event ? "Editar evento" : "Adicionar evento";
  document.getElementById("btn-delete-cal").classList.toggle("hidden", !event);

  if (event) {
    document.getElementById("cal-titulo").value = event.titulo || "";
    document.getElementById("cal-tipo").value = event.tipo || "festa";
    document.getElementById("cal-inicio").value = event.inicio || "";
    document.getElementById("cal-fim").value = event.fim && event.fim !== event.inicio ? event.fim : "";
    document.getElementById("cal-cor").value = event.cor || "branco";
    document.getElementById("cal-obs").value = event.obs || "";
  } else {
    const tipo = "festa";
    document.getElementById("cal-tipo").value = tipo;
    document.getElementById("cal-cor").value = CAL_TIPO_DEFAULT_COR[tipo];
    if (calSelectedDate) {
      document.getElementById("cal-inicio").value = calSelectedDate;
    }
  }
  modal.classList.remove("hidden");
}

window.editCalEvent = function (id) {
  const ev = calEvents.find((e) => e.id === id);
  if (ev) openCalModal(ev);
};

window.deleteCalEventFromList = async function (id) {
  if (!confirm("Excluir este evento?")) return;
  if (!db) return;
  try {
    await db.ref("calendario/" + id).remove();
    await loadCalendar();
    if (calSelectedDate) showDayDetail(calSelectedDate);
  } catch (err) {
    alert("Erro: " + err.message);
  }
};

async function loadCalendar() {
  if (!db) {
    calEvents = [];
    renderCalendar();
    setFirebaseStatus("Calendário exibido sem sincronização: Firebase indisponível.", "warning");
    return;
  }
  try {
    const snap = await db.ref("calendario").once("value");
    const data = snap.val() || {};
    calEvents = Object.entries(data)
      .filter(([, event]) => event && typeof event === "object")
      .map(([id, event]) => ({ id, ...event }));
    setFirebaseStatus("Calendário sincronizado. " + calEvents.length + " evento(s) carregado(s).", "ok");
  } catch (e) {
    console.error("Erro ao carregar calendário:", e);
    setFirebaseStatus("Não foi possível ler os eventos do Firebase: " + (e.message || e) + ". Confira as regras de leitura.", "error");
    calEvents = [];
  }
  renderCalendar();
  if (calSelectedDate) showDayDetail(calSelectedDate);
}

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const startDow = first.getDay(); // 0=Dom
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const prevDays = new Date(calViewYear, calViewMonth, 0).getDate();

  const todayYMD = toYMD(new Date());
  let html = "";

  // Dias do mês anterior
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

  // Preencher restante da grade (até 42 células = 6 semanas)
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

function calDayCell(day, ymd, other, todayYMD) {
  const evs = eventsOnDate(ymd);
  const isToday = ymd === todayYMD;
  const isSel = ymd === calSelectedDate;
  let cls = "cal-day";
  if (other) cls += " other-month";
  if (isToday) cls += " today";
  if (isSel) cls += " selected";

  const maxChips = 2;
  const chips = evs.slice(0, maxChips).map((e) => {
    const hex = CAL_COLORS[e.cor]?.hex || "#c9a227";
    return `<span class="cal-event-chip" style="background:${hex}" title="${escapeHtml(e.titulo)}">${escapeHtml(e.titulo)}</span>`;
  }).join("");
  const extra = evs.length > maxChips
    ? `<span class="cal-event-more">+${evs.length - maxChips}</span>`
    : "";

  const dots = evs.slice(0, 6).map((e) => {
    const hex = CAL_COLORS[e.cor]?.hex || "#c9a227";
    return `<span class="cal-dot" style="background:${hex}" title="${escapeHtml(e.titulo)}"></span>`;
  }).join("");

  return `<div class="${cls}" data-date="${ymd}" title="${evs.length ? evs.map((e) => e.titulo).join(" · ") : ""}">
    <span class="cal-day-num">${day}</span>
    <div class="cal-day-events">${chips}${extra}</div>
    <div class="cal-dots">${dots}</div>
  </div>`;
}

function showDayDetail(ymd) {
  const box = document.getElementById("cal-day-detail");
  const title = document.getElementById("cal-day-title");
  const list = document.getElementById("cal-day-events");
  if (!box || !title || !list) return;

  const [y, m, d] = ymd.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  title.textContent = dateObj.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const evs = eventsOnDate(ymd);
  const isAdmin = currentUser?.role === "admin";

  if (!evs.length) {
    list.innerHTML = '<li class="empty-msg" style="padding:4px 0">Nenhum evento neste dia.</li>';
  } else {
    list.innerHTML = evs
      .map((e) => {
        const hex = CAL_COLORS[e.cor]?.hex || "#c9a227";
        const corLabel = CAL_COLORS[e.cor]?.label || e.cor;
        const tipoLabel = CAL_TIPO_LABEL[e.tipo] || e.tipo;
        const range =
          e.fim && e.fim !== e.inicio
            ? `${formatYMD(e.inicio)} → ${formatYMD(e.fim)}`
            : formatYMD(e.inicio);
        return `<li class="cal-event-item" style="border-left-color:${hex}">
          <div class="ev-info">
            <div class="ev-title">${escapeHtml(e.titulo)}</div>
            <div class="ev-meta">${tipoLabel} · ${corLabel} · ${range}${e.obs ? " · " + escapeHtml(e.obs) : ""}</div>
          </div>
          ${
            isAdmin
              ? `<div class="ev-actions">
                  <button type="button" class="btn btn-outline btn-sm" onclick="editCalEvent('${e.id}')">Editar</button>
                  <button type="button" class="btn btn-danger btn-sm" onclick="deleteCalEventFromList('${e.id}')">Excluir</button>
                </div>`
              : ""
          }
        </li>`;
      })
      .join("");
  }

  box.classList.remove("hidden");
}

function formatYMD(ymd) {
  if (!ymd || ymd.length < 10) return ymd || "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/* ——— Utils ——— */
function formatDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("pt-BR");
  } catch {
    return "";
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
