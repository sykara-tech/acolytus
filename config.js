/* Acolytus — configuração e níveis de acesso */
const firebaseConfig = {
  databaseURL: "https://acolytus-3ae68-default-rtdb.firebaseio.com"
};

let db = null;
let currentUser = null;
let membrosCache = [];
let relatoriosCache = [];
let selectedMembroId = null;

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
  membros: "Membros",
  relatorios: "Relatórios",
  avisos: "Avisos",
  usuarios: "Quem pode entrar"
};

/* admin = tudo | coordenador = tudo menos usuários e editar calendário | servo = escalas, liturgia, calendário (ver), avisos */
function getRole() {
  const r = (currentUser && currentUser.role) || "servo";
  if (r === "membro") return "servo";
  return r;
}
function isAdmin() { return getRole() === "admin"; }
function isCoordUp() { return getRole() === "admin" || getRole() === "coordenador"; }
function isServo() { return getRole() === "servo"; }

const SERVO_SECTIONS = new Set(["inicio", "escalas", "liturgia", "avisos"]);
const ROLE_LABEL = {
  admin: "Administrador",
  coordenador: "Coordenador",
  servo: "Servo",
  membro: "Servo"
};
