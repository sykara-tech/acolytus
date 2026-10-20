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
