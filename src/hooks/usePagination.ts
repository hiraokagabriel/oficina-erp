import { useState, useMemo, useCallback } from 'react';

interface UsePaginationProps<T> {
  items: T[];
  itemsPerPage?: number;
}

export const usePagination = <T,>({ 
  items, 
  itemsPerPage = 50 
}: UsePaginationProps<T>) => {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(items.length / itemsPerPage);
  
  const paginatedItems = useMemo(() => {
    const start = 0;
    const end = currentPage * itemsPerPage;
    return items.slice(start, end);
  }, [items, currentPage, itemsPerPage]);

  const loadMore = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, totalPages]);

  const reset = useCallback(() => {
    setCurrentPage(1);
  }, []);

  const hasMore = currentPage < totalPages;

  return {
    paginatedItems,
    loadMore,
    reset,
    hasMore,
    currentPage,
    totalPages,
    totalItems: items.length,
    loadedItems: paginatedItems.length
  };
};
