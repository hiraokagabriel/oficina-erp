import React from 'react';
import { WorkshopSettings } from '../types';
import { VehicleCatalogNote } from '../components/VehicleCatalogNote';
import { parseTargetMarginDraft } from '../services/margin';
import { setShowMarginOnBoard } from '../utils/showMarginSetting';
import { HomeTab, readHomeTab, writeHomeTab } from '../utils/todayPrefs';
import { Icon } from '../components/ui/Icon';
import { DEFAULT_LOGO_TEXT, normalizeLogoText } from '../utils/logo';
import '../styles-config.css';

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

// Prévia fiel aos tokens de src/styles-tokens.css (--bg-app, --surface-1, --border, --accent) de cada tema.
const THEME_OPTIONS: { id: 'dark' | 'pastel'; name: string; text: string; bg: string; surface: string; border: string; accent: string }[] = [
  { id: 'dark', name: 'Escuro', text: 'Fundo escuro com detalhes em dourado. Bom para pouca luz.', bg: '#0E0F12', surface: '#17181C', border: '#33353D', accent: '#D4A514' },
  { id: 'pastel', name: 'Pastel (claro)', text: 'Fundo claro com detalhes em violeta. Bom para ambientes bem iluminados.', bg: '#F7F5FA', surface: '#FFFFFF', border: '#E4DCEF', accent: '#6D28D9' },
];

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

  // Letras do logo: grava já normalizadas (maiúsculas, 1 a 3 caracteres); vazio remove a chave (volta ao padrão).
  const handleLogoChange = (raw: string) => {
    const cleaned = normalizeLogoText(raw);
    if (raw.trim() === '' || cleaned === DEFAULT_LOGO_TEXT && !/[\p{L}\p{N}]/u.test(raw)) {
      if (settings.logoText !== undefined) {
        const { logoText: _removed, ...rest } = settings;
        setSettings(rest);
      }
      return;
    }
    if (settings.logoText !== cleaned) setSettings({ ...settings, logoText: cleaned });
  };
  const resetLogo = () => {
    if (settings.logoText === undefined) return;
    const { logoText: _removed, ...rest } = settings;
    setSettings(rest);
  };
  const logoPreview = normalizeLogoText(settings.logoText);

  const fileInputRef =React.useRef<HTMLInputElement>(null);
  const [chosenFileName, setChosenFileName] = React.useState('');

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setChosenFileName(file.name);

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

  const missingGoogle = !settings.googleApiKey || !settings.googleDriveToken;

  return (
    <div className="config-container cfg-page">
      <h1 className="cfg-page-title">Configurações</h1>

      {/* CADASTROS */}
      <section className="card cfg-card" aria-labelledby="cfg-cadastros">
        <div className="cfg-row">
          <div className="cfg-row-text">
            <h3 id="cfg-cadastros" className="cfg-title"><Icon name="arquivo" size={20} /> Cadastros</h3>
            <p className="cfg-help">Veja e corrija clientes, veículos, peças, serviços e técnicos.</p>
          </div>
          <button type="button" className="btn" onClick={onOpenDatabase}>
            <Icon name="arquivo" size={18} /> Abrir cadastros
          </button>
        </div>
      </section>

      {/* IDENTIDADE */}
      <section className="card cfg-card" aria-labelledby="cfg-oficina">
        <h3 id="cfg-oficina" className="cfg-title"><Icon name="oficina" size={20} /> Dados da oficina</h3>
        <p className="cfg-help">Aparecem no topo das impressões e dos relatórios.</p>

        <div className="cfg-grid-2">
          <div className="form-group">
            <label className="form-label" htmlFor="cfg-name">Nome da oficina</label>
            <input id="cfg-name" className="form-input" value={settings.name} onChange={(e) => handleChange('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="cfg-cnpj">CNPJ ou CPF</label>
            <input id="cfg-cnpj" className="form-input" value={settings.cnpj} onChange={(e) => handleChange('cnpj', e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="cfg-address">Endereço</label>
          <input id="cfg-address" className="form-input" value={settings.address} onChange={(e) => handleChange('address', e.target.value)} />
        </div>

        <div className="form-group cfg-logo">
          <label className="form-label" htmlFor="cfg-logo-text">Letras do logo</label>
          <div className="cfg-logo-row">
            <input
              id="cfg-logo-text"
              className="form-input cfg-logo-input"
              value={settings.logoText ?? ''}
              maxLength={3}
              placeholder={DEFAULT_LOGO_TEXT}
              autoComplete="off"
              aria-describedby="cfg-logo-help cfg-logo-preview-text"
              onChange={(e) => handleLogoChange(e.target.value)}
            />
            <button type="button" className="btn" onClick={resetLogo} disabled={settings.logoText === undefined}>
              Voltar ao padrão ({DEFAULT_LOGO_TEXT})
            </button>
          </div>
          <p id="cfg-logo-help" className="cfg-help">Aparece no círculo do cabeçalho das impressões. Ex.: AM</p>
          <div className="cfg-logo-preview" aria-hidden="true">
            <div className="cfg-logo-paper">
              <div className="cfg-logo-circle">{logoPreview}</div>
              <div className="cfg-logo-paper-name">{settings.name || 'NOME DA OFICINA'}</div>
            </div>
            <div className="cfg-logo-paper cfg-logo-paper-sm">
              <div className="cfg-logo-circle cfg-logo-circle-sm">{logoPreview}</div>
              <div className="cfg-logo-paper-name">{settings.name || 'OFICINA MECÂNICA'}</div>
            </div>
          </div>
          <span id="cfg-logo-preview-text" className="sr-only">
            Prévia: círculo com as letras {logoPreview} ao lado do nome da oficina.
          </span>
        </div>
      </section>

      {/* PREFERÊNCIAS: tela inicial, selo de margem, meta */}
      <section className="card cfg-card" aria-labelledby="cfg-prefs">
        <h3 id="cfg-prefs" className="cfg-title"><Icon name="config" size={20} /> Como o programa funciona</h3>

        <div className="cfg-block">
          <h4 className="cfg-subtitle" id="cfg-home-title">Tela inicial</h4>
          <div className="today-home" role="group" aria-labelledby="cfg-home-title">
            <div className="segmented">
              {([['OFICINA', 'Oficina'], ['HOJE', 'Hoje']] as [HomeTab, string][]).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={homeTab === id}
                  onClick={() => { setHomeTab(id); writeHomeTab(id); }}>{label}</button>
              ))}
            </div>
            <p className="cfg-help">É a tela que abre quando você liga o programa. Vale só para este computador.</p>
          </div>
        </div>

        <div className="cfg-block">
          <h4 className="cfg-subtitle">Quadro da Oficina</h4>
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
          <p id="cfg-show-margin-help" className="cfg-help">
            Desligado por padrão. A margem mostra quanto a oficina ganha em cada serviço. Se o cliente fica no balcão olhando a tela, ele pode ver esse valor.
          </p>
        </div>

        <div className="cfg-block">
          <h4 className="cfg-subtitle">Meta de margem</h4>
          <div className="form-group cfg-narrow">
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
            <p id="cfg-target-margin-help" className="cfg-help">
              Inteiro de 1 a 99. Vazio usa o padrão de 70%. Vale para a OS, o Kanban e o relatório de margem.
            </p>
            {targetError && <span className="margin-config-error" role="alert">{targetError}</span>}
          </div>
        </div>
      </section>

      {/* APARÊNCIA */}
      <section className="card cfg-card" aria-labelledby="cfg-tema">
        <h3 id="cfg-tema" className="cfg-title"><Icon name="info" size={20} /> Aparência</h3>
        <p className="cfg-help">Escolha o fundo da tela. Vale só para este computador.</p>
        <div className="cfg-themes" role="group" aria-labelledby="cfg-tema">
          {THEME_OPTIONS.map(opt => {
            const active = currentTheme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                className={`cfg-theme ${active ? 'is-active' : ''}`}
                aria-pressed={active}
                onClick={() => setCurrentTheme(opt.id)}
              >
                <span className="cfg-theme-preview" aria-hidden="true" style={{ background: opt.bg, borderColor: opt.border }}>
                  <span className="cfg-theme-card" style={{ background: opt.surface, borderColor: opt.border }}>
                    <span className="cfg-theme-line" style={{ background: opt.border }} />
                    <span className="cfg-theme-line cfg-theme-line--short" style={{ background: opt.border }} />
                  </span>
                  <span className="cfg-theme-accent" style={{ background: opt.accent }} />
                </span>
                <span className="cfg-theme-info">
                  <span className="cfg-theme-name">
                    {opt.name}
                    {active && <span className="cfg-theme-check"><Icon name="check" size={16} /> Em uso</span>}
                  </span>
                  <span className="cfg-help">{opt.text}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* BACKUP */}
      <section className="card cfg-card" aria-labelledby="cfg-backup">
        <h3 id="cfg-backup" className="cfg-title"><Icon name="salvar" size={20} /> Cópia de segurança</h3>

        <div className="cfg-restore">
          <h4 className="cfg-subtitle">Voltar uma cópia salva neste computador</h4>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.bak"
            className="cfg-file-input"
            tabIndex={-1}
            aria-label="Arquivo de backup"
            onChange={handleFileSelect}
          />
          <div className="cfg-row">
            <button type="button" className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
              <Icon name="arquivo" size={18} /> Escolher arquivo de backup
            </button>
            <span className="cfg-file-name" aria-live="polite">{chosenFileName ? `Arquivo: ${chosenFileName}` : 'Nenhum arquivo escolhido'}</span>
          </div>
          <p className="cfg-help">
            Aceita arquivos .json ou .bak. O programa vai pedir sua confirmação antes de trocar: ao confirmar, os dados atuais são substituídos.
          </p>
        </div>

        <div className="cfg-drive">
          <h4 className="cfg-subtitle">Cópia no Google Drive</h4>
          <div className="form-group">
            <label className="form-label" htmlFor="cfg-gkey">Chave do Google</label>
            <input
              id="cfg-gkey"
              className="form-input"
              type="password"
              autoComplete="off"
              placeholder="Cole aqui a chave do Google"
              value={settings.googleApiKey || ''}
              onChange={(e) => handleChange('googleApiKey', e.target.value)}
              aria-describedby="cfg-gkey-help"
            />
            <p id="cfg-gkey-help" className="cfg-help">
              Um código que identifica o seu acesso ao Google. Você cria no{' '}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="cfg-gtoken">Token de acesso</label>
            <input
              id="cfg-gtoken"
              className="form-input"
              type="password"
              autoComplete="off"
              placeholder="Cole aqui o token de acesso"
              value={settings.googleDriveToken || ''}
              onChange={(e) => handleChange('googleDriveToken', e.target.value)}
              aria-describedby="cfg-gtoken-help"
            />
            <p id="cfg-gtoken-help" className="cfg-help">A senha temporária que libera o envio ao Drive. Quando vencer, gere outro.</p>
          </div>

          <div className="cfg-row cfg-row--start">
            <button type="button" className="btn" onClick={onBackup} disabled={isBackuping || missingGoogle}>
              {isBackuping ? <><span className="spinner" style={{ marginRight: 8 }}></span> Enviando...</> : <><Icon name="pagar" size={18} /> Enviar cópia para o Drive</>}
            </button>
            <span role="status">
              {driveStatus === 'success' && <span className="cfg-ok"><Icon name="check" size={16} /> Enviado com sucesso</span>}
              {driveStatus === 'error' && <span className="cfg-bad"><Icon name="alerta" size={16} /> Não foi possível enviar</span>}
            </span>
          </div>

          {missingGoogle && (
            <p className="cfg-warn">
              <Icon name="alerta" size={18} /> Preencha a chave e o token acima para liberar o envio ao Drive.
            </p>
          )}
        </div>
      </section>

      <VehicleCatalogNote />

      {/* AVANÇADO: no fim, recolhido */}
      <details className="card cfg-card cfg-advanced">
        <summary className="cfg-advanced-summary"><Icon name="alerta" size={20} /> Avançado</summary>
        <p className="cfg-warn">
          <Icon name="alerta" size={18} /> Só mude se souber o que está fazendo. Um caminho errado faz o programa abrir sem os dados da oficina.
        </p>
        <div className="form-group">
          <label className="form-label" htmlFor="cfg-dbpath">Local do arquivo de dados (database.json)</label>
          <input
            id="cfg-dbpath"
            className="form-input"
            value={dbPathDraft}
            onChange={handleDbPathChange}
            onBlur={commitDbPath}
            onKeyDown={(e) => { if (e.key === 'Enter') commitDbPath(); }}
            placeholder="Ex: C:\OficinaData\database.json"
            aria-describedby="cfg-dbpath-help"
          />
          <p id="cfg-dbpath-help" className="cfg-help">
            É a pasta onde ficam todos os dados da oficina. A mudança vale ao sair do campo ou apertar Enter, e o programa lembra dela.
          </p>
        </div>
      </details>
    </div>
  );
};
