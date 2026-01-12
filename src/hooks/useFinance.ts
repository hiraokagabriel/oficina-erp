import { useState, useMemo } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { createEntry, Money } from '../utils/helpers';
import { LedgerEntry } from '../types';

// Helpers internos de data (locais para o hook)
const getLocalMonth = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 7);
};

const addMonthsToDate = (dateStr: string, monthsToAdd: number): string => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1 + monthsToAdd, day);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const useFinance = () => {
    const { ledger, setLedger, workOrders } = useDatabase();
    
    // --- ESTADOS DE FILTRO ---
    const [selectedMonth, setSelectedMonth] = useState(getLocalMonth);
    const [viewMode, setViewMode] = useState<'MONTH' | 'YEAR'>('MONTH');
    const [filterType, setFilterType] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');

    // --- CRUD ---

    // Adicionar (com suporte a recorrência e ID de grupo)
    const addEntryWithRecurrence = (
        desc: string, 
        val: number, 
        type: 'CREDIT' | 'DEBIT', 
        dateStr: string,
        recurrence: 'SINGLE' | 'INSTALLMENT' | 'RECURRING',
        count: number
    ) => {
        const absVal = Math.abs(val);
        const newEntries: LedgerEntry[] = [];
        
        // Gera um ID de grupo se for mais de 1 lançamento
        const groupId = count > 1 ? crypto.randomUUID() : undefined;
          
        if (recurrence === 'SINGLE') {
            newEntries.push(createEntry(desc, Money.fromFloat(absVal), type, dateStr));
        } else {
            for (let i = 0; i < count; i++) {
                const currentDate = addMonthsToDate(dateStr, i);
                let finalDesc = desc;
                let finalValue = absVal;

                if (recurrence === 'INSTALLMENT') {
                    finalDesc = `${desc} (${i + 1}/${count})`;
                    finalValue = parseFloat((absVal / count).toFixed(2));
                }
                // Passa o groupId para vincular as parcelas
                newEntries.push(createEntry(finalDesc, Money.fromFloat(finalValue), type, currentDate, groupId));
            }
        }
        setLedger(prev => [...newEntries.reverse(), ...prev]);
        return newEntries.length;
    };

    const updateEntry = (updated: LedgerEntry) => {
        setLedger(prev => prev.map(e => e.id === updated.id ? updated : e));
    };

    // Deleta APENAS UM
    const deleteEntry = (id: string) => {
        setLedger(prev => prev.filter(e => e.id !== id));
    };

    // Deleta O GRUPO INTEIRO (Série)
    const deleteGroup = (groupId: string) => {
        setLedger(prev => prev.filter(e => e.groupId !== groupId));
    };

    // --- DADOS COMPUTADOS (KPIs e Gráficos) ---
    
    const filteredLedger = useMemo(() => {
        let data = ledger;
        if (viewMode === 'YEAR') {
            const year = selectedMonth.slice(0, 4);
            data = data.filter(e => e.effectiveDate.startsWith(year));
        } else {
            data = data.filter(e => e.effectiveDate.startsWith(selectedMonth));
        }
        if (filterType !== 'ALL') data = data.filter(e => e.type === filterType);
        return data;
    }, [ledger, selectedMonth, viewMode, filterType]);

    const filteredWorkOrders = useMemo(() => {
        if (viewMode === 'YEAR') {
            const year = selectedMonth.slice(0, 4);
            return workOrders.filter(o => o.createdAt.startsWith(year));
        }
        return workOrders.filter(o => o.createdAt.startsWith(selectedMonth));
    }, [workOrders, selectedMonth, viewMode]);

    const kpiData = useMemo(() => {
        let kpiLedger = ledger;
        if (viewMode === 'YEAR') {
            const year = selectedMonth.slice(0, 4);
            kpiLedger = kpiLedger.filter(e => e.effectiveDate.startsWith(year));
        } else {
            kpiLedger = kpiLedger.filter(e => e.effectiveDate.startsWith(selectedMonth));
        }
        return {
            saldo: kpiLedger.reduce((a,e) => a + (e.type === 'CREDIT' ? e.amount : -e.amount), 0),
            receitas: kpiLedger.filter(e => e.type === 'CREDIT').reduce((a,e)=>a+e.amount, 0),
            despesas: kpiLedger.filter(e => e.type === 'DEBIT').reduce((a,e)=>a+e.amount, 0),
            ticketMedio: filteredWorkOrders.filter(o => o.status === 'FINALIZADO').reduce((a,o)=>a+o.total, 0) / (filteredWorkOrders.filter(o => o.status === 'FINALIZADO').length || 1)
        };
    }, [ledger, filteredWorkOrders, selectedMonth, viewMode]);

    const chartFluxo = useMemo(() => {
        const map: Record<string, number> = {};
        const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
   
        filteredLedger.forEach(e => { 
          if (filterType === 'DEBIT' && e.type === 'DEBIT') {
              let key = viewMode === 'YEAR' ? monthLabels[parseInt(e.effectiveDate.slice(5, 7)) - 1] : e.effectiveDate.slice(8, 10);
              map[key] = (map[key] || 0) + e.amount;
          } else if ((filterType === 'ALL' || filterType === 'CREDIT') && e.type === 'CREDIT') {
             let key = viewMode === 'YEAR' ? monthLabels[parseInt(e.effectiveDate.slice(5, 7)) - 1] : e.effectiveDate.slice(8, 10);
             map[key] = (map[key] || 0) + e.amount;
          }
        });
   
        let sortedEntries;
        if (viewMode === 'YEAR') sortedEntries = Object.entries(map).sort((a,b) => monthLabels.indexOf(a[0]) - monthLabels.indexOf(b[0]));
        else sortedEntries = Object.entries(map).sort((a,b) => a[0].localeCompare(b[0]));
   
        return sortedEntries.map(([k, v]) => ({ name: k, valor: Money.toFloat(v) }));
    }, [filteredLedger, viewMode, filterType]);

    const chartPie = useMemo(() => {
        let parts = 0, servs = 0;
        filteredWorkOrders.forEach(o => { parts += o.parts.reduce((a,i)=>a+i.price,0); servs += o.services.reduce((a,i)=>a+i.price,0); });
        return parts+servs === 0 ? [{name:'-', value:1}] : [{name:'Peças', value: Money.toFloat(parts)}, {name:'Serviços', value: Money.toFloat(servs)}];
    }, [filteredWorkOrders]);

    return {
        selectedMonth, setSelectedMonth,
        viewMode, setViewMode,
        filterType, setFilterType,
        filteredLedger, kpiData, chartFluxo, chartPie,
        addEntryWithRecurrence, updateEntry, deleteEntry, deleteGroup 
    };
};