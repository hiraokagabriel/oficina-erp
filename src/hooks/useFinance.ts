import { useState, useMemo } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Money } from '../utils/helpers';
import { formatDateOnly } from '../utils/dates';
import { LedgerEntry } from '../types';
import { computeFinanceKpis } from '../services/financeKpis';
import { buildFlowSeries, buildPayables } from '../services/financeFlow';
import { buildEntries } from '../services/entryBuild';

// Helpers internos de data (locais para o hook)
const getLocalMonth = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 7);
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
        count: number,
        /** DEBIT: true = "Vou pagar em [data]"; ausente/false = "Já paguei". */
        pending?: boolean
    ) => {
        const totalCents = Money.fromFloat(Math.abs(val));
        // Gera um ID de grupo se for mais de 1 lançamento
        const groupId = count > 1 ? crypto.randomUUID() : undefined;
        // Parcelado divide em centavos inteiros; "Já paguei" x "Vou pagar em": ver services/entryBuild.ts.
        const newEntries = buildEntries({
            desc, totalCents, type, dateStr, recurrence, count, pending, groupId, today: formatDateOnly(new Date()),
        });
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

    // Regra "só o que entrou": ver src/services/financeKpis.ts.
    // Dia local calculado a cada render: entra nas dependências para virar o dia sem recarregar.
    const todayDay = formatDateOnly(new Date());
    const kpis = useMemo(
        () => computeFinanceKpis({ ledger, workOrders, period: { mode: viewMode, month: selectedMonth }, today: new Date() }),
        [ledger, workOrders, selectedMonth, viewMode, todayDay]
    );

    const kpiData = useMemo(() => ({
        saldo: kpis.saldo, receitas: kpis.receitas, despesas: kpis.despesas, ticketMedio: kpis.ticketMedio,
        finalizedCount: kpis.finalizedCount,
    }), [kpis]);

    const expectedExpenses = kpis.expectedExpenses;

    // Contas a pagar: vencidas (qualquer mês) e as que vencem no período, por vencimento.
    const payables = useMemo(() => buildPayables(kpis.expectedExpenses), [kpis]);

    // Entrou e saiu (só o pago, pelo dia do pagamento), todos os dias do mês ou meses do ano; ignora o filtro de tipo.
    const chartFluxo = useMemo(
        () => buildFlowSeries(ledger, { mode: viewMode, month: selectedMonth }, new Date()),
        [ledger, viewMode, selectedMonth, todayDay]
    );

    const chartPie = useMemo(() => {
        const { parts, services } = kpis.pie;
        return parts + services === 0 ? [{name:'-', value:1}] : [{name:'Peças', value: Money.toFloat(parts)}, {name:'Serviços', value: Money.toFloat(services)}];
    }, [kpis]);

    return {
        selectedMonth, setSelectedMonth,
        viewMode, setViewMode,
        filterType, setFilterType,
        filteredLedger, kpiData, expectedExpenses, payables, chartFluxo, chartPie, pieCents: kpis.pie,
        addEntryWithRecurrence, updateEntry, deleteEntry, deleteGroup 
    };
};