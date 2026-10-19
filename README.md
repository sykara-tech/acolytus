# Acolytus — versão corrigida

## O que foi corrigido
- O calendário agora é desenhado imediatamente ao abrir a página, mesmo antes da resposta do Firebase.
- A navegação de mês e o botão **Hoje** continuam funcionando sem depender da leitura do banco.
- Foi incluído um indicador visível de conexão/sincronização do Firebase.
- Falhas de leitura e gravação agora exibem mensagens úteis em vez de parecer que o evento foi salvo.
- O formulário de evento valida as datas, impede intervalo invertido e mostra estado “Salvando...”.
- A inicialização do Firebase evita inicializar o mesmo app duas vezes.
- Melhorias de visualização do calendário em telas pequenas.

## Importante: validar o Firebase
O projeto usa o Realtime Database em:
`https://acolytus-3ae68-default-rtdb.firebaseio.com`

A página só conseguirá salvar se esse banco existir, estiver ativo e suas **Realtime Database Rules** autorizarem as operações. A aplicação não consegue corrigir regras do Firebase remotamente.

1. Abra o Firebase Console e selecione o projeto que contém esse banco.
2. Entre em **Realtime Database → Rules**.
3. Confira se as regras permitem, de forma segura, as operações necessárias para `users`, `calendario` e `avisos`.
4. Publique as regras e teste o sistema. Se aparecer `PERMISSION_DENIED`, o problema está nas regras/permissões, não no desenho do calendário.
5. Hospede o site em HTTPS (por exemplo, Firebase Hosting). Não use `file://` para o teste final.

**Segurança:** não publique regras que liberem leitura e gravação para qualquer pessoa. Este projeto usa nome e data de nascimento como credencial e armazena esses dados no banco; isso não equivale a autenticação segura. Antes de usar com dados reais de menores, migre o login para Firebase Authentication e restrinja as regras por usuário/role. Não reutilize a data de nascimento como senha.

## Teste rápido
- Abra `index.html` pelo servidor de hospedagem.
- Entre com uma conta administradora já cadastrada.
- Verifique o indicador Firebase no cartão do calendário.
- Clique em **Adicionar evento**, preencha título e datas e salve.
- Recarregue a página: o evento deve continuar no calendário se foi persistido no banco.
- Se houver erro, leia o texto do indicador; `PERMISSION_DENIED` indica regra/permissão, e desconexão indica rede/configuração.

## Arquivos
- `index.html`: interface
- `styles.css`: estilos
- `app.js`: lógica do sistema e Firebase
- `brasao.png`: brasão usado pela interface
