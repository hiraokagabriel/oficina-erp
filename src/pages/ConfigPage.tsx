import React from 'react';
import { WorkshopSettings } from '../types';
import { VehicleCatalogNote } from '../components/VehicleCatalogNote';
import { parseTargetMarginDraft } from '../services/margin';
import { setShowMarginOnBoard } from '../utils/showMarginSetting';
import { HomeTab, readHomeTab, writeHomeTab } from '../utils/todayPrefs';

interface ConfigPageProps {
  settings: WorkshopSettings;
  setSettings: (s: WorkshopSettings) => void;
  currentTheme: 'dark' | 'pastel';
  setCurrentTheme: (t: 'dark' | 'pastel') => void;
  onBackup: () => void;
  onImportData: (content: string) => void;
  isBackuping: boolean;
  driveStatus: 'idle' | 'success' | 'error';
  onOpenDatabase: () => void;
  dbPath: string;
  setDbPath: (path: string) => void;
}

export const ConfigPage: React.FC<ConfigPageProps> = ({
  settings, setSettings, currentTheme, setCurrentTheme, onBackup, onImportData, isBackuping, driveStatus, onOpenDatabase, dbPath, setDbPath
}) => {
  const [homeTab, setHomeTab] = React.useState<HomeTab>(() => readHomeTab());

  const handleChange = (field: keyof WorkshopSettings, value: string) => {
    setSettings({ ...settings, [field]: value });
  };

  // Meta de margem: inteiro 1..99 gravado COMO NÚMERO (a edição genérica acima grava texto). Vazio = padrão.
  const [targetDraft, setTargetDraft] = React.useState(settings.targetMargin === undefined ? '' : String(settings.targetMargin));
  const [targetError, setTargetError] = React.useState('');
  React.useEffect(() => {
    setTargetDraft(prev => {
      if (settings.targetMargin === undefined) return prev.trim() === '' || targetError ? prev : '';
      return String(settings.targetMargin) === prev.trim() ? prev : String(settings.targetMargin);
    });
  }, [settings.targetMargin]);

  // Grava já ao digitar quando o texto inteiro é válido (ou vazio): fechar o app com o campo em foco não perde a meta.
  // "7,5" nunca grava "7": fica inválido e só mostra erro ao confirmar (blur/Enter).
  const handleTargetMarginChange = (raw: string) => {
    setTargetDraft(raw);
    setTargetError('');
    const parsed = parseTargetMarginDraft(raw);
    if (parsed.kind === 'valid') {
      if (settings.targetMargin !== parsed.value) setSettings({ ...settings, targetMargin: parsed.value });
    } else if (parsed.kind === 'empty' && settings.targetMargin !== undefined) {
      const { targetMargin: _removed, ...rest } = settings;
      setSettings(rest);
    }
  };

  const commitTargetMargin = () => {
    const parsed = parseTargetMarginDraft(targetDraft);
    if (parsed.kind === 'invalid') {
      setTargetError('Informe um número inteiro de 1 a 99.');
      return;
    }
    setTargetError('');
    if (parsed.kind === 'empty') {
      if (settings.targetMargin === undefined) return;
      const { targetMargin: _removed, ...rest } = settings;
      setSettings(rest);
      return;
    }
    if (settings.targetMargin !== parsed.value) setSettings({ ...settings, targetMargin: parsed.value });
  };

  const handleFileSelect =(e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        onImportData(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Ligado grava true; desligado remove a chave (ausente = desligado, como em bancos antigos).
  const handleShowMarginChange = (on: boolean) => {
    setSettings(setShowMarginOnBoard(settings, on));
  };

  // O caminho só é aplicado ao sair do campo ou com Enter: cada troca recarrega o banco.
  const [dbPathDraft, setDbPathDraft] = React.useState(dbPath);
  React.useEffect(() => { setDbPathDraft(dbPath); }, [dbPath]);

  const commitDbPath = () => {
    const next = dbPathDraft.trim();
    if (next && next !== dbPath) setDbPath(next);
  };

  const handleDbPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDbPathDraft(e.target.value);
  };

  return (
    <div className="config-container" style={{ maxWidth: 1000, margin: '0 auto' }}>
      
      {/* SEÇÃO 0: GERENCIAMENTO DE CADASTROS */}
      <div className="card" style={{ borderLeft: '4px solid var(--primary)', background: 'var(--bg-panel)' }}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div>
                <h3 style={{marginTop:0}}>🗂️ Banco de Dados e Cadastros</h3>
                <p style={{marginBottom:0, color:'var(--text-muted)'}}>
                    Gerencie manualmente seus clientes, veículos, peças, serviços e técnicos.
                </p>
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">📁 Local do arquivo de dados (database.json)</label>
                  <input
                    className="form-input"
                    value={dbPathDraft}
                    onChange={handleDbPathChange}
                    onBlur={commitDbPath}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitDbPath(); }}
                    placeholder="Ex: C:\\OficinaData\\database.json"
                  />
                  <small style={{ color: 'var(--text-muted)', marginTop: 5, display: 'block' }}>
                    Altere aqui o caminho onde o arquivo com todos os dados da oficina é lido e salvo. A mudança é lembrada automaticamente.
                  </small>
                </div>
            </div>
            <button className="btn" onClick={onOpenDatabase} style={{padding: '12px 24px', fontSize: '1rem'}}>
                📂 Abrir Gerenciador
            </button>
        </div>
      </div>

      {/* SEÇÃO 1: DADOS DA OFICINA */}
      <div className="card">
        <h3>🏢 Identidade da Oficina</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 20 }}>
          Dados para cabeçalhos de relatórios e impressões.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="form-group">
            <label className="form-label">Nome Fantasia</label>
            <input className="form-input" value={settings.name} onChange={(e) => handleChange('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">CNPJ / CPF</label>
            <input className="form-input" value={settings.cnpj} onChange={(e) => handleChange('cnpj', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Endereço</label>
          <input className="form-input" value={settings.address} onChange={(e) => handleChange('address', e.target.value)} />
        </div>
      </div>

      {/* TELA INICIAL (por computador) */}
      <div className="card">
        <h3>Tela inicial</h3>
        <div className="today-home" role="group" aria-label="Tela inicial deste computador">
          <div className="segmented">
            {([['OFICINA', 'Oficina'], ['HOJE', 'Hoje']] as [HomeTab, string][]).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={homeTab === id}
                onClick={() => { setHomeTab(id); writeHomeTab(id); }}>{label}</button>
            ))}
          </div>
          <small style={{ color: 'var(--text-muted)' }}>É a tela que abre quando você liga o programa. Vale só para este computador.</small>
        </div>
      </div>

      {/* SEÇÃO 1B: META DE MARGEM */}
      <div className="card">
        <h3>🎯 Meta de Margem</h3>
        <div className="form-group" style={{ maxWidth: 260 }}>
          <label className="form-label" htmlFor="cfg-target-margin">Meta de margem (%)</label>
          <input
            id="cfg-target-margin"
            className="form-input"
            type="text"
            inputMode="numeric"
            placeholder="70"
            value={targetDraft}
            onChange={(e) => handleTargetMarginChange(e.target.value)}
            onBlur={commitTargetMargin}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTargetMargin(); }}
            aria-invalid={targetError ? true : undefined}
            aria-describedby="cfg-target-margin-help"
          />
          <small id="cfg-target-margin-help" style={{ color: 'var(--text-muted)', marginTop: 5, display: 'block' }}>
            Inteiro de 1 a 99. Vazio usa o padrão de 70%. Vale para a OS, o Kanban e o relatório de margem.
          </small>
          {targetError && <span className="margin-config-error" role="alert">{targetError}</span>}
        </div>
      </div>

      {/* SEÇÃO 1C: QUADRO DA OFICINA */}
      <div className="card">
        <h3>Quadro da Oficina</h3>
        <label className="config-check" htmlFor="cfg-show-margin">
          <input
            id="cfg-show-margin"
            type="checkbox"
            checked={settings.showMarginOnBoard === true}
            onChange={(e) => handleShowMarginChange(e.target.checked)}
            aria-describedby="cfg-show-margin-help"
          />
          <span>Mostrar a margem nos cartões do quadro</span>
        </label>
        <small id="cfg-show-margin-help" style={{ color: 'var(--text-muted)', marginTop: 5, display: 'block' }}>
          Desligado por padrão. A margem mostra quanto a oficina ganha em cada serviço. Se o cliente fica no balcão olhando a tela, ele pode ver esse valor.
        </small>
      </div>

      {/* SEÇÃO 2: APARÊNCIA */}
      <div className="card">
        <h3>🎨 Aparência e Tema</h3>
        <div className="theme-selection-area">
            {/* DARK AERO */}
            <div className={`theme-card-visual ${currentTheme === 'dark' ? 'active' : ''}`} onClick={() => setCurrentTheme('dark')}>
                <div className="theme-check-icon">✓</div>
                <div className="theme-preview-palette">
                    <div className="theme-color-swatch" style={{ background: '#1e1e2e' }}></div>
                    <div className="theme-color-swatch" style={{ background: '#8257e6' }}></div>
                    <div className="theme-color-swatch" style={{ background: '#2b2b3b' }}></div>
                </div>
                <div className="theme-info">
                    <h4>Dark Aero</h4>
                    <p>Contraste moderno para ambientes com pouca luz.</p>
                </div>
            </div>

            {/* PASTEL ULTRAVIOLET */}
            <div className={`theme-card-visual ${currentTheme === 'pastel' ? 'active' : ''}`} onClick={() => setCurrentTheme('pastel')}>
                <div className="theme-check-icon">✓</div>
                <div className="theme-preview-palette">
                    <div className="theme-color-swatch" style={{ background: '#F8F5FA', border: '1px solid #E0D8F0' }}></div>
                    <div className="theme-color-swatch" style={{ background: 'linear-gradient(90deg, #C7B8EA, #FFCBA4)' }}></div>
                    <div className="theme-color-swatch" style={{ background: '#4A405A' }}></div>
                </div>
                <div className="theme-info">
                    <h4>Ultraviolet Dawn</h4>
                    <p>Futurismo suave e limpo.</p>
                </div>
            </div>
        </div>
      </div>

      {/* SEÇÃO 3: DADOS E BACKUP */}
      <div className="card">
        <h3>💾 Gerenciamento de Dados</h3>
        
        {/* IMPORTAÇÃO MANUAL */}
        <div style={{ marginBottom: 30, padding: 20, border: '1px dashed var(--border)', borderRadius: 12 }}>
            <label className="form-label" style={{ marginBottom: 10, display: 'block' }}>Restaurar Backup Manual (Local)</label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input 
                    type="file" 
                    accept=".json,.bak" 
                    className="form-input" 
                    style={{ paddingTop: 8, height: 'auto' }} 
                    onChange={handleFileSelect}
                />
            </div>
            <small style={{ color: 'var(--text-muted)', marginTop: 5, display: 'block' }}>
                Selecione um arquivo .json ou .bak para carregar os dados imediatamente. Isso substituirá os dados atuais.
            </small>
        </div>

        {/* GOOGLE DRIVE */}
        <div style={{ background: 'rgba(0,0,0,0.05)', padding: 20, borderRadius: 12, border: '1px solid var(--border)' }}>
            <h4 style={{ marginTop: 0, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              ☁️ Integração Google Drive
            </h4>
            
            <div className="form-group">
                <label className="form-label">🔑 Google API Key</label>
                <input 
                    className="form-input" 
                    type="password" 
                    placeholder="Sua API key do Google Cloud..." 
                    value={settings.googleApiKey || ''} 
                    onChange={(e) => handleChange('googleApiKey', e.target.value)} 
                />
                <small style={{ color: 'var(--text-muted)', marginTop: 5, display: 'block' }}>
                  Obtém em: <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{color: 'var(--primary)'}}>Google Cloud Console</a>
                </small>
            </div>

            <div className="form-group">
                <label className="form-label">🎫 Access Token</label>
                <input 
                    className="form-input" 
                    type="password" 
                    placeholder="Token de acesso..." 
                    value={settings.googleDriveToken || ''} 
                    onChange={(e) => handleChange('googleDriveToken', e.target.value)} 
                />
            </div>
            
            <div style={{ display: 'flex', gap: 15, alignItems: 'center', marginTop: 20 }}>
                <button 
                  className="btn" 
                  onClick={onBackup} 
                  disabled={isBackuping || !settings.googleApiKey || !settings.googleDriveToken}
                  style={{ opacity: (!settings.googleApiKey || !settings.googleDriveToken) ? 0.5 : 1 }}
                >
                   {isBackuping ? <><span className="spinner" style={{ marginRight: 8 }}></span> Enviando...</> : '☁️ Fazer Backup Nuvem'}
                </button>
                {driveStatus === 'success' && <span style={{ color: 'var(--success)' }}>✅ Sucesso!</span>}
                {driveStatus === 'error' && <span style={{ color: 'var(--danger)' }}>❌ Erro.</span>}
            </div>
            
            {(!settings.googleApiKey || !settings.googleDriveToken) && (
              <div style={{ 
                marginTop: 16, 
                padding: 12, 
                background: 'rgba(251, 169, 76, 0.1)', 
                border: '1px solid var(--warning)', 
                borderRadius: 8,
                fontSize: '0.9rem',
                color: 'var(--warning)'
              }}>
                ⚠️ Configure ambos os campos acima para habilitar o backup na nuvem.
              </div>
            )}
        </div>
      </div>

      <VehicleCatalogNote />

    </div>
  );
};
