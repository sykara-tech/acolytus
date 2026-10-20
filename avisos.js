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
