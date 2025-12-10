import React, { useState } from 'react';
import { WorkOrder, OSStatus } from '../utils/types';
import { STATUS_LABELS } from '../utils/format';

interface ProcessListProps {
  workOrders: WorkOrder[];
  isLoading: boolean;
  onUpdateStatus: (id: string, status: OSStatus) => void;
  onUpdateDate: (id: string, date: string) => void;
}

export const ProcessList: React.FC<ProcessListProps> = ({
  workOrders,
  isLoading,
  onUpdateStatus,
  onUpdateDate
}) => {
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: 'createdAt' | 'clientName' | 'osNumber', direction: 'asc' | 'desc' }>({ 
    key: 'createdAt', 
    direction: 'desc' 
  });

  const handleSort = (key: 'createdAt' | 'clientName' | 'osNumber') => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortConfig.key !== colKey) return <span className="sort-indicator">↕</span>;
    return <span className="sort-indicator">{sortConfig.direction === 'asc' ? '⬆' : '⬇'}</span>;
  };

  // Lógica de Renderização
  if (isLoading) {
    return (
      <div className="process-view">
        {[1, 2, 3].map(i => (
          <div key={i} className="process-group" style={{ padding: 20, background: 'var(--bg-panel)', borderRadius: 16, border: '1px solid var(--border)' }}>
            <div className="skeleton skeleton-text" style={{ width: '200px' }}></div>
            <div className="skeleton skeleton-block" style={{ height: '100px', marginTop: 15 }}></div>
          </div>
        ))}
      </div>
    );
  }

  // Agrupamento e Ordenação
  const groups: Record<OSStatus, WorkOrder[]> = { ORCAMENTO: [], APROVADO: [], EM_SERVICO: [], FINALIZADO: [] };
  
  const sortedOS = [...workOrders].sort((a, b) => {
    let valA: any = a[sortConfig.key];
    let valB: any = b[sortConfig.key];

    if (sortConfig.key === 'createdAt') {
      valA = new Date(a.createdAt).getTime();
      valB = new Date(b.createdAt).getTime();
    } else if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  sortedOS.forEach(os => {
    if (groups[os.status]) groups[os.status].push(os);
  });

  return (
    <div className="process-view">
      {Object.entries(groups).map(([statusKey, list]) => {
        const status = statusKey as OSStatus;
        if (list.length === 0) return null;

        return (
          <div key={status} className="process-group">
            <div className={`process-group-header status-${status}`}>
              <span>{STATUS_LABELS[status]}</span>
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', marginLeft: 8 }}>{list.length}</span>
            </div>

            <table className="process-table">
              <thead>
                <tr>
                  <th width="10%" onClick={() => handleSort('osNumber')} className={sortConfig.key === 'osNumber' ? 'sort-active' : ''}>Nº <SortIcon colKey='osNumber' /></th>
                  <th width="40%" onClick={() => handleSort('clientName')} className={sortConfig.key === 'clientName' ? 'sort-active' : ''}>Cliente / Veículo <SortIcon colKey='clientName' /></th>
                  <th width="20%" onClick={() => handleSort('createdAt')} className={sortConfig.key === 'createdAt' ? 'sort-active' : ''}>Data <SortIcon colKey='createdAt' /></th>
                  <th width="30%">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map(os => (
                  <tr key={os.id} className="process-row">
                    <td><div className="os-number">#{os.osNumber}</div></td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{os.clientName}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{os.vehicle}</div>
                    </td>
                    <td>
                      <input
                        type="date"
                        className="inline-date-input"
                        value={new Date(os.createdAt).toISOString().split('T')[0]}
                        onChange={(e) => onUpdateDate(os.id, e.target.value)}
                      />
                    </td>
                    <td style={{ position: 'relative' }}>
                      <div
                        className={`status-badge st-${os.status}`}
                        onClick={() => setEditingStatusId(editingStatusId === os.id ? null : os.id)}
                      >
                        {STATUS_LABELS[os.status]} ▾
                      </div>
                      {editingStatusId === os.id && (
                        <div className="status-dropdown">
                          {(Object.keys(STATUS_LABELS) as OSStatus[]).map(s => (
                            <div
                              key={s}
                              className={`status-option ${s === os.status ? 'active' : ''}`}
                              onClick={() => {
                                onUpdateStatus(os.id, s);
                                setEditingStatusId(null);
                              }}
                            >
                              {STATUS_LABELS[s]}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};