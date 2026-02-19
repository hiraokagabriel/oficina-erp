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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
