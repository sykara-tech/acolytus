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
