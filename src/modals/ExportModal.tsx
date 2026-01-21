import React, { useState, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LedgerEntry, WorkOrder, MONTH_NAMES } from '../types'; // Importando direto de 'types'

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  defaultPath: string;
  Money: { toFloat: (val: number) => number };
  SoundFX: { success: () => void; error: () => void };
}

export const ExportModal: React.FC<ExportModalProps> = ({ 
  isOpen, onClose, ledger, workOrders, defaultPath, Money, SoundFX 
}) => {
  const [targetMonth, setTargetMonth] = useState("");
  const [exportPath, setExportPath] = useState(defaultPath);
  const [isExporting, setIsExporting] = useState(false);

  // Calcula os meses disponíveis baseado no histórico
  const availableMonths = useMemo(() => {
    const dates = new Set<string>();
    ledger.forEach(e => {
        const d = new Date(e.effectiveDate);
        if (!isNaN(d.getTime())) {
           dates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
    });
    if (dates.size === 0) {
        const now = new Date();
        dates.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    }
    return Array.from(dates).sort().reverse();
  }, [ledger]);

  // Define o mês padrão ao abrir
  useEffect(() => {
     if (isOpen && availableMonths.length > 0 && !targetMonth) {
         setTargetMonth(availableMonths[0]);
     }
  }, [isOpen, availableMonths, targetMonth]);

  const handleExport = async () => {
    if (!targetMonth) return;
    setIsExporting(true);

    const [yearStr, monthStr] = targetMonth.split('-');
    const targetYear = parseInt(yearStr);
    const mIndex = parseInt(monthStr);

    // Filtra dados do mês selecionado
    const filteredLedger = ledger.filter(e => {
        const d = new Date(e.effectiveDate);
        return d.getFullYear() === targetYear && (d.getMonth() + 1) === mIndex;
    });

    if (filteredLedger.length === 0) { 
        alert("Sem dados neste mês."); 
        setIsExporting(false); 
        return; 
    }

    // Gera o conteúdo do CSV
    const headers = ["ID", "Data", "Data Registro", "Data Pagamento", "Nº OS", "Cliente", "Descricao", "Valor", "Tipo", "Auditado"];
    const rows = filteredLedger.map(entry => {
      // CORREÇÃO AQUI: Garante que 'history' seja um array, mesmo que undefined
      const safeHistory = entry.history || [];
      
      const valor = Money.toFloat(entry.amount).toFixed(2).replace('.', ',');
      const audit = safeHistory.length > 0 ? "SIM" : "NAO";
      const desc = entry.description.replace(/;/g, " - ");
      
      const dataCompetencia = new Date(entry.effectiveDate).toLocaleDateString();
      // Pega a data do primeiro registro do histórico ou usa a competência se não houver
      const dataRegistro = safeHistory.length > 0 
          ? new Date(safeHistory[0].timestamp).toLocaleDateString() 
          : dataCompetencia;
      
      // Cruza com dados da OS (se houver vínculo)
      const relatedOS = workOrders.find(w => w.financialId === entry.id);
      const osNum = relatedOS ? relatedOS.osNumber.toString() : "";
      const client = relatedOS ? relatedOS.clientName.replace(/;/g, " ") : ""; 
      
      // 🆕 NOVA COLUNA: Data de Pagamento
      const dataPagamento = relatedOS?.paymentDate 
        ? new Date(relatedOS.paymentDate).toLocaleDateString() 
        : "";
      
      return `${entry.id.slice(0,8)};${dataCompetencia};${dataRegistro};${dataPagamento};${osNum};${client};${desc};${valor};${entry.type};${audit}`;
    });
    
    const csvContent = [headers.join(";"), ...rows].join("\n");
    const filename = `Fluxo_${MONTH_NAMES[mIndex - 1]}_${targetYear}_${Date.now()}.csv`;

    try {
      // Chama o comando Rust para salvar o arquivo
      const res = await invoke<{success: boolean, message: string}>('export_report', { 
        targetFolder: exportPath, 
        filename, 
        content: csvContent 
      });
      
      if (res && res.success) {
        SoundFX.success();
        alert(`Sucesso!\n${res.message}`);
        onClose();
      } else {
        throw new Error(res?.message);
      }
    } catch (e: any) { 
        SoundFX.error();
        alert("Erro ao exportar: " + e.toString()); 
    } finally {
        setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
        <div className="modal-content" style={{width: 500}}>
            <h2 className="modal-title">Exportar Financeiro</h2>
            
            <div className="form-group">
                <label className="form-label">Mês de Referência</label>
                <select className="form-input" value={targetMonth} onChange={e => setTargetMonth(e.target.value)}>
                    {availableMonths.map(dateStr => { 
                        const [y, m] = dateStr.split('-'); 
                        // Uso do MONTH_NAMES importado dos types
                        const monthName = MONTH_NAMES[parseInt(m)-1] || "Mês Inválido";
                        return (<option key={dateStr} value={dateStr}>{monthName} / {y}</option>); 
                    })}
                </select>
            </div>

            <div className="form-group">
                <label className="form-label">Pasta de Destino</label>
                <input className="form-input" value={exportPath} onChange={e => setExportPath(e.target.value)}/>
            </div>

            <div className="modal-actions">
                <button className="btn-secondary" onClick={onClose}>Cancelar</button>
                <button className="btn" onClick={handleExport} disabled={isExporting}>
                    {isExporting ? <span className="spinner"></span> : 'Exportar CSV'}
                </button>
            </div>
        </div>
    </div>
  );
};