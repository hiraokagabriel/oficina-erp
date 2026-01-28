/**
 * MigrationPanel.tsx
 * Painel visual para migrar dados do IndexedDB para o Firestore
 */

import React, { useState } from 'react';
import { getAllFromLocal, STORES } from '../services/storageService';
import { saveToFirestore, getAllFromFirestore, clearAllCollections } from '../services/firestoreService';
import { auth } from '../config/firebase';

interface CollectionStatus {
  name: string;
  indexedDB: number;
  firestore: number;
  status: 'pending' | 'migrating' | 'success' | 'error';
  error?: string;
}

export default function MigrationPanel() {
  const [collections, setCollections] = useState<CollectionStatus[]>([]);
  const [isMigrating, setIsMigrating] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  // Verificar dados existentes
  const checkData = async () => {
    const statuses: CollectionStatus[] = [];

    for (const collectionName of Object.values(STORES)) {
      try {
        const localData = await getAllFromLocal<any>(collectionName);
        let firestoreData: any[] = [];
        
        try {
          firestoreData = await getAllFromFirestore<any>(collectionName);
        } catch {
          firestoreData = [];
        }

        statuses.push({
          name: collectionName,
          indexedDB: localData.length,
          firestore: firestoreData.length,
          status: 'pending'
        });
      } catch (error: any) {
        statuses.push({
          name: collectionName,
          indexedDB: 0,
          firestore: 0,
          status: 'error',
          error: error.message
        });
      }
    }

    setCollections(statuses);
  };

  // Migrar todas as coleções
  const migrateAll = async () => {
    if (!auth.currentUser) {
      alert('❌ Você precisa estar logado para migrar dados!');
      return;
    }

    if (!confirm('🔥 Iniciar migração do IndexedDB para o Firestore?\n\nIsso pode levar alguns segundos.')) {
      return;
    }

    setIsMigrating(true);

    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];
      
      // Atualizar status para "migrando"
      setCollections(prev => 
        prev.map((col, idx) => 
          idx === i ? { ...col, status: 'migrating' as const } : col
        )
      );

      try {
        const localData = await getAllFromLocal<any>(collection.name);
        
        if (localData.length > 0) {
          await saveToFirestore(collection.name, localData);
        }

        // Atualizar status para "sucesso"
        setCollections(prev => 
          prev.map((col, idx) => 
            idx === i ? { ...col, status: 'success' as const, firestore: localData.length } : col
          )
        );
      } catch (error: any) {
        // Atualizar status para "erro"
        setCollections(prev => 
          prev.map((col, idx) => 
            idx === i ? { ...col, status: 'error' as const, error: error.message } : col
          )
        );
      }

      // Pequeno delay para feedback visual
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsMigrating(false);
    alert('✅ Migração concluída!');
  };

  // Limpar Firestore (uso avançado)
  const clearFirestore = async () => {
    if (!confirm('⚠️ ATENÇÃO: Isso irá DELETAR TODOS os dados do Firestore!\n\nTem certeza?')) {
      return;
    }

    if (!confirm('⚠️ Última confirmação:\n\nEsta ação é IRREVERSÍVEL!\n\nContinuar?')) {
      return;
    }

    try {
      await clearAllCollections();
      alert('✅ Firestore limpo com sucesso!');
      await checkData();
    } catch (error: any) {
      alert(`❌ Erro ao limpar Firestore: ${error.message}`);
    }
  };

  if (!showPanel) {
    return (
      <button 
        onClick={() => {
          setShowPanel(true);
          checkData();
        }}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '12px 20px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '50px',
          cursor: 'pointer',
          fontWeight: '600',
          fontSize: '14px',
          boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
          zIndex: 9998
        }}
      >
        🔥 Painel de Migração
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: 'var(--bg-panel)',
        borderRadius: '24px',
        padding: '32px',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        border: '1px solid var(--border)',
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5)'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--text-main)' }}>
              🔥 Migração IndexedDB → Firestore
            </h2>
            <button
              onClick={() => setShowPanel(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '24px',
                cursor: 'pointer',
                color: 'var(--text-muted)'
              }}
            >
              ✕
            </button>
          </div>
          <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>
            Usuário: <strong>{auth.currentUser?.email || 'Não autenticado'}</strong>
          </p>
        </div>

        {/* Tabela de Status */}
        <div style={{ marginBottom: '24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ padding: '12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Coleção</th>
                <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>IndexedDB</th>
                <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Firestore</th>
                <th style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((col, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-main)' }}>{col.name}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-main)' }}>{col.indexedDB}</td>
                  <td style={{ padding: '12px', textAlign: 'center', color: 'var(--text-main)' }}>{col.firestore}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    {col.status === 'pending' && '⏳'}
                    {col.status === 'migrating' && <span style={{ color: 'var(--info)' }}>🔄 Migrando...</span>}
                    {col.status === 'success' && <span style={{ color: 'var(--success)' }}>✅ OK</span>}
                    {col.status === 'error' && <span style={{ color: 'var(--danger)' }}>❌ Erro</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Botões de Ação */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={checkData}
            disabled={isMigrating}
            className="btn-secondary"
            style={{ flex: 1, minWidth: '150px' }}
          >
            🔍 Verificar Dados
          </button>

          <button
            onClick={migrateAll}
            disabled={isMigrating || collections.length === 0}
            className="btn"
            style={{ flex: 2, minWidth: '200px' }}
          >
            {isMigrating ? '⏳ Migrando...' : '🚀 Migrar Tudo'}
          </button>

          <button
            onClick={clearFirestore}
            disabled={isMigrating}
            style={{
              flex: 1,
              minWidth: '150px',
              padding: '12px 20px',
              borderRadius: 'var(--radius-btn)',
              border: '1px solid var(--danger)',
              background: 'rgba(247, 90, 104, 0.1)',
              color: 'var(--danger)',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            🗑️ Limpar Firestore
          </button>
        </div>

        {/* Aviso */}
        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: 'rgba(251, 169, 76, 0.1)',
          border: '1px solid var(--warning)',
          borderRadius: '12px',
          fontSize: '0.85rem',
          color: 'var(--text-muted)'
        }}>
          <strong style={{ color: 'var(--warning)' }}>⚠️ Importante:</strong><br />
          • Faça login antes de migrar<br />
          • A migração sobrescreve dados existentes no Firestore<br />
          • Execute apenas uma vez por usuário
        </div>
      </div>
    </div>
  );
}
