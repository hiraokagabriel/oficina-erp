import React, { useState } from 'react';
import { Button, Card, Badge, Input, Select, EmptyState } from '../components/ui/PremiumComponents';
import { Client } from '../types';

interface CRMPageProps {
  clients: Client[];
  isLoading: boolean;
  onAddClient: () => void;
  onEditClient: (client: Client) => void;
  onDeleteClient: (id: string) => void;
  onViewOrders: (clientId: string) => void;
}

export const CRMPage: React.FC<CRMPageProps> = ({
  clients,
  isLoading,
  onAddClient,
  onEditClient,
  onDeleteClient,
  onViewOrders,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ATIVO' | 'INATIVO' | 'TODOS'>('TODOS');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');

  const filteredClients = clients
    .filter((c) => (filterStatus === 'TODOS' ? true : c.status === filterStatus))
    .filter((c) => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.phone.includes(searchTerm))
    .sort((a, b) => (sortBy === 'name' ? a.name.localeCompare(b.name) : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));

  const activeClientsCount = clients.filter((c) => c.status === 'ATIVO').length;
  const totalOrders = clients.reduce((sum, c) => sum + (c.totalOrders || 0), 0);

  return (
    <div>
      {/* Header */}
      <div className="header-area">
        <div>
          <h1 className="page-title">👥 CRM - Clientes</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
            {activeClientsCount} ativos • {totalOrders} OS's
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={onAddClient}>
          + Novo Cliente
        </Button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
        <Card>
          <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>👥</div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>Total de Clientes</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{clients.length}</div>
          </div>
        </Card>
        <Card>
          <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>✅</div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>Clientes Ativos</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-success)' }}>{activeClientsCount}</div>
          </div>
        </Card>
        <Card>
          <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>📋</div>
            <div style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-1)' }}>Total OS's</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{totalOrders}</div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <Input
          placeholder="Pesquisar por nome ou telefone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, minWidth: '250px' }}
        />
        <Select
          options={[{ label: 'Todos', value: 'TODOS' }, { label: 'Ativos', value: 'ATIVO' }, { label: 'Inativos', value: 'INATIVO' }]}
          value={filterStatus}
          onChange={(value) => setFilterStatus(value as any)}
        />
        <Select
          options={[{ label: 'Por Nome', value: 'name' }, { label: 'Por Data', value: 'date' }]}
          value={sortBy}
          onChange={(value) => setSortBy(value as any)}
        />
      </div>

      {/* Clients List */}
      {isLoading ? (
        <Card>Carregando clientes...</Card>
      ) : filteredClients.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Nenhum Cliente Encontrado"
          message="Nenhum cliente corresponde aos seus filtros."
          action={{ label: 'Criar Cliente', onClick: onAddClient }}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-6)' }}>
          {filteredClients.map((client) => (
            <Card key={client.id} className="client-card">
              <div style={{ padding: 'var(--space-6)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 'var(--space-4)' }}>
                  <div>
                    <h3 style={{ margin: 0, marginBottom: 'var(--space-1)' }}>{client.name}</h3>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{client.email}</p>
                  </div>
                  <Badge variant={client.status === 'ATIVO' ? 'success' : 'info'}>
                    {client.status === 'ATIVO' ? '✅' : '⏸️'} {client.status}
                  </Badge>
                </div>

                <div style={{ marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ marginBottom: 'var(--space-2)' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Telefone</span>
                    <div style={{ fontWeight: 500 }}>{client.phone}</div>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>CPF/CNPJ</span>
                    <div style={{ fontWeight: 500 }}>{client.cpfCnpj}</div>
                  </div>
                </div>

                <div style={{ marginBottom: 'var(--space-6)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Total de OS's</span>
                  <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{client.totalOrders || 0}</div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                  <Button variant="secondary" size="sm" onClick={() => onViewOrders(client.id)}>
                    📋 Ver OS's
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEditClient(client)}>
                    ✏️ Editar
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => onDeleteClient(client.id)} style={{ gridColumn: '1 / -1' }}>
                    🗑️ Excluir
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};