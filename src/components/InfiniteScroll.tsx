import React, { useRef, useEffect } from 'react';

interface InfiniteScrollProps {
  hasMore: boolean;
  isLoading?: boolean;
  loadMore: () => void;
  children: React.ReactNode;
  threshold?: number;
}

export const InfiniteScroll: React.FC<InfiniteScrollProps> = ({ 
  hasMore, 
  isLoading = false, 
  loadMore, 
  children,
  threshold = 0.8
}) => {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, isLoading, loadMore, threshold]);

  return (
    <>
      {children}
      {hasMore && (
        <div 
          ref={observerTarget} 
          style={{ 
            height: '20px', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            padding: '10px'
          }}
        >
          {isLoading ? '⏳ Carregando...' : '⬇️ Role para carregar mais'}
        </div>
      )}
    </>
  );
};
