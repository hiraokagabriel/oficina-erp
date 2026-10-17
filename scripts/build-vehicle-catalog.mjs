// Gera src/data/veiculos-br.json a partir da API pública da FIPE (parallelum v2, tipo "cars", sem token).
// Uso: npm run vehicles:build   (retoma do cache em scripts/.cache/ se interrompido; apague a pasta para refazer tudo)
// O parse dos nomes (família, cilindrada, válvulas...) NÃO é feito aqui: fica em src/services/vehicleCatalog.ts (testado).
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://fipe.parallelum.com.br/api/v2/cars';
const CONCURRENCY = 4;
const PAUSE_MS = 120;
const MAX_TRIES = 6;
const ZERO_KM = 32000;

const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, '.cache');
const OUT = path.join(here, '..', 'src', 'data', 'veiculos-br.json');

// Nomes de exibição das marcas (o resto fica como a FIPE devolve, em Title Case se vier toda em maiúsculas).
const BRAND_ALIASES = {
  'VW - VolksWagen': 'Volkswagen',
  'GM - Chevrolet': 'Chevrolet',
  'Mercedes-Benz': 'Mercedes-Benz',
  'Land Rover': 'Land Rover',
  'CHANA': 'Changan',
};
const fixBrand = (name) => {
  const n = name.trim();
  if (BRAND_ALIASES[n]) return BRAND_ALIASES[n];
  if (n === n.toUpperCase() && n.length > 3) return n.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
  return n;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (p) => access(p).then(() => true, () => false);

// Limite diário da API anônima (HTTP 429 com retry-after de horas): não adianta esperar, para e grava o parcial.
class DailyLimitError extends Error {}
const MAX_WAIT_S = 300;
let stopped = false;

async function getJson(url) {
  let lastErr;
  for (let i = 0; i < MAX_TRIES; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { accept: 'application/json' } });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        if (res.status === 429 && retryAfter > MAX_WAIT_S) {
          throw new DailyLimitError(`limite de taxa da API: tente de novo em ${Math.round(retryAfter / 3600)} h`);
        }
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(Math.max(retryAfter * 1000, 1500 * 2 ** i));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // A API devolve UTF-8; res.json() decodifica como UTF-8.
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (/HTTP 4\d\d/.test(String(e.message)) ) throw e;
      await sleep(1500 * 2 ** i);
    }
  }
  throw lastErr;
}

async function cached(file, url) {
  const p = path.join(CACHE, file);
  if (await exists(p)) return JSON.parse(await readFile(p, 'utf8'));
  const data = await getJson(url);
  await writeFile(p, JSON.stringify(data));
  await sleep(PAUSE_MS);
  return data;
}

async function pool(items, worker) {
  let next = 0;
  const run = async () => { while (next < items.length) { const i = next++; await worker(items[i], i); } };
  await Promise.all(Array.from({ length: CONCURRENCY }, run));
}

// "2021,2023-2025" a partir de anos ordenados.
const rangesOf = (years) => {
  const out = [];
  for (let i = 0; i < years.length; ) {
    let j = i;
    while (j + 1 < years.length && years[j + 1] === years[j] + 1) j++;
    out.push(j > i ? `${years[i]}-${years[j]}` : `${years[i]}`);
    i = j + 1;
  }
  return out.join(',');
};

const t0 = Date.now();
await mkdir(CACHE, { recursive: true });
const brandsRaw = await cached('brands.json', `${BASE}/brands`);
console.log(`Marcas: ${brandsRaw.length}`);

const failures = [];
const jobs = [];
const modelsByBrand = new Map();
await pool(brandsRaw, async (b) => {
  try {
    const models = await cached(`models-${b.code}.json`, `${BASE}/brands/${b.code}/models`);
    modelsByBrand.set(b.code, models);
    for (const m of models) jobs.push({ brand: b, model: m });
  } catch (e) { failures.push(`modelos ${b.code} ${b.name}: ${e.message}`); }
});
console.log(`Versões: ${jobs.length}. Buscando anos (cache em ${CACHE})...`);

const yearsOf = new Map();
let done = 0;
let pending = 0;
await pool(jobs, async ({ brand, model }) => {
  if (stopped) { pending++; return; }
  try {
    const ys = await cached(`years-${brand.code}-${model.code}.json`, `${BASE}/brands/${brand.code}/models/${model.code}/years`);
    yearsOf.set(`${brand.code}/${model.code}`, ys);
  } catch (e) {
    if (e instanceof DailyLimitError) { stopped = true; pending++; console.log(`  PARADO: ${e.message}`); }
    else failures.push(`anos ${brand.code}/${model.code} ${model.name}: ${e.message}`);
  }
  done++;
  if (done % 250 === 0 || done === jobs.length) {
    const s = (Date.now() - t0) / 1000;
    console.log(`  ${done}/${jobs.length} (${Math.round(s)}s, ${failures.length} falhas)`);
  }
});

const brands = [];
const brandIdx = new Map();
const versions = [];
for (const b of brandsRaw) {
  for (const m of modelsByBrand.get(b.code) ?? []) {
    const ys = yearsOf.get(`${b.code}/${m.code}`);
    if (!ys) continue;
    const years = new Set();
    const fuels = new Set();
    for (const y of ys) {
      const [yr, fuel] = String(y.code).split('-');
      const n = Number(yr);
      if (!Number.isInteger(n) || n === ZERO_KM || n < 1900 || n > 2100) continue;
      years.add(n);
      if (fuel) fuels.add(fuel);
    }
    if (years.size === 0) continue;
    const display = fixBrand(b.name);
    if (!brandIdx.has(display)) { brandIdx.set(display, brands.length); brands.push(display); }
    versions.push([brandIdx.get(display), m.name.replace(/\s+/g, ' ').trim(), rangesOf([...years].sort((a, c) => a - c)), [...fuels].sort().join('')]);
  }
}

const out = {
  meta: {
    source: 'FIPE (API pública parallelum), tipo cars',
    generatedAt: new Date().toISOString(),
    format: 'versions: [brandIndex, nomeFIPE, "anos em faixas", "códigos de combustível FIPE: 1 gasolina 2 álcool 3 diesel 4 elétrico 5 flex 6 híbrido"]',
    brands: brands.length,
    versions: versions.length,
    failures: failures.length,
    partial: pending > 0,
    pendingVersions: pending,
  },
  brands,
  versions,
};
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
await writeFile(path.join(CACHE, 'failures.txt'), failures.join('\n'));
const secs = Math.round((Date.now() - t0) / 1000);
console.log(`Pronto em ${secs}s: ${brands.length} marcas, ${versions.length} versões, ${failures.length} falhas.`);
if (pending) {
  console.log(`ATENÇÃO: base PARCIAL, ${pending} versões ficaram sem anos (limite diário da API). Rode "npm run vehicles:build" de novo depois: o cache retoma de onde parou.`);
  process.exitCode = 2;
}
if (failures.length) { console.log('Falhas (rode de novo para retomar):'); failures.slice(0, 30).forEach((f) => console.log('  ' + f)); }
