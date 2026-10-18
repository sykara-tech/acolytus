# Acolytus

Pastoral dos Coroinhas, Acólitos e Guardiãs — Capela Nossa Senhora de Nazaré

## Login

- **Nome completo** + **data de nascimento** (senha no formato DD/MM/AAAA)
- Admin inicial: **GUILHERME PEREIRA BATISTA** — **22/07/2009**

## Firebase

Database URL configurada:
`https://acolytus-3ae68-default-rtdb.firebaseio.com`

No Firebase Console, em Realtime Database → Regras, use regras que permitam leitura/escrita
(ou restrinja conforme necessário). Exemplo para testes:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Estrutura:
- `users` — { nome, nasc (DDMMAAAA), role }
- `avisos` — { titulo, texto, autor, createdAt }

## Pastas Drive

Cada seção (Escalas, Atas, Liturgia, Finanças, Diversos) tem:
- Visualização da pasta
- **Abrir no Drive**
- **Enviar arquivo** (abre a pasta no Drive para upload)

As pastas precisam estar compartilhadas com permissão de edição para quem for enviar arquivos.

## Arquivos

```
acolytus/
├── index.html
├── styles.css
├── app.js
├── brasao.png
└── README.md
```

Abra o `index.html` no navegador ou hospede a pasta.
