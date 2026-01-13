import React, { useState } from 'react';
import { Button, Card, Input, Select, Badge, Alert } from '../components/ui/PremiumComponents';
import { AppConfig } from '../types';

interface ConfigPageProps {
  config: AppConfig;
  isLoading: boolean;
  onSaveConfig: (config: AppConfig) => void;
  onResetConfig: () => void;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
}

export const ConfigPage: React.FC<ConfigPageProps> = ({
  config,
  isLoading,
  onSaveConfig,
  onResetConfig,
  theme,
  onThemeChange,
}) => {
  const [localConfig, setLocalConfig] = useState<AppConfig>(config);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (field: keyof AppConfig, value: any) => {
    setLocalConfig((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSaveConfig(localConfig);
    setHasChanges(false);
  };

  return (
    <div>
      {/* Header */}
      <div className="header-area">
        <div>
          <h1 className="page-title">🎛️ Configurações</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
            Gerencie as configurações da aplicação
          </p>
        </div>
      </div>

      {hasChanges && (
        <Alert
          type="warning"
          title="Alterações Não Salvas"
          message="Você tem alterações não salvas. Não esqueça de clicar em 'Salvar'."
        />
      )}

      {/* Theme Section */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ padding: 'var(--space-6)' }}>
          <h2 style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>🎨 Tema</h2>
          <div style={{ display: 'flex', gap: 'var(--space-6)' }}>
            {['light', 'dark'].map((t) => (
              <div
                key={t}
                onClick={() => onThemeChange(t as 'light' | 'dark')}
                style={{
                  padding: 'var(--space-6)',
                  border: `2px solid ${theme === t ? 'var(--color-primary)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 200ms',
                  backgroundColor: theme === t ? 'var(--bg-secondary)' : 'transparent',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: 'var(--space-2)' }}>
                  {t === 'light' ? '☀️' : '🌙'}
                </div>
                <div style={{ fontWeight: 500, textTransform: 'capitalize' }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* General Settings */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ padding: 'var(--space-6)' }}>
          <h2 style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>⚙️ Geral</h2>

          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>
                Nome da Empresa
              </label>
              <Input
                value={localConfig.companyName || ''}
                onChange={(e) => handleChange('companyName', e.target.value)}
                placeholder="Digite o nome da empresa"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>
                Email de Contato
              </label>
              <Input
                type="email"
                value={localConfig.contactEmail || ''}
                onChange={(e) => handleChange('contactEmail', e.target.value)}
                placeholder="contato@empresa.com"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>
                Telefone
              </label>
              <Input
                value={localConfig.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>
                Endereço
              </label>
              <Input
                value={localConfig.address || ''}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Rua, número, complemento"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Financial Settings */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ padding: 'var(--space-6)' }}>
          <h2 style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>💰 Financeiro</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>
                Moeda Padrão
              </label>
              <Select
                options={[
                  { label: 'Real (R$)', value: 'BRL' },
                  { label: 'Dólar (USD)', value: 'USD' },
                  { label: 'Euro (€)', value: 'EUR' },
                ]}
                value={localConfig.currency || 'BRL'}
                onChange={(value) => handleChange('currency', value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 'var(--space-2)', fontWeight: 500 }}>
                Margem de Lucro Padrão (%)
              </label>
              <Input
                type="number"
                value={localConfig.marginPercent || 0}
                onChange={(e) => handleChange('marginPercent', parseFloat(e.target.value))}
                placeholder="20"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Advanced Settings */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ padding: 'var(--space-6)' }}>
          <h2 style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>🔧 Avançado</h2>

          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={localConfig.autoBackup || false}
                  onChange={(e) => handleChange('autoBackup', e.target.checked)}
                  style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                />
                <span>Ativar Backup Automático</span>
              </label>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={localConfig.notifications || false}
                  onChange={(e) => handleChange('notifications', e.target.checked)}
                  style={{ width: '1.2rem', height: '1.2rem', cursor: 'pointer' }}
                />
                <span>Ativar Notificações</span>
              </label>
            </div>
          </div>
        </div>
      </Card>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onResetConfig} disabled={!hasChanges || isLoading}>
          ↩️ Descartar
        </Button>
        <Button variant="primary" onClick={handleSave} disabled={!hasChanges || isLoading}>
          💾 Salvar Configurações
        </Button>
      </div>
    </div>
  );
};