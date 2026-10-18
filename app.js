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
  setupMobileMenu();

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
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    ensureAdminExists();
  } catch (e) {
    console.warn("Firebase:", e);
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
