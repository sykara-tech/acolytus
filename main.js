/* Acolytus — inicialização */
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
  setupMembrosUI();
  setupRelatoriosUI();
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
