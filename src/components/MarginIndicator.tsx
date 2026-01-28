import React from 'react';

interface MarginIndicatorProps {
  cost: number;
  price: number;
  formatMoney: (val: number) => string;
  onSuggestPrice?: (suggestedPrice: number) => void;
  minMarginPercent?: number; // Margem mínima desejada (padrão 70%)
}

export const MarginIndicator: React.FC<MarginIndicatorProps> = ({
  cost,
  price,
  formatMoney,
  onSuggestPrice,
  minMarginPercent = 70
}) => {
  // Evitar divisão por zero
  if (price === 0) return null;
  
  const margin = ((price - cost) / price) * 100;
  const suggestedPrice = cost / (1 - minMarginPercent / 100);
  
  // Determina cor baseada na margem
  const getColor = () => {
    if (margin >= 70) return '#22c55e'; // Verde
    if (margin >= 31) return '#f59e0b'; // Amarelo/Laranja
    return '#ef4444'; // Vermelho
  };
  
  const getBackgroundGradient = () => {
    const percentage = Math.min(Math.max(margin, 0), 100);
    const color = getColor();
    return `linear-gradient(to right, ${color}30 0%, ${color}30 ${percentage}%, transparent ${percentage}%)`;
  };

  return (
    <div style={{
      padding: '8px',
      borderRadius: '6px',
      background: getBackgroundGradient(),
      border: `1px solid ${getColor()}40`,
      fontSize: '0.75rem',
      marginTop: '4px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <span style={{ fontWeight: 'bold', color: getColor() }}>
          Margem: {margin.toFixed(1)}%
        </span>
        {cost > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
            Custo: {formatMoney(cost)}
          </span>
        )}
      </div>
      
      {/* Barra visual */}
      <div style={{
        height: '8px',
        backgroundColor: 'var(--border)',
        borderRadius: '4px',
        overflow: 'hidden',
        position: 'relative'
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(Math.max(margin, 0), 100)}%`,
          backgroundColor: getColor(),
          transition: 'all 0.3s ease'
        }} />
        
        {/* Marcador de margem mínima */}
        <div style={{
          position: 'absolute',
          left: `${minMarginPercent}%`,
          top: 0,
          bottom: 0,
          width: '2px',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          boxShadow: '0 0 4px rgba(0,0,0,0.3)'
        }} />
      </div>
      
      {/* Sugestão de preço */}
      {margin < minMarginPercent && cost > 0 && onSuggestPrice && (
        <div style={{
          marginTop: '6px',
          padding: '4px 6px',
          backgroundColor: 'rgba(130, 87, 230, 0.1)',
          borderRadius: '4px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            💡 Preço sugerido ({minMarginPercent}%):
          </span>
          <button
            onClick={() => onSuggestPrice(Math.round(suggestedPrice))} // ✅ suggestedPrice já está em centavos
            style={{
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '0.7rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
            type="button"
          >
            {formatMoney(Math.round(suggestedPrice))}
          </button>
        </div>
      )}
      
      {/* Indicador de lucro */}
      {cost > 0 && (
        <div style={{
          marginTop: '4px',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>Lucro:</span>
          <span style={{ fontWeight: 'bold', color: getColor() }}>
            {formatMoney(price - cost)}
          </span>
        </div>
      )}
    </div>
  );
};