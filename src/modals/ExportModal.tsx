import React, { useState } from 'react';
import { LedgerEntry, WorkOrder } from '../types';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledger: LedgerEntry[];
  workOrders: WorkOrder[];
  defaultPath: string;
  Money: { format: (val: number) => string };
  SoundFX: { success: () => void; error: () => void };
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  ledger,
  workOrders,
  defaultPath: _defaultPath, // ✅ Prefixo com _ indica parâmetro não utilizado
  Money,
  SoundFX
}) => {
  const [selectedType, setSelectedType] = useState<'LEDGER' | 'WORK_ORDERS'>('LEDGER');
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  const handleExport = () => {
    try {
      let data: any[] = [];
      let headers: string[] = [];
      let filename = '';

      if (selectedType === 'LEDGER') {
        const filtered = ledger.filter(e => {
          const date = new Date(e.effectiveDate);
          return date >= new Date(startDate) && date <= new Date(endDate);
        });

        headers = ['Data', 'Descrição', 'Tipo', 'Valor', 'Criado Em', 'Parcela', 'Total Parcelas', 'Última Modificação'];
        data = filtered.map(e => {
          const safeHistory = e.history || [];
          return {
            'Data': new Date(e.effectiveDate).toLocaleDateString('pt-BR'),
            'Descrição': e.description,
            'Tipo': e.type === 'CREDIT' ? 'Receita' : 'Despesa',
            'Valor': Money.format(e.amount),
            'Criado Em': new Date(e.createdAt).toLocaleDateString('pt-BR'),
            'Parcela': e.installmentNumber ? `${e.installmentNumber}/${e.totalInstallments}` : '-',
            'Total Parcelas': e.totalInstallments || '-',
            'Última Modificação': safeHistory.length > 0 && safeHistory[0].timestamp
              ? new Date(safeHistory[0].timestamp).toLocaleDateString()
              : '-'
          };
        });
        filename = `lancamentos_${startDate}_${endDate}.csv`;
      } else {
        const filtered = workOrders.filter(w => {
          const date = new Date(w.createdAt);
          return date >= new Date(startDate) && date <= new Date(endDate);
        });

        headers = ['OS', 'Cliente', 'Veículo', 'Status', 'Total', 'Criado Em'];
        data = filtered.map(w => ({
          'OS': `#${w.osNumber}`,
          'Cliente': w.clientName,
          'Veículo': w.vehicle,
          'Status': w.status,
          'Total': Money.format(w.total),
          'Criado Em': new Date(w.createdAt).toLocaleDateString('pt-BR')
        }));
        filename = `ordens_servico_${startDate}_${endDate}.csv`;
      }

      const csvContent = [
        headers.join(';'),
        ...data.map(row => headers.map(h => row[h]).join(';'))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();

      SoundFX.success();
      onClose();
    } catch (error) {
      console.error('Erro ao exportar:', error);
      SoundFX.error();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>📊 Exportar Dados</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '24px' }}>
          <div style={{ marginBottom: '24px' }}>
            <label className="form-label">Tipo de Exportação</label>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className={`btn ${selectedType === 'LEDGER' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedType('LEDGER')}
                style={{ flex: 1 }}
              >
                💰 Lançamentos
              </button>
              <button
                className={`btn ${selectedType === 'WORK_ORDERS' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedType('WORK_ORDERS')}
                style={{ flex: 1 }}
              >
                🔧 Ordens de Serviço
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="form-label">Data Inicial</label>
            <input
              type="date"
              className="form-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="form-label">Data Final</label>
            <input
              type="date"
              className="form-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleExport}>
            💾 Exportar CSV
          </button>
        </div>
      </div>
    </div>
  );
};