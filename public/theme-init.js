/* Tema salvo (chave "oficina.theme" no localStorage): aplica antes do primeiro desenho, sem flash.
   Sem valor salvo, segue o tema escuro padrão. Arquivo externo porque a CSP proíbe script inline. */
try {
  if (localStorage.getItem('oficina.theme') === 'pastel') {
    document.documentElement.setAttribute('data-theme', 'pastel');
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#F7F5FA');
  }
} catch (e) { /* localStorage indisponível: segue o escuro */ }
