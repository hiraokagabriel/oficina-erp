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
          <p>As peças fornecidas pela oficina são originais ou de qualidade equivalente, devidamente documentadas. O cliente poderá optar por fornecer suas próprias peças, desde que em conformidade técnica, sendo a garantia do serviço limitada neste caso. Caso o cliente opte por fornecer suas próprias peças, será cobrada uma taxa de <strong>R$ 15,00 por dia</strong> referente ao período em que o veículo permanecer na oficina aguardando a entrega das peças pelo cliente. Peças substituídas ficarão à disposição do cliente por até 24 horas após a entrega.</p>
        </div>

        <div class="terms-clause">
          <h3>6. RESPONSABILIDADE SOBRE O VEÍCULO</h3>
          <p>A oficina não se responsabiliza por objetos pessoais deixados no interior do veículo, danos pré-existentes não documentados na entrada ou problemas decorrentes de desgaste natural não relacionado ao serviço contratado.</p>
        </div>

        <div class="terms-clause">
          <h3>7. ARMAZENAGEM</h3>
          <p>Após a conclusão do serviço e notificação ao cliente, o veículo poderá ser armazenado por até <strong>3 (três) dias úteis</strong> sem custo adicional. Após esse prazo, poderá ser cobrada taxa de armazenagem de R$ 50,00 por dia.</p>
        </div>

        <div class="terms-clause">
          <h3>8. PAGAMENTO</h3>
          <p>O pagamento deverá ser efetuado na retirada do veículo, nas condições acordadas no orçamento. O veículo somente será liberado após a quitação integral dos serviços prestados, conforme art. 578 do Código Civil (direito de retenção).</p>
        </div>

        <div class="terms-clause">
          <h3>9. DADOS PESSOAIS (LGPD)</h3>
          <p>Os dados pessoais coletados são utilizados exclusivamente para fins de prestação de serviço, emissão de documentos fiscais e comunicação com o cliente, em conformidade com a Lei Geral de Proteção de Dados (Lei n.º 13.709/2018).</p>
        </div>

        <div class="terms-clause" style="margin-bottom:0">
          <h3>10. FORO</h3>
          <p>Fica eleito o foro da comarca de <strong>São Paulo – SP</strong> para dirimir quaisquer controvérsias decorrentes desta relação de consumo.</p>
        </div>
      </div>

      <hr class="divider terms-divider" style="margin-top:10px" />
      <p style="font-size:7.5pt;color:#888;text-align:center">${settings.name || ''} &nbsp;|&nbsp; ${settings.address || ''} &nbsp;|&nbsp; ${settings.cnpj || ''}</p>
    </div>

    <div class="labor-page">
      <div style="text-align:center;margin-bottom:10px">
        <h1 style="font-size:0.95rem;font-weight:900;text-transform:uppercase;letter-spacing:2px;margin:0">MÃO DE OBRA</h1>
        <p style="font-size:0.65rem;color:#888;letter-spacing:1.5px;font-weight:700;text-transform:uppercase;margin-top:2px">Nota técnica sobre tempos de mão de obra</p>
      </div>

      <hr class="divider terms-divider" />

      <div class="labor-body">
        <p>
          <strong>Observação técnica sobre tempos de mão de obra:</strong>
          Os tempos de execução apresentados nesta ficha técnica possuem caráter referencial e padronizador,
          tendo sido estruturados com base em tabelas tempárias, catálogos de tempo de serviço e guias técnicos
          de mão de obra adotados no setor de reparação automotiva no Brasil e no exterior.
        </p>
        <p>
          Como fundamento nacional, foram consideradas referências institucionais do sistema SINDIREPA,
          incluindo tabelas de tempos de serviços automotivos e catálogos tempários utilizados como parâmetro
          para elaboração de orçamentos, controle de produtividade e padronização de processos em oficinas
          independentes.
        </p>
        <p>
          No âmbito internacional, foram observados guias técnicos de mercado amplamente utilizados, como
          os sistemas de labor times da Mitchell 1 e os Estimated Work Times da MOTOR Information Systems,
          ambos reconhecidos pela padronização de tempos operacionais e pela aplicação em ambientes
          profissionais de reparação e estimativa técnica.
        </p>
        <p>
          Os tempos aqui indicados devem ser compreendidos como tempo padrão de operação em condições
          normais de execução, considerando profissional qualificado, ferramental compatível, estrutura técnica
          adequada e ausência de intercorrências excepcionais. Em conformidade com a prática do setor, esses
          tempos não representam garantia absoluta de duração cronológica real, pois podem variar conforme
          marca, modelo, motorização, grau de acesso ao componente, estado de conservação do veículo, nível de
          corrosão, presença de adaptações anteriores, qualidade de reparos preexistentes e disponibilidade de
          equipamentos específicos.
        </p>
        <p>
          Também devem ser observadas eventuais sobreposições de operações, tempos combinados, necessidades
          de diagnóstico adicional, testes finais, reaprendizados eletrônicos, programação de módulos e
          procedimentos complementares exigidos por fabricantes ou pelas condições particulares do veículo
          atendido.
        </p>
        <p>
          Para fins de composição de orçamento, os tempos podem ser aplicados segundo o sistema de hora
          centesimal, metodologia amplamente adotada em catálogos tempários brasileiros, na qual a hora
          técnica é dividida em cem partes iguais para facilitar a soma das operações e a multiplicação direta
          pelo valor do homem-hora praticado pela empresa.
        </p>
        <p>
          Assim, esta ficha técnica deve ser utilizada como instrumento de referência técnica e comercial, apto a
          promover maior uniformidade nos orçamentos, transparência na relação com o cliente e coerência na
          formação de preços, sem afastar a necessidade de avaliação individual de cada veículo e de cada ordem
          de serviço.
        </p>
      </div>

      <hr class="divider terms-divider" style="margin-top:10px" />
      <p style="font-size:7.5pt;color:#888;text-align:center">${settings.name || ''} &nbsp;|&nbsp; ${settings.address || ''} &nbsp;|&nbsp; ${settings.cnpj || ''}</p>
    </div>
  `;

  const printContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${documentTitle}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @page { size: A4; margin: 15mm; }
        html, body { height: 100%; margin: 0; padding: 0; }
        body {
          font-family: 'Inter', Arial, sans-serif;
          background: #FFFFFF;
          color: #111;
          font-size: 11px;
          line-height: 1.5;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* ── PÁGINAS DE TEXTO FIXO ── */
        .terms-page {
          page-break-after: always;
          break-after: page;
          padding-top: 8px;
        }
        .labor-page {
          page-break-after: always;
          break-after: page;
          padding-top: 8px;
        }
        .summary-page {
          page-break-before: always;
          padding-top: 20px;
        }
        .terms-body, .labor-body { margin-top: 8px; }
        .terms-clause { margin-bottom: 7px; }
        .terms-clause h3 {
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #F59E0B;
          margin-bottom: 2px;
        }
        .terms-clause p, .labor-body p {
          font-size: 0.76rem;
          color: #222;
          line-height: 1.45;
          margin-bottom: 6px;
        }
        /* divider mais compacto dentro dos textos fixos */
        .terms-divider { margin: 10px 0 !important; }

        /* ── RESUMO DA OS ── */
        .summary-header {
          text-align: center;
          margin-bottom: 12px;
        }
        .summary-title {
          font-size: 0.9rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          margin: 0;
        }
        .summary-subtitle {
          font-size: 0.7rem;
          color: #666;
          margin-top: 3px;
        }
        .summary-grid {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-top: 18px;
        }
        .summary-card {
          flex: 1;
          border: 1px solid #ddd;
          border-radius: 6px;
          padding: 10px 12px;
        }
        .summary-card-total {
          border-color: #F59E0B;
          box-shadow: 0 0 0 1px #F59E0B1a;
        }
        .summary-label {
          display: block;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #666;
          margin-bottom: 4px;
        }
        .summary-value {
          font-size: 1rem;
          font-weight: 700;
        }
        .summary-total {
          font-size: 1.3rem;
          font-weight: 900;
          color: #F59E0B;
        }

        /* ── ESTRUTURA PRINCIPAL ── */
        .page-container { display: table; width: 100%; height: 100%; }
        .page-header  { display: table-header-group; }
        .page-content { display: table-row-group; }
        .page-footer  { display: table-footer-group; page-break-inside: avoid; }

        .invoice-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 25px;
          padding-top: 20px;
        }
        .invoice-col { flex: 1; }
        .client-col  { text-align: right; }
        .label-sm {
          font-size: 0.65rem;
          color: #888;
          letter-spacing: 1px;
          margin-bottom: 4px;
          font-weight: 700;
          text-transform: uppercase;
          display: block;
        }
        .company-name, .client-name {
          font-size: 1.1rem;
          font-weight: 800;
          margin: 0 0 4px 0;
          text-transform: uppercase;
          color: #000;
        }
        .invoice-col p { margin: 2px 0; font-size: 0.8rem; color: #333; }
        .invoice-logo-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: center;
          gap: 8px;
        }
        .invoice-main-title {
          font-size: 0.8rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0;
          color: #000;
          text-align: center;
          line-height: 1;
        }
        .via-label {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #F59E0B;
          text-align: center;
          margin-top: 2px;
        }
        .invoice-logo-circle {
          width: 50px;
          height: 50px;
          background-color: #222;
          color: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
          font-weight: 800;
          letter-spacing: -1px;
        }
        .divider { border: 0; border-top: 1px solid #ddd; margin: 15px 0; }
        .invoice-meta-grid {
          display: flex;
          justify-content: space-between;
          margin-bottom: 25px;
        }
        .meta-item { display: flex; flex-direction: column; }
        .meta-value { font-size: 1rem; font-weight: 600; margin-top: 4px; color: #000; }
        .meta-value.status-print {
          font-size: 0.8rem;
          text-transform: uppercase;
          border: 1px solid #000;
          padding: 2px 6px;
          border-radius: 4px;
        }
        .section-title {
          color: #F59E0B;
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 0 0 5px 0;
          border-bottom: 2px solid #F59E0B;
          display: inline-block;
          padding-bottom: 2px;
        }

        /* ── TABELAS DE ITENS ── */
        .invoice-items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 5px;
        }
        .invoice-items-table thead { display: table-header-group; }
        .invoice-items-table tbody { display: table-row-group; }
        .invoice-items-table th {
          padding: 6px 0;
          border-bottom: 1px solid #bbb;
          font-size: 0.7rem;
          color: #444;
          text-transform: uppercase;
          font-weight: 700;
        }
        .col-header-row th {
          font-size: 0.65rem;
          color: #666;
          border-bottom: 1px solid #ccc;
        }
        .invoice-items-table td {
          padding: 6px 0;
          border-bottom: 1px solid #eee;
          font-size: 0.85rem;
          color: #111;
        }
        .text-right { text-align: right; }
        .subtotal-row {
          text-align: right;
          font-size: 0.85rem;
          font-weight: 600;
          color: #444;
          padding: 8px 0;
          display: flex;
          justify-content: flex-end;
          gap: 20px;
        }
        .subtotal-value { font-weight: 700; color: #000; }
        .table-section { margin-top: 30px; }

        .invoice-footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px dashed #000;
          page-break-inside: avoid;
        }
        .signature-area {
          display: flex;
          justify-content: space-around;
          gap: 30px;
          margin-bottom: 15px;
        }
        .signature-block { flex: 1; text-align: center; max-width: 240px; }
        .sign-space { height: 17mm; border-bottom: 1px solid #000; margin-bottom: 5px; }
        .sign-name  { display: block; font-size: 0.85rem; font-weight: 700; color: #000; margin-top: 3px; }
        .sign-label { display: block; font-size: 0.6rem; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
        .footer-text-block { text-align: center; border-top: 1px dashed #ddd; padding-top: 8px; }
        .declaration-text { font-size: 0.65rem; color: #333; margin-bottom: 3px; }
        .thank-you-msg {
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #F59E0B;
        }

        .summary-signature {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px dashed #000;
        }

        .invoice-header,
        .invoice-meta-grid { page-break-inside: avoid; }
      </style>
    </head>
    <body>

      ${termsPageHtml}

      <div class="page-container">
        <div class="page-content">
          <header class="invoice-header">
            <div class="invoice-col supplier-col">
              <h4 class="label-sm">PRESTADOR DE SERVIÇO</h4>
              <h2 class="company-name">${settings.name || 'NOME DA OFICINA'}</h2>
              <p>${settings.address || 'Endereço não informado'}</p>
              <p>${settings.cnpj || 'CNPJ não informado'}</p>
              ${data.technician ? `<p>Téc. Resp: ${data.technician}</p>` : ''}
            </div>
            <div class="invoice-logo-area">
              <h1 class="invoice-main-title">ORDEM DE SERVIÇO</h1>
              ${viaLabel ? `<p class="via-label">${viaLabel}</p>` : ''}
              <div class="invoice-logo-circle">AM</div>
            </div>
            <div class="invoice-col client-col">
              <h4 class="label-sm">CLIENTE</h4>
              <h2 class="client-name">${data.clientName}</h2>
              <p>${data.clientPhone}</p>
              <div style="margin-top:8px">
                <p><strong>Veículo:</strong> ${data.vehicle}</p>
                <p><strong>KM:</strong> ${data.mileage}</p>
              </div>
            </div>
          </header>
          <hr class="divider" />
          <div class="invoice-meta-grid">
            <div class="meta-item">
              <span class="label-sm">NÚMERO OS</span>
              <span class="meta-value">#${data.osNumber}</span>
            </div>
            <div class="meta-item">
              <span class="label-sm">DATA EMISSÃO</span>
              <span class="meta-value">${formatDate(data.createdAt)}</span>
            </div>
            <div class="meta-item">
              <span class="label-sm">STATUS</span>
              <span class="meta-value status-print">${STATUS_LABELS[data.status]}</span>
            </div>
          </div>
          <hr class="divider" />

          <div class="table-section">
            <h3 class="section-title">PEÇAS E MATERIAIS</h3>
            ${buildPartsHtml()}
            <div class="subtotal-row">
              <span>Subtotal Peças:</span>
              <span class="subtotal-value">${formatMoney(subtotalParts)}</span>
            </div>
          </div>

          <div class="table-section">
            <h3 class="section-title">MÃO DE OBRA E SERVIÇOS</h3>
            <table class="invoice-items-table">
              <thead>
                <tr>
                  <th style="width:75%;text-align:left">DESCRIÇÃO DO SERVIÇO</th>
                  <th style="width:25%;text-align:right">VALOR</th>
                </tr>
              </thead>
              <tbody>
                ${data.services.length === 0
                  ? '<tr><td colspan="2" style="font-style:italic;color:#999;padding:15px 0">Nenhum serviço registrado.</td></tr>'
                  : data.services.map(item => `
                    <tr>
                      <td>${item.description}</td>
                      <td class="text-right">${formatMoney(item.price)}</td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
            <div class="subtotal-row">
              <span>Subtotal Serviços:</span>
              <span class="subtotal-value">${formatMoney(subtotalServices)}</span>
            </div>
          </div>

          <div class="invoice-footer">
            <div class="signature-area">
              ${signatureBlock}
            </div>
            <div class="footer-text-block">
              <p class="declaration-text">
                Declaro ter recebido os serviços e produtos acima descritos em perfeito estado.
              </p>
              <p class="thank-you-msg">
                OBRIGADO PELA PREFERÊNCIA!
              </p>
            </div>
          </div>
        </div>

        <div class="page-footer"></div>
      </div>

      <div class="summary-page">
        <div class="summary-header">
          <h1 class="summary-title">Resumo da Ordem de Serviço</h1>
          <p class="summary-subtitle">OS #${data.osNumber} &nbsp;•&nbsp; ${data.clientName}</p>
        </div>
        <hr class="divider" />
        <div class="summary-grid">
          <div class="summary-card">
            <span class="summary-label">Subtotal Peças</span>
            <span class="summary-value">${formatMoney(subtotalParts)}</span>
          </div>
          <div class="summary-card">
            <span class="summary-label">Subtotal Serviços</span>
            <span class="summary-value">${formatMoney(subtotalServices)}</span>
          </div>
          <div class="summary-card summary-card-total">
            <span class="summary-label">Total Geral</span>
            <span class="summary-total">${formatMoney(data.total)}</span>
          </div>
        </div>
        <div class="summary-signature">
          <div class="signature-area">
            ${signatureBlock}
          </div>
          <div class="footer-text-block">
            <p class="declaration-text">
              Declaro ter recebido os serviços e produtos acima descritos em perfeito estado.
            </p>
            <p class="thank-you-msg">
              OBRIGADO PELA PREFERÊNCIA!
            </p>
          </div>
        </div>
        <hr class="divider terms-divider" style="margin-top:20px" />
        <p style="font-size:7.5pt;color:#888;text-align:center">${settings.name || ''} &nbsp;|&nbsp; ${settings.address || ''} &nbsp;|&nbsp; ${settings.cnpj || ''}</p>
      </div>

    </body>
    </html>
  `;

  const originalTitle = document.title;
  document.title = documentTitle;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'absolute';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(printContent);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
        console.log(`🖨️ Imprimindo: ${documentTitle}`);
      } catch (err) {
        console.error('Erro ao imprimir:', err);
        alert('Erro ao abrir janela de impressão.');
      }
      setTimeout(() => {
        document.body.removeChild(iframe);
        document.title = originalTitle;
      }, 500);
    }, 250);
  } else {
    console.error('Não foi possível acessar o documento do iframe');
    document.body.removeChild(iframe);
    document.title = originalTitle;
  }
}
