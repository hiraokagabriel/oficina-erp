import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
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

// CONTRASTE WCAG AA (carregar por último)
import "./styles-contrast.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
