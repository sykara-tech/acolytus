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
