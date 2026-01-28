import React from 'react';

interface MarginIndicatorProps {
  cost: number;
  price: number;
  formatMoney: (val: number) => string;
  onSuggestedPriceClick?: (suggestedPrice: number) => void;
}

export const MarginIndicator: React.FC<MarginIndicatorProps> = ({
  cost,
  price,
  formatMoney,
  onSuggestedPriceClick
}) => {
  // Calcula margem atual
  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
  
  // Calcula preço sugerido para margem de 75%
  const targetMargin = 75;
  const suggestedPrice = cost > 0 ? cost / (1 - targetMargin / 100) : 0;
  const minPrice = cost > 0 ? cost / (1 - 31 / 100) : 0; // Margem mínima de 31% (amarelo)
  
  // Define cor baseada na margem
  const getMarginColor = (m: number) => {
    if (m >= 70) return '#4caf50'; // Verde
    if (m >= 31) return '#ff9800'; // Amarelo
    return '#f44336'; // Vermelho
  };
  
  const marginColor = getMarginColor(margin);
  const marginWidth = Math.min(Math.max(margin, 0), 100);
  
  // Verifica se o preço está muito abaixo do sugerido
  const isPriceTooLow = price > 0 && price < minPrice;
  const showSuggestion = cost > 0 && (price === 0 || isPriceTooLow);
  
  return (
    <div style={{
      padding: '12px',
      backgroundColor: 'rgba(130, 87, 230, 0.05)',
      borderRadius: '6px',
      border: `1px solid ${marginColor}33`,
      marginTop: '8px'
    }}>
      {/* Barra de Margem */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '4px'
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Margem de Lucro
          </span>
          <span style={{
            fontSize: '0.85rem',
            fontWeight: 'bold',
            color: marginColor
          }}>
            {margin.toFixed(1)}%
          </span>
        </div>
        
        {/* Barra Visual */}
        <div style={{
          width: '100%',
          height: '16px',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: '8px',
          overflow: 'hidden',
          position: 'relative',
          border: '1px solid var(--border)'
        }}>
          {/* Marcadores de zona */}
          <div style={{
            position: 'absolute',
            left: '31%',
            top: 0,
            bottom: 0,
            width: '1px',
            backgroundColor: '#ff9800',
            opacity: 0.3
          }} />
          <div style={{
            position: 'absolute',
            left: '70%',
            top: 0,
            bottom: 0,
            width: '1px',
            backgroundColor: '#4caf50',
            opacity: 0.3
          }} />
          
          {/* Barra de progresso */}
          <div style={{
            width: `${marginWidth}%`,
            height: '100%',
            backgroundColor: marginColor,
            transition: 'all 0.3s ease',
            boxShadow: `0 0 8px ${marginColor}66`
          }} />
        </div>
        
        {/* Legendas */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '4px',
          fontSize: '0.65rem',
          color: 'var(--text-muted)'
        }}>
          <span>0%</span>
          <span>31%</span>
          <span>70%</span>
          <span>100%</span>
        </div>
      </div>
      
      {/* Info e Sugestões */}
      <div style={{
        display: 'flex',
        gap: '12px',
        flexWrap: 'wrap',
        fontSize: '0.75rem'
      }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Custo: </span>
          <span style={{ fontWeight: 'bold', color: '#ff9800' }}>
            {formatMoney(cost)}
          </span>
        </div>
        
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Preço: </span>
          <span style={{ fontWeight: 'bold', color: marginColor }}>
            {formatMoney(price)}
          </span>
        </div>
        
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Lucro: </span>
          <span style={{
            fontWeight: 'bold',
            color: (price - cost) >= 0 ? '#4caf50' : '#f44336'
          }}>
            {formatMoney(Math.max(0, price - cost))}
          </span>
        </div>
      </div>
      
      {/* Sugestão de Preço */}
      {showSuggestion && (
        <div style={{
          marginTop: '8px',
          padding: '8px',
          backgroundColor: isPriceTooLow ? 'rgba(244, 67, 54, 0.1)' : 'rgba(76, 175, 80, 0.1)',
          borderRadius: '4px',
          border: `1px solid ${isPriceTooLow ? '#f44336' : '#4caf50'}33`
        }}>
          <div style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            marginBottom: '4px'
          }}>
            {isPriceTooLow ? '⚠️ Margem abaixo do mínimo!' : '💡 Sugestão de preço:'}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Preço ideal (75%): </span>
              <span style={{
                fontSize: '0.85rem',
                fontWeight: 'bold',
                color: '#4caf50'
              }}>
                {formatMoney(Math.ceil(suggestedPrice))}
              </span>
            </div>
            {onSuggestedPriceClick && (
              <button
                onClick={() => onSuggestedPriceClick(Math.ceil(suggestedPrice))}
                style={{
                  padding: '4px 8px',
                  fontSize: '0.7rem',
                  backgroundColor: '#4caf50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
                title="Aplicar preço sugerido"
              >
                Aplicar
              </button>
            )}
          </div>
          <div style={{
            fontSize: '0.65rem',
            color: 'var(--text-muted)',
            marginTop: '4px'
          }}>
            Mínimo recomendado (31%): {formatMoney(Math.ceil(minPrice))}
          </div>
        </div>
      )}
      
      {/* Alerta de prejuízo */}
      {price > 0 && price < cost && (
        <div style={{
          marginTop: '8px',
          padding: '6px',
          backgroundColor: 'rgba(244, 67, 54, 0.15)',
          borderRadius: '4px',
          border: '1px solid #f44336',
          fontSize: '0.7rem',
          color: '#f44336',
          fontWeight: 'bold',
          textAlign: 'center'
        }}>
          🚨 ATENÇÃO: Preço abaixo do custo! Prejuízo de {formatMoney(cost - price)}
        </div>
      )}
    </div>
  );
};