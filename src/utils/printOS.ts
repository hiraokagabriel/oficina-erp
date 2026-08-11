import { WorkOrder, WorkshopSettings, STATUS_LABELS, PartCategory, PART_CATEGORY_META } from '../types';

// Variante de impressão: CLIENT = via do cliente (assina o mecânico), SHOP = via da oficina (assina o cliente)
export type PrintVariant = 'CLIENT' | 'SHOP';

// 🆕 Issue #41 — Ordem de exibição das categorias na impressão
const CATEGORY_ORDER: PartCategory[] = [
  'MOTOR', 'FREIO', 'SUSPENSAO', 'ELETRICA',
  'TRANSMISSAO', 'AR_CONDICIONADO', 'CARROCERIA', 'OUTROS'
];

// 🆕 Função auxiliar para sanitizar strings para nomes de arquivo
function sanitizeForFilename(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 50);
}

export function printOS(data: WorkOrder, settings: WorkshopSettings, variant?: PrintVariant) {
  if (!data) {
    console.error('Dados da OS não fornecidos para impressão');
    return;
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const formatMoney = (val: number) => {
    const valueInReais = val / 100;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueInReais);
  };

  const subtotalParts = data.parts.reduce((acc, item) => acc + item.price, 0);
  const subtotalServices = data.services.reduce((acc, item) => acc + item.price, 0);

  const osNumber = data.osNumber || 'SN';
  const clientName = sanitizeForFilename(data.clientName || 'Cliente');
  const vehicleModel = sanitizeForFilename(
    data.vehicle ? data.vehicle.split(' ').slice(0, 2).join(' ') : 'Veiculo'
  );

  let licensePlate = 'SemPlaca';
  if (data.vehicle) {
    const plateMatch = data.vehicle.match(/[A-Z]{3}[-]?[0-9][A-Z0-9][0-9]{2}/i);
    if (plateMatch) {
      licensePlate = sanitizeForFilename(plateMatch[0]);
    }
  }

  const variantSuffix =
    variant === 'CLIENT' ? '_ViaCliente'
    : variant === 'SHOP' ? '_ViaOficina'
    : '';

  const documentTitle = `OS_${osNumber}_${clientName}_${vehicleModel}_${licensePlate}${variantSuffix}`;

  const viaLabel =
    variant === 'CLIENT' ? ' — VIA DO CLIENTE'
    : variant === 'SHOP' ? ' — VIA DA OFICINA'
    : '';

  const signatureBlock = (() => {
    const mechBlock = `
      <div class="signature-block">
        <div class="sign-space"></div>
        <span class="sign-name">${data.technician || settings.name || 'Oficina'}</span>
        <span class="sign-label">Responsável Técnico</span>
      </div>`;

    const clientBlock = `
      <div class="signature-block">
        <div class="sign-space"></div>
        <span class="sign-name">${data.clientName}</span>
        <span class="sign-label">Cliente</span>
      </div>`;

    if (variant === 'CLIENT') return mechBlock;
    if (variant === 'SHOP')   return clientBlock;
    return mechBlock + clientBlock;
  })();

  // ─────────────────────────────────────────────────────────────────
  // Renderização de peças agrupadas por categoria.
  // Cada grupo é uma <table> independente com <thead> que se repete
  // automaticamente em quebras de página (display: table-header-group).
  // ─────────────────────────────────────────────────────────────────
  const buildPartsHtml = (): string => {
    if (data.parts.length === 0) {
      return `<table class="invoice-items-table">
        <tbody>
          <tr><td colspan="2" style="font-style:italic;color:#999;padding:15px 0">Nenhuma peça utilizada.</td></tr>
        </tbody>
      </table>`;
    }

    const hasCategories = data.parts.some(p => p.category);

    if (!hasCategories) {
      const rows = data.parts.map(item => `
        <tr>
          <td>${item.description}</td>
          <td class="text-right">${formatMoney(item.price)}</td>
        </tr>
      `).join('');
      return `<table class="invoice-items-table"><thead><tr>
        <th style="width:75%;text-align:left">ITEM / DESCRIÇÃO</th>
        <th style="width:25%;text-align:right">VALOR</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
    }

    const groups: Partial<Record<PartCategory, typeof data.parts>> = {};
    data.parts.forEach(p => {
      const cat: PartCategory = p.category ?? 'OUTROS';
      if (!groups[cat]) groups[cat] = [];
      groups[cat]!.push(p);
    });

    return CATEGORY_ORDER
      .filter(cat => groups[cat] && groups[cat]!.length > 0)
      .map(cat => {
        const meta  = PART_CATEGORY_META[cat];
        const items = groups[cat]!;

        const itemRows = items.map(item => `
          <tr>
            <td style="border-left:3px solid ${meta.color};padding-left:10px">${item.description}</td>
            <td class="text-right">${formatMoney(item.price)}</td>
          </tr>
        `).join('');

        return `
          <table class="invoice-items-table category-block" style="margin-bottom:0">
            <thead>
              <tr class="col-header-row">
                <th style="width:75%;text-align:left">ITEM / DESCRIÇÃO</th>
                <th style="width:25%;text-align:right">VALOR</th>
              </tr>
              <tr>
                <th colspan="2" class="category-group-header" style="
                  padding:4px 8px 4px 10px;
                  font-size:0.62rem;
                  font-weight:800;
                  text-transform:uppercase;
                  letter-spacing:0.07em;
                  color:${meta.color};
                  background-color:${meta.color}1a;
                  border-left:3px solid ${meta.color};
                  border-bottom:1px solid ${meta.color}44;
                  text-align:left;
                ">${meta.label}</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
        `;
      })
      .join('');
  };

  // ─────────────────────────────────────────────────────────────────
  // PÁGINA 1 — TERMOS E CONDIÇÕES + MÃO DE OBRA (texto)
  // ─────────────────────────────────────────────────────────────────
  const termsPageHtml = `
    <div class="terms-page">
      <div style="text-align:center;margin-bottom:10px">
        <div class="invoice-logo-circle" style="width:40px;height:40px;font-size:1.1rem;margin:0 auto 8px auto">AM</div>
        <h1 style="font-size:1rem;font-weight:900;text-transform:uppercase;letter-spacing:2px;margin:0">${settings.name || 'OFICINA MECÂNICA'}</h1>
        <p style="font-size:0.65rem;color:#888;letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-top:2px">TERMOS E CONDIÇÕES DE SERVIÇO</p>
      </div>

      <hr class="divider terms-divider" />

      <div class="terms-body">

        <div class="terms-clause">
          <h3>1. AUTORIZAÇÃO DE SERVIÇO</h3>
          <p>O cliente autoriza a execução dos serviços descritos nesta Ordem de Serviço, tendo sido previamente informado sobre os procedimentos, peças a serem utilizadas e valores estimados. A assinatura desta OS representa ciência e aceite integral dos termos aqui descritos.</p>
        </div>

        <div class="terms-clause">
          <h3>2. ORÇAMENTO E APROVAÇÃO</h3>
          <p>O orçamento aprovado pelo cliente é válido por 5 (cinco) dias úteis. A elaboração do orçamento técnico tem custo de <strong>R$ 150,00</strong>, referente à mão de obra de diagnóstico e avaliação. Este valor será <strong>integralmente abatido</strong> do valor final caso o cliente aprove e execute o serviço na oficina. Em caso de não aprovação, o valor será cobrado na íntegra. Caso durante a execução do serviço sejam identificados problemas adicionais, o cliente será consultado antes de qualquer serviço extra ser realizado. Serviços não autorizados não serão cobrados.</p>
        </div>

        <div class="terms-clause">
          <h3>3. PRAZO DE ENTREGA</h3>
          <p>O prazo de entrega informado é estimado e pode sofrer alterações em razão de disponibilidade de peças, complexidade do serviço ou fatores externos. O cliente será notificado prontamente em caso de alteração no prazo.</p>
        </div>

        <div class="terms-clause">
          <h3>4. GARANTIA DOS SERVIÇOS</h3>
          <p>Os serviços prestados possuem garantia de <strong>90 (noventa) dias</strong> a partir da data de entrega do veículo, conforme o Código de Defesa do Consumidor (Lei n.º 8.078/1990). A garantia cobre exclusivamente os serviços executados e peças fornecidas pela oficina, ficando excluídos danos causados por mau uso, acidentes, modificações externas ou falta de manutenção pelo cliente.</p>
        </div>

        <div class="terms-clause">
          <h3>5. PEÇAS E MATERIAIS</h3>
          <p>As peças fornecidas pela oficina são originais ou de qualidade equivalente, devidamente documentadas. O cliente poderá optar por fornecer suas próprias peças, desde que em conformidade técnica, sendo a garantia do serviço limitada neste caso. Caso o cli...