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
