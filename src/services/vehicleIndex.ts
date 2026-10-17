// Carga preguiçosa e única do catálogo de veículos (JSON grande fora do bundle inicial).
// Falha de carga nunca quebra o campo: devolve null e o combobox segue só com cliente e histórico da oficina.
import { buildIndex, type RawVehicleCatalog, type VehicleCatalog } from './vehicleCatalog';

let cached: VehicleCatalog | null = null;
let pending: Promise<VehicleCatalog | null> | null = null;

/** Índice já carregado (ou null). */
export const getVehicleIndex = (): VehicleCatalog | null => cached;

/** Carrega o JSON e monta o índice uma vez; chamadas simultâneas dividem a mesma promessa. */
export const loadVehicleIndex = (): Promise<VehicleCatalog | null> => {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = (async () => {
      try {
        const raw = (await import('../data/veiculos-br.json')).default as unknown as RawVehicleCatalog;
        // Cede o fio antes do trabalho pesado para a digitação em curso não travar.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        cached = buildIndex(raw);
        return cached;
      } catch (err) {
        console.warn('Base de veículos indisponível; seguindo sem ela.', err);
        pending = null;
        return null;
      }
    })();
  }
  return pending;
};
