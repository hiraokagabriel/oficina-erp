import React, { useState, useEffect, useRef } from 'react';
import { WorkOrder, OSStatus, STATUS_LABELS } from '../types';

interface ProcessPageProps {
  workOrders: WorkOrder[];
  onOpenNew: () => void;
  onUpdateStatus: (id: string, newStatus: OSStatus) => void;
}

type SortKey = 'osNumber' | 'clientName' | 'createdAt';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

// Estado inicial: Cada grupo começa ordenado por data (mais recente primeiro)
const INITIAL_SORT_STATE: Record<OSStatus, SortConfig> = {
  ORCAMENTO: { key: 'createdAt', direction: 'desc' },
  APROVADO: { key: 'createdAt', direction: 'desc' },
  EM_SERVICO: { key: 'createdAt', direction: 'desc' },
  FINALIZADO: { key: 'createdAt', direction: 'desc' },
  ARQUIVADO: { key: 'createdAt', direction: 'desc' }
};

export const ProcessPage: React.FC<ProcessPageProps> = ({ workOrders, onOpenNew, onUpdateStatus }) => {
  // Estado para ordenação independente por grupo
  const [sortConfigs, setSortConfigs] = useState<Record<OSStatus, SortConfig>>(INITIAL_SORT_STATE);
  
  // Estado para controlar qual dropdown está aberto (ID da OS)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  
  // Referência para detectar cliques fora do menu
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha o menu se clicar fora dele
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lógica de Ordenação
  const handleSort = (status: OSStatus, key: SortKey) => {
    setSortConfigs(prev => {
      const current = prev[status];
      const isSameKey = current.key === key;
      return {
        ...prev,
        [status]: {
          key,
          direction: isSameKey && current.direction === 'desc' ? 'asc' : 'desc'
        }
      };
    });
  };

  const sortData = (list: WorkOrder[], config: SortConfig) => {
    return [...list].sort((a, b) => {
      let valA: any = a[config.key];
      let valB: any = b[config.key];

      if (config.key === 'createdAt') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return config.direction === 'asc' ? -1 : 1;
      if (valA > valB) return config.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // Componente visual do ícone de ordenação
  const SortIcon = ({ status, colKey }: { status: OSStatus, colKey: SortKey }) => {
    const config = sortConfigs[status];
    if (config.key !== colKey) return <span style={{ opacity: 0.3, marginLeft: 5 }}>↕</span>;
    return <span style={{ marginLeft: 5 }}>{config.direction === 'asc' ? '⬆' : '⬇'}</span>;
  };

  const groups: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'FINALIZADO'];
  const allStatuses: OSStatus[] = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'FINALIZADO'];

  return (
    <>
      <div className="header-area">
        <h1 className="page-title">Gestão de Processos</h1>
        <button className="btn" onClick={onOpenNew}>+ Novo Processo</button>
      </div>

      <div className="process-view">
        {groups.map(status => {
          const filtered = workOrders.filter(os => os.status === status);
          
          // Opcional: Se quiser esconder grupos vazios, descomente a linha abaixo
          // if (filtered.length === 0) return null;

          const sortedList = sortData(filtered, sortConfigs[status]);

          return (
            <div key={status} className="process-group">
               {/* Cabeçalho do Grupo (Aba Colorida) */}
               <div className={`process-group-header status-${status}`}>
                   <span>{STATUS_LABELS[status]}</span>
                   <span className="count-badge">{filtered.length}</span>
               </div>
               
               {/* Tabela do Grupo */}
               <div className="card" style={{ padding: 0, overflow: 'visible', borderTopLeftRadius: 0, marginTop: -1 }}>
                   <table className="process-table">
                       <thead>
                           <tr>
                               <th style={{ width: '15%' }} onClick={() => handleSort(status, 'osNumber')} className="sortable-th"> 
                                Nº OS <SortIcon status={status} colKey="osNumber" />
                                </th>
                               <th onClick={() => handleSort(status, 'clientName')} className="sortable-th">
                                 Cliente / Veículo <SortIcon status={status} colKey="clientName"/>
                               </th>
                               <th style={{ width: '20%' }} onClick={() => handleSort(status, 'createdAt')} className="sortable-th">
                                Data <SortIcon status={status} colKey="createdAt" />
                                </th>
                               <th style={{ width: '20%' }}>Status (Alterar)</th>
                           </tr>
                       </thead>
                       <tbody>
                           {sortedList.length === 0 ? (
                               <tr>
                                   <td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                                       Nenhum item neste status.
                                   </td>
                               </tr>
                           ) : (
                               sortedList.map(os => (
                                   <tr key={os.id} className="process-row">
                                       <td>
                                           <span className="os-number">#{os.osNumber}</span>
                                       </td>
                                       <td>
                                           <div className="cell-primary">{os.clientName}</div>
                                           <div className="cell-secondary">{os.vehicle}</div>
                                       </td>
                                       <td className="cell-secondary">
                                           {new Date(os.createdAt).toLocaleDateString()}
                                       </td>
                                       
                                       {/* Célula de Status com Dropdown */}
                                       <td className="status-cell">
                                           <span 
                                              className={`status-badge st-${os.status} clickable`}
                                              onClick={(e) => {
                                                  e.stopPropagation();
                                                  // Abre ou fecha o menu deste item
                                                  setOpenDropdownId(openDropdownId === os.id ? null : os.id);
                                              }}
                                           >
                                               {STATUS_LABELS[os.status]} 
                                               <span className="dropdown-arrow">▼</span>
                                           </span>

                                           {/* Menu Dropdown Condicional */}
                                           {openDropdownId === os.id && (
                                               <div className="status-dropdown-menu" ref={dropdownRef}>
                                                   {allStatuses.map(optStatus => (
                                                       <div 
                                                          key={optStatus}
                                                          className={`status-option ${optStatus === os.status ? 'selected' : ''}`}
                                                          onClick={() => {
                                                              onUpdateStatus(os.id, optStatus);
                                                              setOpenDropdownId(null);
                                                          }}
                                                       >
                                                           {optStatus === os.status && <span>✓</span>}
                                                           {STATUS_LABELS[optStatus]}
                                                       </div>
                                                   ))}
                                               </div>
                                           )}
                                       </td>
                                   </tr>
                               ))
                           )}
                       </tbody>
                   </table>
               </div>
            </div>
          );
        })}

        {workOrders.length === 0 && (
            <div className="card" style={{textAlign: 'center', padding: 40, color: 'var(--text-muted)'}}>
                Nenhum processo cadastrado no sistema.
            </div>
        )}
      </div>
    </>
  );
};