import React from 'react';

interface LoadingSkeletonProps {
  type?: 'page' | 'card' | 'list';
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ type = 'page' }) => {
  if (type === 'page') {
    return (
      <div className="loading-skeleton-page" style={{
        padding: '40px',
        animation: 'fadeIn 0.3s ease-in'
      }}>
        {/* Header Skeleton */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px'
        }}>
          <div className="skeleton" style={{ width: '200px', height: '40px', borderRadius: '8px' }} />
          <div className="skeleton" style={{ width: '150px', height: '44px', borderRadius: '8px' }} />
        </div>

        {/* Cards Grid Skeleton */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
        }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card">
              <div className="skeleton" style={{ width: '60%', height: '20px', marginBottom: '12px' }} />
              <div className="skeleton" style={{ width: '100%', height: '48px' }} />
            </div>
          ))}
        </div>

        {/* Content Skeleton */}
        <div className="card">
          <div className="skeleton" style={{ width: '30%', height: '28px', marginBottom: '20px' }} />
          <div className="skeleton skeleton-block" style={{ height: '400px' }} />
        </div>
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className="card" style={{ animation: 'pulse 1.5s ease-in-out infinite' }}>
        <div className="skeleton" style={{ width: '60%', height: '20px', marginBottom: '12px' }} />
        <div className="skeleton" style={{ width: '100%', height: '100px' }} />
      </div>
    );
  }

  // List type
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="skeleton" style={{ width: '100%', height: '60px', borderRadius: '8px' }} />
      ))}
    </div>
  );
};

// Spinner alternativo (mais leve)
export const LoadingSpinner: React.FC = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    flexDirection: 'column',
    gap: '16px'
  }}>
    <div className="spinner" style={{ width: '48px', height: '48px' }} />
    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Carregando...</p>
  </div>
);