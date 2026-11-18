#!/usr/bin/env node
// Gera um banco SINTÉTICO (nomes, telefones e placas falsos) para testar a importação para a nuvem.
// Uso: node scripts/make-synthetic-db.mjs <pasta> [--versao 3|5] [--os N] [--fotos]
// Nunca sobrescreve: recusa pasta que já tenha database.json. Recusa C:\OficinaData e a pasta sincronizada
// informada em OFICINA_PASTA_SINCRONIZADA (lista separada por ";"). Determinístico (semente fixa).
// Zero dependência: só `node:fs` e `node:path`.
import fs from 'node:fs';
import path from 'node:path';

const die = (msg) => { console.error(`Erro: ${msg}`); process.exit(1); };

// ---------- argumentos ----------

const args = process.argv.slice(2);
let folderArg = null;
let version = 5;
let osCount = 24;
let withPhotos = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--versao') {
    version = Number(args[++i]);
    if (version !== 3 && version !== 5) die('--versao aceita só 3 ou 5.');
  } else if (a === '--os') {
    osCount = Number(args[++i]);
    if (!Number.isInteger(osCount) || osCount < 8 || osCount > 5000) die('--os deve ser um inteiro de 8 a 5000.');
  } else if (a === '--fotos') withPhotos = true;
  else if (a.startsWith('--')) die(`opção desconhecida: ${a}`);
  else if (folderArg === null) folderArg = a;
  else die('só uma pasta de destino.');
}
if (!folderArg) die('uso: node scripts/make-synthetic-db.mjs <pasta> [--versao 3|5] [--os N] [--fotos]');
if (withPhotos && version !== 5) die('--fotos exige --versao 5 (fotos são do schema v5).');

// ---------- trava de caminho ----------

const folder = path.resolve(folderArg);
const norm = (p) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
const forbidden = ['C:\\OficinaData', ...(process.env.OFICINA_PASTA_SINCRONIZADA ?? '').split(';').map(s => s.trim()).filter(Boolean)];
for (const f of forbidden) {
  if (inside(norm(folder), norm(f))) die(`a pasta fica dentro de um caminho protegido (${f}). Use uma pasta temporária.`);
}
const dbFile = path.join(folder, 'database.json');
if (fs.existsSync(dbFile)) die(`já existe ${dbFile}. Não sobrescrevo.`);

// ---------- utilidades ----------

/** Gerador pseudoaleatório com semente fixa (mulberry32). */
let seed = 20261117;
const rnd = () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rnd() * list.length)];
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));

const pad = (n, w = 2) => String(n).padStart(w, '0');
/** ISO do meio-dia local do dia (só a data conta). */
const noon = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).toISOString();
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const BASE = new Date(2026, 9, 15, 12); // 15/10/2026
const dayOffset = (n) => new Date(BASE.getFullYear(), BASE.getMonth(), BASE.getDate() + n, 12);
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------- cadastros ----------

const technicians = ['Técnico Teste 1', 'Técnico Teste 2', 'Técnico Teste 3'].map((name, i) => ({ id: `tec-${i + 1}`, name }));

const CATEGORIES = ['MOTOR', 'FREIO', 'SUSPENSAO', 'ELETRICA', 'TRANSMISSAO', 'AR_CONDICIONADO', 'CARROCERIA', 'OUTROS'];
// Catálogo: com custo e sem custo (nunca cost: 0).
const catalogParts = Array.from({ length: 8 }, (_, i) => {
  const item = { id: `cp-${i + 1}`, description: `Peça Teste ${i + 1}`, price: int(30, 600) * 100 + 90, category: CATEGORIES[i % CATEGORIES.length] };
  if (i % 3 !== 2) item.cost = Math.round(item.price * 0.45);
  return item;
});
const catalogServices = Array.from({ length: 5 }, (_, i) => {
  const item = { id: `cs-${i + 1}`, description: `Serviço Teste ${i + 1}`, price: int(60, 400) * 100 };
  if (i % 2 === 0) item.cost = Math.round(item.price * 0.2);
  return item;
});

const clientCount = Math.max(8, Math.ceil(osCount / 2));
const clients = [];
const addClient = (name, vehicleList) => {
  const n = clients.length + 1;
  clients.push({
    id: `cli-${n}`, name, phone: String(11900000000 + n),
    vehicles: vehicleList.map((model, j) => ({ id: `veh-${n}-${j + 1}`, model, plate: `TST${pad(n, 2)}${j}${String.fromCharCode(65 + ((n + j) % 26))}`.slice(0, 7) })),
    ...(n % 4 === 0 ? { notes: 'Cliente de teste (observação sintética)' } : {}),
  });
};
// Homônimos: dois "José Silva" com telefones diferentes.
addClient('José Silva', ['Uno']);
addClient('José Silva', ['Gol', 'Palio']);
const MODELS = ['Uno', 'Gol', 'Palio', 'Corsa', 'Celta', 'Onix', 'Fox', 'Ka'];
for (let i = clients.length; i < clientCount; i++) addClient(`Cliente Teste ${i - 1}`, [pick(MODELS), ...(rnd() < 0.3 ? [pick(MODELS)] : [])]);

// ---------- OS e lançamentos ----------

const STATUSES = ['ORCAMENTO', 'APROVADO', 'EM_SERVICO', 'AGUARDANDO_PAGAMENTO', 'FINALIZADO', 'ARQUIVADO'];
const ledger = [];
const workOrders = [];
const auditLog = [];

const makeItems = (kind, count, osNo) => Array.from({ length: count }, (_, k) => {
  const price = int(20, 500) * 100 + (rnd() < 0.3 ? 50 : 0);
  const it = { id: `os${osNo}-${kind}${k + 1}`, description: `${kind === 'p' ? 'Peça' : 'Serviço'} ${osNo}-${k + 1}`, price };
  if (kind === 'p') it.category = pick(CATEGORIES);
  if (rnd() < 0.7) it.cost = Math.round(price * (0.2 + rnd() * 0.4)); // sem custo = campo ausente
  return it;
});

const advanceCount = { n: 0 };
for (let i = 0; i < osCount; i++) {
  const no = i + 1;
  const osId = `os-${no}`;
  const client = clients[i % clients.length];
  const veh = client.vehicles[i % client.vehicles.length];
  // As 6 primeiras cobrem todos os status; as demais seguem o ciclo, com mais finalizadas.
  const status = i < 6 ? STATUSES[i] : (i % 3 === 0 ? 'FINALIZADO' : STATUSES[i % STATUSES.length]);
  const parts = makeItems('p', int(1, 3), no);
  const services = makeItems('s', int(1, 2), no);
  const total = [...parts, ...services].reduce((s, it) => s + it.price, 0);
  const created = dayOffset(-(osCount - i) * 2);
  const os = {
    id: osId, osNumber: no, vehicle: `${veh.model} - ${veh.plate}`, clientName: client.name, clientPhone: client.phone,
    clientId: client.id, vehicleId: veh.id, mileage: int(20, 180) * 1000,
    status, parts, services, total, createdAt: noon(created),
    technician: technicians[i % technicians.length].name, technicianId: technicians[i % technicians.length].id,
  };
  if (i % 4 === 1) os.publicNotes = `Observação pública sintética ${no}`;
  if (status === 'APROVADO' || status === 'EM_SERVICO') os.expectedDate = noon(dayOffset(int(-3, 10)));
  const allCosts = [...parts, ...services].every(it => it.cost !== undefined);
  if (allCosts && (status === 'FINALIZADO' || status === 'ARQUIVADO')) {
    os.totalCost = [...parts, ...services].reduce((s, it) => s + it.cost, 0);
    os.profit = total - os.totalCost;
  }

  const entryBase = { createdAt: noon(created) };
  if (status === 'FINALIZADO' && i === 4) {
    // OS finalizada à vista.
    const pay = dayOffset(-(osCount - i) * 2 + 1);
    os.financialId = `led-os-${no}`;
    os.paymentMethod = 'SINGLE';
    os.paymentDate = noon(pay);
    ledger.push({ id: os.financialId, description: `Receita OS #${no}`, amount: total, type: 'CREDIT', effectiveDate: noon(pay), paymentDate: noon(pay), groupId: osId, ...entryBase });
  } else if (status === 'FINALIZADO' && i === 6) {
    // OS parcelada em 3: a primeira recebida, as outras abertas.
    const groupId = `grp-${no}`;
    const base = Math.floor(total / 3);
    const last = total - base * 2;
    os.paymentMethod = 'INSTALLMENT';
    os.paymentDate = noon(dayOffset(-(osCount - i) * 2 + 1));
    os.installmentConfig = {
      totalAmount: total, installments: 3, installmentAmount: base, lastInstallmentAmount: last,
      firstPaymentDate: noon(dayOffset(-5)), groupId, description: `OS #${no}`,
    };
    for (let k = 0; k < 3; k++) {
      const due = dayOffset(-5 + k * 30);
      ledger.push({
        id: `led-${groupId}-${k + 1}`, description: `OS #${no} - Parcela ${k + 1}/3`, amount: k === 2 ? last : base, type: 'CREDIT',
        effectiveDate: noon(due), dueDate: noon(due), ...(k === 0 ? { paymentDate: noon(due) } : {}),
        installmentGroupId: groupId, installmentNumber: k + 1, totalInstallments: 3, groupId: osId, ...entryBase,
      });
    }
  } else if (status === 'FINALIZADO' || status === 'ARQUIVADO') {
    const pay = dayOffset(-(osCount - i) * 2 + 1);
    os.financialId = `led-os-${no}`;
    os.paymentMethod = 'SINGLE';
    os.paymentDate = noon(pay);
    ledger.push({ id: os.financialId, description: `Receita OS #${no}`, amount: total, type: 'CREDIT', effectiveDate: noon(pay), paymentDate: noon(pay), groupId: osId, ...entryBase });
  } else if (status === 'AGUARDANDO_PAGAMENTO' && i % 2 === 0) {
    // Sem lançamento: entra em "A receber" pelo status.
  }

  // Adiantamento: só em OS não finalizada, nas de índice 1, 2 e 5 (e a cada 7ª).
  const takesAdvance = (status === 'APROVADO' || status === 'EM_SERVICO' || status === 'AGUARDANDO_PAGAMENTO') && (i % 2 === 0 || i < 6);
  if (takesAdvance) {
    const amount = Math.max(1000, Math.floor(total / 4 / 100) * 100);
    const when = dayOffset(-(osCount - i) * 2 + 1);
    const entryId = `led-adv-${no}`;
    ledger.push({ id: entryId, description: `Adiantamento OS #${no}`, amount, type: 'CREDIT', effectiveDate: noon(when), paymentDate: noon(when), groupId: osId, ...entryBase });
    advanceCount.n += 1;
    if (version < 4) {
      os.advanceAmount = amount;
      os.advanceEntryId = entryId;
    } else {
      os.advances = [{ id: `adv-${no}`, date: noon(when), amount, entryId }];
      auditLog.push({ id: `aud-${no}`, at: noon(when), machine: 'PC-TESTE', action: 'ADIANTAMENTO_CRIADO', osId, osNumber: no, advanceId: `adv-${no}`, after: { date: noon(when), amount } });
    }
  }
  workOrders.push(os);
}

// OS "solta": homônimo sem vínculo por id (só o nome).
delete workOrders[workOrders.length - 1].clientId;
delete workOrders[workOrders.length - 1].vehicleId;
workOrders[workOrders.length - 1].clientName = 'José Silva';
workOrders[workOrders.length - 1].clientPhone = clients[0].phone;

// Lançamentos manuais: entradas e despesas, pagas e abertas.
for (let k = 0; k < 6; k++) {
  const d = dayOffset(-k * 6);
  const credit = k % 2 === 0;
  ledger.push({
    id: `led-man-${k + 1}`, description: credit ? `Entrada avulsa ${k + 1}` : `Despesa teste ${k + 1}`,
    amount: int(20, 900) * 100 + (k * 7), type: credit ? 'CREDIT' : 'DEBIT', effectiveDate: noon(d), createdAt: noon(d),
    ...(k < 4 ? { paymentDate: noon(d) } : { dueDate: noon(dayOffset(k * 3)) }),
  });
}

// Agendamentos.
const appointments = Array.from({ length: 5 }, (_, k) => {
  const c = clients[k % clients.length];
  const v = c.vehicles[0];
  return {
    id: `ag-${k + 1}`, date: noon(dayOffset(k - 1)), ...(k % 2 === 0 ? { time: `${pad(8 + k)}:30` } : {}),
    clientName: c.name, clientId: c.id, clientPhone: c.phone, vehicle: `${v.model} - ${v.plate}`, vehicleId: v.id,
    reason: `Revisão de teste ${k + 1}`, status: ['AGENDADO', 'COMPARECEU', 'CANCELADO', 'FALTOU', 'AGENDADO'][k],
    createdAt: noon(dayOffset(-3)),
  };
});

// ---------- fotos ----------

/** JPEG 1x1 válido (baseline) com um comentário único para os arquivos diferirem. */
const BASE_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const jpeg = (tag) => {
  const text = Buffer.from(tag, 'latin1');
  const com = Buffer.concat([Buffer.from([0xFF, 0xFE, (text.length + 2) >> 8, (text.length + 2) & 0xFF]), text]);
  return Buffer.concat([BASE_JPEG.subarray(0, 2), com, BASE_JPEG.subarray(2)]);
};

const photoFiles = []; // { osId, photoId, thumb:boolean }
let photoMeta = 0;
let photoMissing = 0;
let photoOrphans = 0;
if (withPhotos) {
  const targets = workOrders.slice(0, Math.min(6, workOrders.length));
  targets.forEach((os, idx) => {
    const n = 1 + (idx % 2);
    os.photos = [];
    for (let k = 0; k < n; k++) {
      const id = `foto-${os.osNumber}-${k + 1}`;
      os.photos.push({ id, createdAt: noon(dayOffset(-idx)), ...(k === 0 ? { caption: `Foto de teste ${os.osNumber}` } : {}) });
      photoFiles.push({ osId: os.id, photoId: id, thumb: true });
      photoMeta++;
    }
  });
  // 1 foto referenciada sem arquivo.
  targets[0].photos.push({ id: 'foto-sem-arquivo', createdAt: noon(dayOffset(-1)), caption: 'Sem arquivo no disco' });
  photoMeta++; photoMissing++;
  // 1 arquivo sem metadado.
  photoFiles.push({ osId: targets[1].id, photoId: 'foto-orfa', thumb: true });
  photoOrphans++;
}

// ---------- monta e grava ----------

const settings = { name: 'OFICINA TESTE', cnpj: '00.000.000/0000-00', address: 'Rua Teste, 123', exportPath: '', targetMargin: 70, logoText: 'TS' };
const db = {
  ledger, workOrders, clients, catalogParts, catalogServices, catalogTechnicians: technicians, appointments, settings,
  ...(version >= 4 ? { auditLog } : {}),
  meta: { schemaVersion: version, revision: `synthetic-${version}-0001`, history: [], savedAt: noon(BASE), savedBy: 'PC-TESTE' },
};
if (version < 3) delete db.appointments;

fs.mkdirSync(folder, { recursive: true });
// `wx` falha se alguém criou o arquivo no meio tempo: nunca sobrescreve.
fs.writeFileSync(dbFile, JSON.stringify(db, null, 2), { encoding: 'utf8', flag: 'wx' });
let filesWritten = 0;
for (const f of photoFiles) {
  const dir = path.join(folder, 'fotos', f.osId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${f.photoId}.jpg`), jpeg(`orig ${f.osId} ${f.photoId}`), { flag: 'wx' });
  if (f.thumb) fs.writeFileSync(path.join(dir, `${f.photoId}.t.jpg`), jpeg(`thumb ${f.osId} ${f.photoId}`), { flag: 'wx' });
  filesWritten += f.thumb ? 2 : 1;
}

// ---------- resumo ----------

const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);
const byStatus = Object.fromEntries(STATUSES.map(s => [s, workOrders.filter(o => o.status === s).length]));
const creditos = sum(ledger.filter(e => e.type === 'CREDIT'), e => e.amount);
const debitos = sum(ledger.filter(e => e.type === 'DEBIT'), e => e.amount);
console.log(`Banco sintético v${version} gravado em ${dbFile}`);
console.log(`  Clientes: ${clients.length} (homônimos: 2 "José Silva")`);
console.log(`  Catálogo: ${catalogParts.length} peças, ${catalogServices.length} serviços (${catalogParts.filter(i => i.cost === undefined).length + catalogServices.filter(i => i.cost === undefined).length} sem custo)`);
console.log(`  Técnicos: ${technicians.length}; Agendamentos: ${version >= 3 ? appointments.length : 0}`);
console.log(`  OS: ${workOrders.length} (${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(', ')})`);
console.log(`  Soma dos totais das OS: ${brl(sum(workOrders, o => o.total))}`);
console.log(`  Adiantamentos: ${advanceCount.n} (${version < 4 ? 'legado advanceAmount/advanceEntryId' : 'advances'}), soma ${brl(sum(ledger.filter(e => e.id.startsWith('led-adv-')), e => e.amount))}`);
console.log(`  Lançamentos: ${ledger.length} (pagos: ${ledger.filter(e => e.paymentDate).length}); entradas ${brl(creditos)}, saídas ${brl(debitos)}, saldo ${brl(creditos - debitos)}`);
if (version >= 4) console.log(`  Auditoria: ${auditLog.length} eventos`);
if (withPhotos) console.log(`  Fotos: ${photoMeta} nos metadados (${photoMissing} sem arquivo), ${photoOrphans} arquivo sem metadado, ${filesWritten} arquivos JPEG gravados`);
