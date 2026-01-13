import React, { useState } from 'react';
import { Button, Card, Badge, StatCard, Tabs, Progress, EmptyState, Input } from '../components/ui/PremiumComponents';
import { Transaction, TransactionType } from '../types';

interface FinancialPageProps {
  transactions: Transaction[];
  isLoading: boolean;
  formatMoney: (val: number) => string;
  onAddTransaction: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
}

const transactionTypeConfig = {
  ENTRADA: { label: 'Entrada', icon: '📈', color: 'success' },
  SAIDA: { label: 'Saída', icon: '📉', color: 'error' },
  DEVOLUCAO: { label: 'Devolução', icon: '🔄', color: 'warning' },
};

export const FinancialPage: React.FC<FinancialPageProps> = ({
  transactions,
  isLoading,
  formatMoney,
  onAddTransaction,
  onEditTransaction,
  onDeleteTransaction,
}) => {
  const [filterType, setFilterType] = useState<TransactionType | 'TODOS'>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate KPIs
  const revenue = transactions
    .filter((t) => t.type === 'ENTRADA')
    .reduce((sum, t) => sum + t.amount, 0);

  const expenses = transactions
    .filter((t) => t.type === 'SAIDA')
    .reduce((sum, t) => sum + t.amount, 0);

  const balance = revenue - expenses;
  const revenuePercent = revenue > 0 ? ((balance / revenue) * 100).toFixed(1) : 0;

  // Filtered transactions
  const filteredTransactions = transactions
    .filter((t) => (filterType === 'TODOS' ? true : t.type === filterType))
    .filter((t) => t.description.toLowerCase().includes(searchTerm.toLowerCase()));

  const tabs = [
    {
      label: '📊 Visão Geral',
      icon: '📊',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-6)' }}>
          <StatCard
            label="Receita Total"
            value={formatMoney(revenue)}
            change={12.5}
            icon="💰"
          />
          <StatCard
            label="Despesas"
            value={formatMoney(expenses)}
            change={-5.2}
            icon="💸"
          />
          <StatCard
            label="Saldo"
            value={formatMoney(balance)}
            change={parseFloat(revenuePercent as string)}
            icon={balance >= 0 ? '📈' : '📉'}
          />
          <Card>
            <div style={{ padding: 'var(--space-6)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                <span>Margem de Lucro</span>
                <strong>{revenuePercent}%</strong>
              </div>
              <Progress value={parseFloat(revenuePercent as string)} max={100} color="success" />
            </div>
          </Card>
        </div>
      ),
    },
    {
      label: '📋 Transações',
      icon: '📋',
      content: (
        <>
          <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
            <Input
              placeholder="Pesquisar transação..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ flex: 1, minWidth: '250px' }}
            />
            <Button variant="primary" onClick={onAddTransaction}>
              + Adicionar
            </Button>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', overflowX: 'auto' }}>
            {['TODOS', 'ENTRADA', 'SAIDA', 'DEVOLUCAO'].map((type) => (
              <Button
                key={type}
                variant={filterType === type ? 'primary' : 'secondary'}
                onClick={() => setFilterType(type as any)}
                size="sm"
              >
                {type === 'TODOS' ? '📊 Todas' : transactionTypeConfig[type as TransactionType].icon + ' ' + transactionTypeConfig[type as TransactionType].label}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <Card>Carregando...</Card>
          ) : filteredTransactions.length === 0 ? (
            <EmptyState
              icon="📭"
              title="Nenhuma Transação"
              message="Nenhuma transação encontrada com os filtros atuais."
            />
          ) : (
            <div className="table-responsive">
              <table className="table-premium">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Tipo</th>
                    <th>Valor</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{new Date(tx.date).toLocaleDateString('pt-BR')}</td>
                      <td>{tx.description}</td>
                      <td>
                        <Badge variant={transactionTypeConfig[tx.type].color}>
                          {transactionTypeConfig[tx.type].icon} {transactionTypeConfig[tx.type].label}
                        </Badge>
                      </td>
                      <td style={{ fontWeight: 600, color: tx.type === 'ENTRADA' ? 'var(--color-success)' : 'var(--color-error)' }}>
                        {tx.type === 'ENTRADA' ? '+' : '-'} {formatMoney(tx.amount)}
                      </td>
                      <td>
                        <Badge variant="success">Concluído</Badge>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <Button size="sm" variant="ghost" onClick={() => onEditTransaction(tx)}>✏️</Button>
                          <Button size="sm" variant="ghost" onClick={() => onDeleteTransaction(tx.id)}>🗑️</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="header-area">
        <div>
          <h1 className="page-title">💰 Financeiro</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
            Saldo: <strong style={{ color: balance >= 0 ? 'var(--color-success)' : 'var(--color-error)' }}>{formatMoney(balance)}</strong>
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={onAddTransaction}>
          + Adicionar Transação
        </Button>
      </div>

      {/* Content */}
      <Tabs tabs={tabs} defaultActive={0} />
    </div>
  );
};