import React from "react";
import ReactDOM from "react-dom/client";
import AppWrapper from "./AppWrapper";
// A IMPORTAÇÃO ABAIXO CARREGA O TEMA
import "./styles.css";
// DRAG AND DROP OVERHAUL CSS
import "./styles-dragdrop-overhaul.css";
// CRM TIMELINE CSS
import "./styles-crm-timeline.css";
// SCROLLBAR CUSTOMIZADA E DROPDOWN FIXES
import "./styles-scrollbar.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>
);
