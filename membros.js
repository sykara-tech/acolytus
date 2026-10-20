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
