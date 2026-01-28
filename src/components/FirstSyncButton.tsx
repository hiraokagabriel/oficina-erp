/**
 * FirstSyncButton.tsx
 * Botão para fazer a primeira sincronização de dados locais para o Firestore
 */

import React, { useState } from 'react';
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

  // Não mostra o botão se:
  // 1. Já sincronizou antes
  // 2. Não está usando Firestore (não autenticado)
  // 3. Não tem dados para sincronizar
  const totalItems = ledger.length + workOrders.length + clients.length + catalogParts.length + catalogServices.length;
  
  if (hasSynced || !useFirestore || totalItems === 0) {
    return null;
  }

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

      // Envia cada coleção
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

      // Marca como concluído
      localStorage.setItem('firstSyncCompleted', 'true');
      setHasSynced(true);
      setSyncStatus('success');
      setSyncMessage(`✅ ${totalSynced} itens sincronizados com sucesso!`);

      // Esconde mensagem após 5 segundos
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

  return (
    <div className="first-sync-container">
      <div className="first-sync-card">
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
          <small>⚠️ Isso só precisa ser feito uma vez!</small>
        </p>
      </div>
    </div>
  );
}
