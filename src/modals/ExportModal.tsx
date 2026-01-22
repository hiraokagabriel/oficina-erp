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
  defaultPath: _defaultPath,
  Money,
  SoundFX
}) => {
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);

  if (!isOpen) return null;

  const handleExport = () => {
    try {
      // Filtra lançamentos no período
      const filteredLedger = ledger.filter(e => {
        const date = new Date(e.effectiveDate);
        return date >= new Date(startDate) && date <= new Date(endDate);
      });

      // Prepara dados unificados
      const data: any[] = [];

      // Adiciona cada lançamento
      filteredLedger.forEach(entry => {
        // Procura OS vinculada
        const linkedOS = workOrders.find(os => os.financialId === entry.id);

        data.push({
          'Número OS': linkedOS ? linkedOS.osNumber.toString() : '',
          'Cliente': linkedOS ? linkedOS.clientName : '',
          'Data Criação': linkedOS ? new Date(linkedOS.createdAt).toLocaleDateString('pt-BR') : '',
          'Veículo': linkedOS ? linkedOS.vehicle : '',
          'Km': linkedOS ? linkedOS.mileage.toString() : '',
          'Valor': Money.format(entry.amount),
          'Tipo': entry.type === 'CREDIT' ? 'Receita' : 'Despesa',
          'Data Pagamento': entry.paymentDate 
            ? new Date(entry.paymentDate).toLocaleDateString('pt-BR') 
            : '',
          'Descrição': entry.description,
          'Data Lançamento': new Date(entry.effectiveDate).toLocaleDateString('pt-BR')
        });
      });

      // Ordena por data de lançamento
      data.sort((a, b) => {
        const dateA = a['Data Lançamento'].split('/').reverse().join('-');
        const dateB = b['Data Lançamento'].split('/').reverse().join('-');
        return dateA.localeCompare(dateB);
      });

      const headers = [
        'Número OS',
        'Cliente', 
        'Data Criação',
        'Veículo',
        'Km',
        'Valor',
        'Tipo',
        'Data Pagamento',
        'Descrição',
        'Data Lançamento'
      ];

      const csvContent = [
        headers.join(';'),
        ...data.map(row => headers.map(h => row[h]).join(';'))
      ].join('\n');

      const filename = `relatorio_financeiro_${startDate}_${endDate}.csv`;
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
          <h2>📊 Exportar Relatório</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: '24px' }}>
          <div style={{ 
            marginBottom: '24px', 
            padding: '16px', 
            background: 'var(--bg-card)', 
            borderRadius: '8px',
            border: '1px solid var(--border)'
          }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
              📝 O relatório incluirá:
            </div>
            <ul style={{ 
              fontSize: '0.85rem', 
              color: 'var(--text-muted)', 
              margin: 0, 
              paddingLeft: '20px',
              lineHeight: '1.6'
            }}>
              <li>Número da OS (quando vinculada)</li>
              <li>Cliente e veículo da OS</li>
              <li>Data de criação da OS</li>
              <li>Quilometragem</li>
              <li>Valor e tipo (Receita/Despesa)</li>
              <li>Data de pagamento</li>
            </ul>
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