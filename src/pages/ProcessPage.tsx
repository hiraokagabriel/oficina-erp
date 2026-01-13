import React, { useState } from 'react';
import { Button, Card, Badge, Input, EmptyState, Progress } from '../components/ui/PremiumComponents';
import { ProcessDefinition } from '../types';

interface ProcessPageProps {
  processes: ProcessDefinition[];
  isLoading: boolean;
  onAddProcess: () => void;
  onEditProcess: (process: ProcessDefinition) => void;
  onDeleteProcess: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}

export const ProcessPage: React.FC<ProcessPageProps> = ({
  processes,
  isLoading,
  onAddProcess,
  onEditProcess,
  onDeleteProcess,
  onToggleActive,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ATIVO' | 'INATIVO' | 'TODOS'>('TODOS');

  const filteredProcesses = processes
    .filter((p) => (filterStatus === 'TODOS' ? true : p.active === (filterStatus === 'ATIVO')))
    .filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()));

  const activeProcesses = processes.filter((p) => p.active).length;

  return (
    <div>
      {/* Header */}
      <div className="header-area">
        <div>
          <h1 className="page-title">⚙️ Processos</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
            {activeProcesses} ativos de {processes.length}
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={onAddProcess}>
          + Novo Processo
        </Button>
      </div>

      {/* Stats */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Card>
          <div style={{ padding: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Processos Ativos</span>
              <strong>{activeProcesses}/{processes.length}</strong>
            </div>
            <Progress value={activeProcesses} max={processes.length} color="primary" />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <Input
          placeholder="Pesquisar processo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, minWidth: '250px' }}
        />
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          {['TODOS', 'ATIVO', 'INATIVO'].map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? 'primary' : 'secondary'}
              onClick={() => setFilterStatus(status as any)}
              size="sm"
            >
              {status === 'TODOS' ? '📊 Todos' : status === 'ATIVO' ? '✅ Ativos' : '⏸️ Inativos'}
            </Button>
          ))}
        </div>
      </div>

      {/* Processes List */}
      {isLoading ? (
        <Card>Carregando processos...</Card>
      ) : filteredProcesses.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Nenhum Processo Encontrado"
          message="Nenhum processo corresponde aos seus filtros."
          action={{ label: 'Criar Processo', onClick: onAddProcess }}
        />
      ) : (
        <div className="table-responsive">
          <table className="table-premium">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Status</th>
                <th>Etapas</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredProcesses.map((process) => (
                <tr key={process.id}>
                  <td style={{ fontWeight: 500 }}>{process.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{process.description || '-'}</td>
                  <td>
                    <Badge variant={process.active ? 'success' : 'info'}>
                      {process.active ? '✅ Ativo' : '⏸️ Inativo'}
                    </Badge>
                  </td>
                  <td>
                    <span style={{ 
                      backgroundColor: 'var(--bg-secondary)', 
                      padding: 'var(--space-2) var(--space-3)', 
                      borderRadius: 'var(--radius)' 
                    }}>
                      {process.stages?.length || 0} etapas
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <Button 
                        size="sm" 
                        variant={process.active ? 'secondary' : 'ghost'}
                        onClick={() => onToggleActive(process.id, !process.active)}
                        title={process.active ? 'Desativar' : 'Ativar'}
                      >
                        {process.active ? '⏸️' : '▶️'}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => onEditProcess(process)}
                        title="Editar"
                      >
                        ✏️
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => onDeleteProcess(process.id)}
                        title="Excluir"
                      >
                        🗑️
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};