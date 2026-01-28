import React from 'react';

interface PriceMarginBarProps {
  cost: number; // Custo em centavos
  price: number; // Preço em centavos
  formatMoney: (val: number) => string;
  onSuggestPrice?: (suggestedPrice: number) => void;
  targetMargin?: number; // Margem alvo em porcentagem (padrão: 75%)
}

export const PriceMarginBar: React.FC<PriceMarginBarProps> = ({
  cost,
  price,
  formatMoney,
  onSuggestPrice,
  targetMargin = 75
}) => {
  // Calcula margem atual
  const calculateMargin = (c: number, p: number): number => {
    if (p === 0) return 0;
    return ((p - c) / p) * 100;
  };

  // Calcula preço sugerido baseado na margem alvo
  const calculateSuggestedPrice = (c: number, targetMarginPct: number): number => {
    if (targetMarginPct >= 100) return c * 2; // Fallback seguro
    return Math.ceil(c / (1 - targetMarginPct / 100));
  };

  const currentMargin = calculateMargin(cost, price);
  const suggestedPrice = calculateSuggestedPrice(cost, targetMargin);
  const profit = price - cost;

  // Define cor baseada na margem
  const getMarginColor = (margin: number): string => {
    if (margin > 70) return 'var(--success)'; // Verde
    if (margin >= 31) return 'var(--warning)'; // Amarelo
    return 'var(--danger)'; // Vermelho
  };

  const getMarginStatus = (margin: number): string => {
    if (margin > 70) return 'Excelente';
    if (margin >= 50) return 'Boa';
    if (margin >= 31) return 'Aceitável';
    return 'Baixa';
  };

  const marginColor = getMarginColor(currentMargin);
  const marginStatus = getMarginStatus(currentMargin);
  
  // Se não houver custo definido, não mostra o componente
  if (cost === 0) return null;

  const needsSuggestion = price < suggestedPrice;

  return (
    <div style={{
      padding: '8px 12px',
      backgroundColor: 'rgba(130, 87, 230, 0.05)',
      borderRadius: 6,
      border: `1px solid ${marginColor}`,
      fontSize: '0.85rem'
    }}>
      {/* Barra visual de margem */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: '0.75rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            Margem: <strong style={{ color: marginColor }}>{currentMargin.toFixed(1)}%</strong> ({marginStatus})
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            Lucro: <strong style={{ color: marginColor }}>{formatMoney(profit)}</strong>
          </span>
        </div>
        
        {/* Barra de progresso */}
        <div style={{
          width: '100%',
          height: 16,
          backgroundColor: 'rgba(0,0,0,0.1)',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative'
        }}>
          {/* Marcadores de zona */}
          <div style={{
            position: 'absolute',
            left: '31%',
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: 'rgba(255,255,255,0.3)'
          }} />
          <div style={{
            position: 'absolute',
            left: '70%',
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: 'rgba(255,255,255,0.3)'
          }} />
          
          {/* Preenchimento da barra */}
          <div style={{
            height: '100%',
            width: `${Math.min(currentMargin, 100)}%`,
            backgroundColor: marginColor,
            transition: 'all 0.3s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 6
          }}>
            {currentMargin > 15 && (
              <span style={{ 
                color: 'white', 
                fontSize: '0.7rem', 
                fontWeight: 'bold',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
              }}>
                {currentMargin.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sugestão de preço se necessário */}
      {needsSuggestion && onSuggestPrice && (
        <div style={{
          marginTop: 8,
          padding: '6px 8px',
          backgroundColor: 'rgba(130, 87, 230, 0.1)',
          borderRadius: 4,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 2 }}>
              💡 Preço sugerido ({targetMargin}% margem):
            </div>
            <div style={{ fontWeight: 'bold', color: 'var(--primary)' }}>
              {formatMoney(suggestedPrice)}
            </div>
          </div>
          <button
            className="btn-icon"
            onClick={() => onSuggestPrice(suggestedPrice)}
            style={{
              padding: '4px 12px',
              fontSize: '0.75rem',
              backgroundColor: 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
            title="Aplicar preço sugerido"
          >
            Aplicar
          </button>
        </div>
      )}

      {/* Informações adicionais */}
      <div style={{
        marginTop: 6,
        fontSize: '0.7rem',
        color: 'var(--text-muted)',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>Custo: {formatMoney(cost)}</span>
        <span>Preço: {formatMoney(price)}</span>
      </div>
    </div>
  );
};
