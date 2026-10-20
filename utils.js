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
