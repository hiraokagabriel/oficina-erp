// Preferências de tela guardadas neste PC (localStorage, como oficina_pdf_folder), fora do banco.

const SHOW_COSTS_KEY = 'oficina_os_show_costs';

/** Análise de lucro e margem da OS aberta? Padrão: recolhida (false) se não houver valor ou o armazenamento falhar. */
export function getShowCosts(): boolean {
  try {
    return localStorage.getItem(SHOW_COSTS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Grava a escolha. Devolve false se o navegador bloqueou o armazenamento. */
export function setShowCosts(v: boolean): boolean {
  try {
    localStorage.setItem(SHOW_COSTS_KEY, v ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}

const SHOW_COST_COLUMN_KEY = 'oficina_os_show_cost_column';

/** Caixa "Mostrar custos" da OS. Padrão: ligada (true) se não houver valor, o valor for estranho ou o armazenamento falhar. */
export function getShowCostColumn(): boolean {
  try {
    return localStorage.getItem(SHOW_COST_COLUMN_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Grava a escolha. Devolve false se o navegador bloqueou o armazenamento. */
export function setShowCostColumn(v: boolean): boolean {
  try {
    localStorage.setItem(SHOW_COST_COLUMN_KEY, v ? '1' : '0');
    return true;
  } catch {
    return false;
  }
}
