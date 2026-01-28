/**
 * FirstSyncButton.tsx
 * Botão para fazer a primeira sincronização de dados locais para o Firestore
 */

import React, { useState, useEffect } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { saveToFirestore, COLLECTIONS } from '../services/firestoreService';
import { auth } from '../config/firebase';
import './FirstSyncButton.css';

export function FirstSyncButton() {
  const { ledger, workOrders, clients, catalogParts, catalogServices, useFirestore } = useDatabase();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [hasSynced, setHasSynced] = useState(() => {
    return localStorage.getItem('firstSyncCompleted') === 'true';
  });
  const [hasDeclined, setHasDeclined] = useState(() => {
    return localStorage.getItem('firstSyncDeclined') === 'true';
  });

  const totalItems = ledger.length + workOrders.length + clients.length + catalogParts.length + catalogServices.length;
  
  // 🔍 DEBUG: Log detalhado (apenas console)
  useEffect(() => {
    console.log('\n🔍 FIRST SYNC BUTTON - STATUS');
    console.log('='.repeat(60));
    console.log('hasSynced:', hasSynced);
    console.log('hasDeclined:', hasDeclined);
    console.log('useFirestore:', useFirestore);
    console.log('totalItems:', totalItems);
    console.log('auth.currentUser:', auth.currentUser?.email || 'NÃO AUTENTICADO');
    console.log('ledger:', ledger.length);
    console.log('workOrders:', workOrders.length);
    console.log('clients:', clients.length);
    console.log('catalogParts:', catalogParts.length);
    console.log('catalogServices:', catalogServices.length);
    
    if (!hasSynced && !hasDeclined && useFirestore && totalItems > 0) {
      console.log('✅ EXIBINDO BOTÃO DE SYNC');
    } else {
      if (hasSynced) console.log('❌ Oculto: Já sincronizou');
      if (hasDeclined) console.log('❌ Oculto: Usuário recusou');
      if (!useFirestore) console.log('❌ Oculto: Não autenticado');
      if (totalItems === 0) console.log('❌ Oculto: Sem dados locais');
    }
    console.log('='.repeat(60) + '\n');
  }, [hasSynced, hasDeclined, useFirestore, totalItems]);

  // 🆕 NOVA FUNÇÃO: Recusar sincronização
  const handleDecline = () => {
    localStorage.setItem('firstSyncDeclined', 'true');
    setHasDeclined(true);
    console.log('❌ Usuário recusou a sincronização inicial');
  };

  const shouldShow = !hasSynced && !hasDeclined && useFirestore && totalItems > 0;

  const handleSync = async () => {
    if (!auth.currentUser) {
      setSyncStatus('error');
      setSyncMessage('❌ Faça login antes de sincronizar!');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('syncing');
    setSyncMessage('🔄 Enviando dados para a nuvem...');

    try {
      console.log('\n🚀 PRIMEIRA SINCRONIZAÇÃO INICIADA');
      console.log('='.repeat(60));

      const collections = [
        { name: 'Financeiro', collection: COLLECTIONS.financeiro, data: ledger },
        { name: 'Processos (OSs)', collection: COLLECTIONS.processos, data: workOrders },
        { name: 'Clientes', collection: COLLECTIONS.clientes, data: clients },
        { name: 'Catálogo', collection: COLLECTIONS.oficina, data: [...catalogParts, ...catalogServices] }
      ];

      let totalSynced = 0;

      for (const { name, collection, data } of collections) {
        if (data.length > 0) {
          console.log(`📂 Sincronizando ${name}: ${data.length} itens...`);
          setSyncMessage(`🔄 Enviando ${name}...`);
          
          await saveToFirestore(collection, data);
          totalSynced += data.length;
          
          console.log(`  ✅ ${name} sincronizado!`);
        }
      }

      console.log('='.repeat(60));
      console.log(`✅ SINCRONIZAÇÃO CONCLUÍDA: ${totalSynced} itens enviados\n`);

      localStorage.setItem('firstSyncCompleted', 'true');
      setHasSynced(true);
      setSyncStatus('success');
      setSyncMessage(`✅ ${totalSynced} itens sincronizados com sucesso!`);

      setTimeout(() => {
        setSyncStatus('idle');
      }, 5000);

    } catch (error: any) {
      console.error('❌ Erro na sincronização:', error);
      setSyncStatus('error');
      setSyncMessage(`❌ Erro: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="first-sync-container">
      <div className="first-sync-card">
        {/* 🆕 BOTÃO DE FECHAR */}
        <button 
          className="first-sync-close"
          onClick={handleDecline}
          aria-label="Fechar"
          title="Não sincronizar agora"
        >
          ×
        </button>

        <div className="first-sync-icon">🔥</div>
        <h3>Sincronizar com a Nuvem</h3>
        <p>
          Você tem <strong>{totalItems} itens</strong> no banco local.
          <br />
          Envie-os para o Firestore para acessá-los de qualquer dispositivo!
        </p>

        <div className="first-sync-details">
          <div className="sync-item">
            <span className="sync-label">💵 Financeiro:</span>
            <span className="sync-count">{ledger.length}</span>
          </div>
          <div className="sync-item">
            <span className="sync-label">🔧 OSs:</span>
            <span className="sync-count">{workOrders.length}</span>
          </div>
          <div className="sync-item">
            <span className="sync-label">👥 Clientes:</span>
            <span className="sync-count">{clients.length}</span>
          </div>
          <div className="sync-item">
            <span className="sync-label">📦 Catálogo:</span>
            <span className="sync-count">{catalogParts.length + catalogServices.length}</span>
          </div>
        </div>

        {syncStatus !== 'idle' && (
          <div className={`sync-status sync-status-${syncStatus}`}>
            {syncMessage}
          </div>
        )}

        <button
          className="first-sync-button"
          onClick={handleSync}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <>
              <span className="spinner"></span>
              Sincronizando...
            </>
          ) : (
            <>
              🚀 Enviar para Nuvem
            </>
          )}
        </button>

        <p className="first-sync-note">
          <small>⚠️ Isso só precisa ser feito uma vez! Use Configurações depois.</small>
        </p>
      </div>
    </div>
  );
}
