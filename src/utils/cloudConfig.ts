import type { Role } from '../services/permissions';

// O que a Config mostra por modo e papel (docs/NUVEM-UX.md seções 5, 7 e 9). Puro: a tela só desenha.
// Modo arquivo (`cloud` falso): tudo como sempre foi, sem as seções da nuvem.

export interface ConfigSections {
  /** "Usuários e papéis", "Aparelhos" e "Cópias de recuperação": só o Dono, só na nuvem. */
  cloudAdmin: boolean;
  /** Cartão "Onde ficam os dados" (nuvem, Dono). */
  dataLocation: boolean;
  cadastros: boolean;
  workshop: boolean;
  preferences: boolean;
  /** Pasta dos PDFs: na nuvem só onde há PDF (app instalado). */
  pdf: boolean;
  appearance: boolean;
  /** Cópia de segurança: bloco do Google Drive. */
  drive: boolean;
  /** "Voltar uma cópia salva neste computador" (importar .json): some na nuvem (trocaria os dados de todos). */
  restoreFile: boolean;
  vehicleNote: boolean;
  /** "Avançado > Local do arquivo de dados": some na nuvem. */
  dbPath: boolean;
  /** Sem nenhuma seção (quem não é Dono): a aba nem abre; este campo só garante tela vazia. */
  noAccess: boolean;
}

export interface ConfigSectionsInput {
  cloud: boolean;
  role: Role | null | undefined;
  pdfAvailable: boolean;
}

const NONE: ConfigSections = {
  cloudAdmin: false, dataLocation: false, cadastros: false, workshop: false, preferences: false, pdf: false, appearance: false,
  drive: false, restoreFile: false, vehicleNote: false, dbPath: false, noAccess: false,
};

export function configSections({ cloud, role, pdfAvailable }: ConfigSectionsInput): ConfigSections {
  if (!cloud) {
    return {
      cloudAdmin: false, dataLocation: false, cadastros: true, workshop: true, preferences: true, pdf: true, appearance: true,
      drive: true, restoreFile: true, vehicleNote: true, dbPath: true, noAccess: false,
    };
  }
  if (role === 'dono') {
    return {
      ...NONE, cloudAdmin: true, dataLocation: true, cadastros: true, workshop: true, preferences: true, pdf: pdfAvailable,
      appearance: true, drive: true, vehicleNote: true,
    };
  }
  // Só o Dono entra na Config (o App barra a aba para os outros). A Recepção abre Cadastros pela barra lateral (modal),
  // não por aqui: sem seção nenhuma para quem não é Dono.
  return { ...NONE, noAccess: true };
}

/** Rótulos do bloco do Google Drive: na nuvem, sem jargão (seção 9). */
export function driveLabels(cloud: boolean): { keyHelp: string; tokenLabel: string; tokenPlaceholder: string; tokenHelp: string } {
  if (!cloud) {
    return {
      keyHelp: 'Um código que identifica o seu acesso ao Google. Você cria no',
      tokenLabel: 'Token de acesso', tokenPlaceholder: 'Cole aqui o token de acesso',
      tokenHelp: 'A senha temporária que libera o envio ao Drive. Quando vencer, gere outro.',
    };
  }
  return {
    keyHelp: 'Um código do Google que libera o envio. Você cria no',
    tokenLabel: 'Código de acesso do Google', tokenPlaceholder: 'Cole aqui o código de acesso',
    tokenHelp: 'Um código temporário do Google que libera o envio ao Drive. Quando vencer, gere outro.',
  };
}
