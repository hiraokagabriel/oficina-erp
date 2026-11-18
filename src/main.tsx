import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installFileDropGuard } from "./utils/fileDropGuard";
// A IMPORTAÇÃO ABAIXO CARREGA O TEMA
import "./styles.css";
// DRAG AND DROP OVERHAUL CSS
import "./styles-dragdrop-overhaul.css";
// CRM TIMELINE CSS
import "./styles-crm-timeline.css";
// SCROLLBAR CUSTOMIZADA E DROPDOWN FIXES
import "./styles-scrollbar.css";
// PARTS PAGE STYLES
import "./styles-parts.css";
// PARTS PAGE PRINT STYLES (SEPARADO)
import "./styles-parts-print.css";
// 🆕 PART CATEGORY STYLES — Issue #41
import "./styles-part-categories.css";
// 🆕 CHECKLIST STYLES — Issue #43
import "./styles-checklist.css";

// CONTAS A RECEBER
import "./styles-receivables.css";

// PREVISÃO DE ENTREGA
import "./styles-schedule.css";

// AGENDA DE ENTRADA DE VEÍCULOS
import "./styles-agenda.css";
// RELATÓRIO DE MARGEM (aba do Financeiro)
import "./styles-margin-report.css";

// MARGEM (selo, indicador, análise do modal da OS)
import "./styles-margin.css";

// CAMPO DE VEÍCULO COM SUGESTÕES
import "./styles-vehicle.css";

// TOKENS DO SISTEMA VISUAL (antes de contraste e perf)
import "./styles-tokens.css";

// COMPONENTES BASE (botões, campo, chip, luz de status, janela, aviso, vazio, segmentado)
import "./styles-components.css";

// QUADRO DA OFICINA (colunas, cartão, filtros)
import "./styles-kanban.css";

// PAINEL HOJE
import "./styles-today.css";

// JANELA DA OS (seções)
import "./styles-osmodal.css";

// MODO CLIENTE (resumo do serviço em tela cheia)
import "./styles-client-summary.css";

// FOTOS DA OS (seção da janela, visualizador, galeria do cliente, câmera no cartão)
import "./styles-photos.css";

// DOCUMENTOS (janela de impressão e PDF)
import "./styles-documents.css";

// CONTRASTE WCAG AA (carregar por último)
import "./styles-contrast.css";

// PERFORMANCE: keyframes antes embutidos em <style> nos componentes
import "./styles-perf.css";

// Arquivo solto fora da área de fotos não pode fazer o WebView navegar até ele.
installFileDropGuard();

const rootEl = document.getElementById("root") as HTMLElement;

if (import.meta.env.VITE_CLOUD === "1") {
  // Modo nuvem (login, Supabase, IndexedDB): carregado só sob a flag, para o modo arquivo não puxar nada disso.
  void import("./auth/boot").then((m) => m.bootCloud(rootEl)).catch((e: unknown) => {
    // Sem internet e sem o programa em cache: o React ainda não existe, então o aviso é DOM puro.
    console.error("Falha ao carregar o modo nuvem:", e);
    rootEl.innerHTML = "";
    const box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.className = "lazy-error";
    const text = document.createElement("p");
    text.className = "lazy-error-text";
    text.textContent = "Não deu para abrir esta parte sem internet. Conecte e toque em Tentar de novo.";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = "Tentar de novo";
    btn.addEventListener("click", () => window.location.reload());
    box.append(text, btn);
    rootEl.append(box);
  });
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
