import { Cents } from '../shared/Money';

export interface CatalogItem {
  description: string;
  price: Cents;
  lastUsed: string;
}

// Aprende novos itens ou atualiza preços dos existentes
export const learnCatalogItems = (
  currentCatalog: CatalogItem[],
  newItems: { description: string, price: Cents }[]
): CatalogItem[] => {
  let updatedCatalog = [...currentCatalog];

  newItems.forEach(newItem => {
    const normalizedDesc = newItem.description.trim();
    if (!normalizedDesc) return;

    const index = updatedCatalog.findIndex(
      item => item.description.toLowerCase() === normalizedDesc.toLowerCase()
    );

    const entry: CatalogItem = {
      description: normalizedDesc,
      price: newItem.price, // Atualiza para o preço mais recente
      lastUsed: new Date().toISOString()
    };

    if (index >= 0) {
      updatedCatalog[index] = entry;
    } else {
      updatedCatalog.push(entry);
    }
  });

  // Mantém ordenado alfabeticamente
  return updatedCatalog.sort((a, b) => a.description.localeCompare(b.description));
};