import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Role } from '../services/permissions';
import { AuthApiError, createApi } from './api';
import type { AuthApi } from './api';
import { MSG, classifyForgotError, classifySignInError, validateNewPassword } from './authText';
import {
  clearFails, forgetPerson, localDeviceId, readDevice, readFails, readRoster, readVerifier,
  clearDevice, clearOtherVerifiers, clearRoster, writeDevice, writeFails, writeLastUser, writeRoster, writeVerifier,
} from './deviceStore';
import type { DeviceKind, RosterPerson } from './deviceStore';
import type { IdleMinutes } from './idle';
import { clearCachedMembership, fetchMembership, readCachedMembership, writeCachedMembership } from './membership';
import type { ImportState, MembershipInfo } from './membership';
import {
  PIN_OFFLINE_BLOCKED_MESSAGE, RECENT_PASSWORD_MESSAGE, checkVerifier, interpretPinError, makeVerifier, registerFail, remainingTries,
  validateNewPin, wrongPinMessage, PIN_FORMAT_MESSAGES,
} from './pinLogic';
import type { PinFailure } from './pinLogic';
import { purgePersonCache } from './recoveryStore';
import { classifyAccess, isBannedError } from './screens';
import type { AccessCase, AuthUrlInfo, MembershipState } from './screens';
import { effectiveOnline, probeReach } from './reach';
import { dirtyLabels } from '../utils/dirtyRegistry';
import { SUPABASE_ANON_KEY, SUPABASE_URL, getSupabase, siteUrl } from './supabaseClient';

// Acesso do modo nuvem (docs/NUVEM-SPEC.md seção 5, docs/NUVEM-UX.md seções 1 a 4 e 6.3).
// Uso nas telas: `const { userId, role, displayName, signOut, switchPerson, ... } = useAuth()`.
// Só existe com `VITE_CLOUD=1`; o `main.tsx` monta o `AuthProvider` por import dinâmico.

export interface AuthDevice { id: string; kind: DeviceKind; name: string; secret?: string; idleMinutes: IdleMinutes }

export type SignInResult = { ok: true } | { ok: false; message: string; field?: 'email' | 'password' };
export type SimpleResult = { ok: true } | { ok: false; message: string };
export type UnlockResult = { ok: true } | { ok: false; failure: PinFailure };
export type DeviceBlock = null | 'suspended' | 'revoked';

export interface AuthContextValue {
  /** Lendo a sessão guardada neste aparelho. */
  loading: boolean;
  session: Session | null;
  userId: string | null;
  email: string | null;
  displayName: string;
  workshopId: string | null;
  workshopName: string;
  role: Role | null;
  membershipState: MembershipState;
  /** Estado da importação do banco antigo; só `concluido` abre o app. */
  importState: ImportState;
  /** Última cópia diária (ISO) ou null. */
  lastExportAt: string | null;
  /** Lê de novo `workshops` e a membership (depois de importar, de uma cópia, ou quando o Dono termina a importação). */
  reloadMembership(): Promise<void>;
  /** Falta o código de 2 etapas do Dono. */
  mfaPending: boolean;
  /** PC compartilhado autorizado (`null` = aparelho pessoal ou navegador: fica entrado, sem PIN nem bloqueio). */
  device: AuthDevice | null;
  /** Id deste aparelho para o motor de envio: o do servidor quando autorizado, senão um id local estável. */
  deviceId: string;
  deviceName: string;
  sharedDevice: boolean;
  deviceBlock: DeviceBlock;
  online: boolean;
  supabase: SupabaseClient;
  /** Chamadas às funções `users`, `pin` e `device` já com o token da sessão atual. */
  api: AuthApi;
  url: AuthUrlInfo;

  /** `holdGate`: em PC compartilhado, depois de entrar não abre o app; mostra "Criar PIN novo" primeiro. */
  signIn(email: string, password: string, opts?: { holdGate?: boolean }): Promise<SignInResult>;
  verifyMfa(code: string): Promise<SimpleResult>;
  sendResetLink(email: string): Promise<SimpleResult>;
  /** Define a senha nova na sessão do link (convite ou recuperação). */
  setNewPassword(password: string, repeat: string): Promise<SimpleResult>;
  changePassword(current: string, next: string, repeat: string): Promise<SimpleResult>;
  /** Cria o PIN (convite). */
  createPin(pin: string, repeat: string): Promise<SimpleResult>;
  changePin(current: string, next: string, repeat: string): Promise<SimpleResult>;
  /** "Sair deste aparelho". */
  signOut(): Promise<void>;

  // PC compartilhado
  gateClosed: boolean;
  gateReason: 'start' | 'idle' | 'switch';
  /** Pessoa que estava usando quando o aparelho bloqueou por inatividade (cartão já aberto no PIN). */
  gatePerson: string | null;
  switching: boolean;
  roster: RosterPerson[];
  rosterLoading: boolean;
  refreshRoster(): Promise<void>;
  lock(): void;
  /** "Trocar de pessoa": envia o que a pessoa atual fez e abre "Quem está usando". */
  switchPerson(): Promise<void>;
  /** `confirmDiscard`: chamado só quando OUTRA pessoa entra e há janela suja da anterior (depois do PIN certo, antes de entrar). */
  unlock(userId: string, pin: string, confirmDiscard?: (labels: string[]) => Promise<boolean>): Promise<UnlockResult>;
  /** Volta da tela de cartões para o app da mesma pessoa (só com sessão). */
  closeGate(): void;
  /** Autoriza ESTE computador como compartilhado (Config > Aparelhos). */
  registerThisDevice(name: string): Promise<SimpleResult>;
  setIdleMinutes(minutes: IdleMinutes): Promise<SimpleResult>;
  /** "Deixar de usar este computador como compartilhado": revoga o aparelho no servidor e apaga o id e o segredo locais. */
  forgetThisDevice(): Promise<SimpleResult>;
  /** O `CloudBridge` registra como esperar o envio da fila antes de trocar de pessoa. */
  registerFlush(fn: (() => Promise<void>) | null): void;

  // Tela "Sem acesso" (6.3)
  accessCase: AccessCase | null;
  /** O motor disse `sem_acesso`: descobre se foi desativação, entrar de novo ou troca de papel. */
  probeAccess(): Promise<void>;
  /** Aplica o papel novo (caso C): remonta o app. */
  acceptRoleChange(): void;
  /** Caso A: guarda o que faltava enviar como cópia de recuperação, apaga o cache da pessoa e sai. */
  leaveDeactivated(): Promise<void>;
  /** Logo depois de entrar com a senha por PIN esquecido: a tela "Criar PIN novo" vem antes do app. */
  pinSetup: boolean;
  /** Fecha "Criar PIN novo" (criou ou escolheu "Agora não") e abre o app. */
  finishPinSetup(): void;
  /** Sobe a cada novo login da mesma pessoa (prop `resumeSignal` do provider). */
  resumeSignal: number;
  lastEmail: string;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fora do AuthProvider (modo nuvem desligado?).');
  return v;
}

const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
const K_LAST_EMAIL = 'oficina.lastEmail';
const readLastEmail = (): string => { try { return localStorage.getItem(K_LAST_EMAIL) ?? ''; } catch { return ''; } };
const FLUSH_TIMEOUT_MS = 10_000;

/** Última resposta de `probeReach` (o servidor foi alcançado?). Vale junto com `navigator.onLine`. */
let serverReachable = true;
const isOnline = (): boolean => effectiveOnline(typeof navigator === 'undefined' ? true : navigator.onLine, serverReachable);

interface Props { url: AuthUrlInfo; children: React.ReactNode }

export const AuthProvider: React.FC<Props> = ({ url, children }) => {
  const supabase = useMemo(() => getSupabase(), []);

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [membership, setMembership] = useState<MembershipInfo | null>(null);
  const [membershipState, setMembershipState] = useState<MembershipState>('unknown');
  const [pendingRole, setPendingRole] = useState<MembershipInfo | null>(null);
  const [mfaPending, setMfaPending] = useState(false);
  const [device, setDevice] = useState<AuthDevice | null>(() => {
    const d = readDevice();
    return d ? { id: d.id, kind: d.kind, name: d.name, secret: d.secret, idleMinutes: d.idleMinutes } : null;
  });
  const [deviceBlock, setDeviceBlock] = useState<DeviceBlock>(null);
  const [online, setOnline] = useState(isOnline);
  const [gateClosed, setGateClosed] = useState(() => readDevice() !== null);
  const [gateReason, setGateReason] = useState<'start' | 'idle' | 'switch'>('start');
  const [gatePerson, setGatePerson] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [roster, setRoster] = useState<RosterPerson[]>(() => readRoster()?.people ?? []);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [accessCase, setAccessCase] = useState<AccessCase | null>(null);
  const [resumeSignal, setResumeSignal] = useState(0);
  const [lastEmail, setLastEmail] = useState(readLastEmail);
  const [pinSetup, setPinSetup] = useState(false);

  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const intentionalOut = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  const membershipRef = useRef<MembershipInfo | null>(null);
  membershipRef.current = membership;
  const deviceRef = useRef(device);
  deviceRef.current = device;
  const probing = useRef(false);
  /** De quem é a `membership` guardada: nunca mostrar o papel de uma pessoa para outra. */
  const membershipOwner = useRef<string | null>(null);

  const networkErrorRef = useRef<(() => void) | null>(null);
  const api = useMemo(() => createApi({
    baseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, onNetworkError: () => networkErrorRef.current?.(),
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  }), [supabase]);

  // ---------- internet ----------
  // `navigator.onLine` não basta (Wi-Fi sem saída, servidor fora do ar): confere o servidor de verdade, com tempo curto.
  useEffect(() => {
    let alive = true;
    let running = false;
    const check = async (): Promise<void> => {
      if (running) return;
      running = true;
      try {
        const ok = typeof navigator !== 'undefined' && !navigator.onLine ? false : await probeReach(SUPABASE_URL, SUPABASE_ANON_KEY);
        if (!alive) return;
        serverReachable = ok;
        setOnline(isOnline());
      } finally { running = false; }
    };
    networkErrorRef.current = () => { void check(); };
    const on = () => { setOnline(isOnline()); void check(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const id = window.setInterval(() => { void check(); }, 20_000);
    void check();
    return () => {
      alive = false;
      networkErrorRef.current = null;
      window.clearInterval(id);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // ---------- sessão ----------
  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!alive) return;
      // Sem chamar o Supabase aqui dentro (risco de travar): só guarda o estado; os efeitos fazem o resto.
      if (event === 'SIGNED_OUT') {
        if (intentionalOut.current || !sessionRef.current) { setSession(null); return; }
        // Saída que não foi pedida (renovação falhou): mantém o app montado e pede a senha de novo (6.3 B).
        setAccessCase('reauth');
        return;
      }
      if (s) {
        setSession(s);
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setAccessCase(c => (c === 'reauth' ? null : c));
      }
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [supabase]);

  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? null;

  useEffect(() => {
    if (email) { try { localStorage.setItem(K_LAST_EMAIL, email); } catch { /* sem armazenamento */ } setLastEmail(email); }
  }, [email]);

  // ---------- membership (papel e oficina) ----------
  const loadMembership = useCallback(async (uid: string, mode: 'first' | 'refresh'): Promise<void> => {
    const r = await fetchMembership(supabase, uid);
    if (sessionRef.current?.user.id !== uid) return;
    if (r.kind === 'ok') {
      writeCachedMembership(uid, r.membership);
      const cur = membershipOwner.current === uid ? membershipRef.current : null;
      if (mode === 'refresh' && cur && (cur.role !== r.membership.role || cur.workshopId !== r.membership.workshopId)) {
        setPendingRole(r.membership); // 6.3 C: avisa antes de remontar o app
      } else {
        membershipOwner.current = uid;
        setMembership(r.membership);
        setMembershipState('active');
      }
    } else if (r.kind === 'none') {
      clearCachedMembership(uid);
      membershipOwner.current = uid;
      setMembership(null);
      setMembershipState('none');
    } else if (mode === 'first') {
      const cached = readCachedMembership(uid);
      if (cached) { membershipOwner.current = uid; setMembership(cached); setMembershipState('active'); } // sem internet: abre com o que já se sabia
    }
  }, [supabase]);

  useEffect(() => {
    if (!userId) {
      membershipOwner.current = null; membershipRef.current = null;
      setMembership(null); setMembershipState('unknown'); setMfaPending(false); setPendingRole(null);
      return;
    }
    let mode: 'first' | 'refresh' = 'refresh';
    if (membershipOwner.current !== userId) {
      // Outra pessoa entrou: nada da anterior pode valer.
      membershipOwner.current = null; membershipRef.current = null;
      setMembership(null); setMembershipState('unknown'); setPendingRole(null); setMfaPending(false);
      mode = 'first';
    }
    void loadMembership(userId, mode);
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data) setMfaPending(data.nextLevel === 'aal2' && data.currentLevel !== 'aal2');
    }).catch(() => { /* sem internet: não bloqueia a abertura */ });
  }, [userId, supabase, loadMembership]);

  // Volta o foco ou a internet: confere se o papel mudou.
  useEffect(() => {
    if (!userId) return;
    const check = () => { void loadMembership(userId, 'refresh'); };
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    return () => { window.removeEventListener('focus', check); window.removeEventListener('online', check); };
  }, [userId, loadMembership]);

  // Aviso do servidor quando o Dono desativa ou muda o papel (broadcast `membership` em `ws:<id>`).
  const workshopId = membership?.workshopId ?? null;
  useEffect(() => {
    if (!workshopId || !userId) return;
    const ch = supabase.channel(`ws:${workshopId}`);
    ch.on('broadcast', { event: 'membership' }, msg => {
      const p = msg.payload as { userId?: string } | undefined;
      if (p?.userId === userId) void loadMembership(userId, 'refresh');
    }).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [workshopId, userId, supabase, loadMembership]);

  useEffect(() => { if (userId && membershipState === 'active' && deviceRef.current) writeLastUser(userId); }, [userId, membershipState]);

  // ---------- entrar e sair ----------
  const flushBeforeLeaving = useCallback(async (): Promise<void> => {
    const f = flushRef.current;
    if (!f) return;
    await Promise.race([f().catch(() => undefined), sleep(FLUSH_TIMEOUT_MS)]);
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(async (mail, password, opts) => {
    const clean = mail.trim();
    if (sessionRef.current) await flushBeforeLeaving();
    const { data, error } = await supabase.auth.signInWithPassword({ email: clean, password });
    if (error) return { ok: false, message: classifySignInError(error, isOnline()).message };
    setSession(data.session);
    setAccessCase(null);
    if (data.session) clearFails(data.session.user.id); // entrou com a senha: a contagem local de erros de PIN recomeça
    if (opts?.holdGate && deviceRef.current) {
      setPinSetup(true); // PIN esquecido ou bloqueado: antes de abrir, oferece criar um PIN novo (pin.set, sem PIN atual)
    } else {
      setGateClosed(false);
    }
    setResumeSignal(n => n + 1);
    return { ok: true };
  }, [supabase, flushBeforeLeaving]);

  const verifyMfa = useCallback<AuthContextValue['verifyMfa']>(async code => {
    const f = await supabase.auth.mfa.listFactors();
    const totp = f.data?.totp?.[0];
    if (f.error || !totp) return { ok: false, message: MSG.offlineGeneric };
    const r = await supabase.auth.mfa.challengeAndVerify({ factorId: totp.id, code: code.trim() });
    if (r.error) return { ok: false, message: isOnline() ? MSG.mfaWrong : MSG.offlineGeneric };
    setMfaPending(false);
    return { ok: true };
  }, [supabase]);

  const sendResetLink = useCallback<AuthContextValue['sendResetLink']>(async mail => {
    const { error } = await supabase.auth.resetPasswordForEmail(mail.trim(), { redirectTo: `${siteUrl()}/nova-senha` });
    // Mesma resposta para e-mail cadastrado ou não: só erro de rede ou limite aparece.
    if (error) return { ok: false, message: classifyForgotError(error, isOnline()) };
    return { ok: true };
  }, [supabase]);

  const setNewPassword = useCallback<AuthContextValue['setNewPassword']>(async (password, repeat) => {
    const bad = validateNewPassword(password, repeat);
    if (bad) return { ok: false, message: bad };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, message: isOnline() ? 'Não foi possível salvar a senha agora. Tente de novo em instantes.' : MSG.offlineGeneric };
    return { ok: true };
  }, [supabase]);

  const changePassword = useCallback<AuthContextValue['changePassword']>(async (current, next, repeat) => {
    const bad = validateNewPassword(next, repeat);
    if (bad) return { ok: false, message: bad };
    const mail = sessionRef.current?.user.email;
    if (!mail) return { ok: false, message: MSG.unknownSignIn };
    const chk = await supabase.auth.signInWithPassword({ email: mail, password: current });
    if (chk.error) return { ok: false, message: classifySignInError(chk.error, isOnline()).kind === 'credentials' ? 'A senha atual não confere.' : classifySignInError(chk.error, isOnline()).message };
    const { error } = await supabase.auth.updateUser({ password: next });
    return error ? { ok: false, message: isOnline() ? MSG.unknownSignIn : MSG.offlineGeneric } : { ok: true };
  }, [supabase]);

  const createPin = useCallback<AuthContextValue['createPin']>(async (pin, repeat) => {
    const f = validateNewPin(pin);
    if (f) return { ok: false, message: PIN_FORMAT_MESSAGES[f] };
    if (pin !== repeat) return { ok: false, message: MSG.pinMismatch };
    try {
      await api.pin.set(pin);
      const uid = sessionRef.current?.user.id;
      if (uid && deviceRef.current) { clearFails(uid); saveVerifierLater(uid, pin); }
      return { ok: true };
    } catch (e) {
      if (e instanceof AuthApiError) return { ok: false, message: e.error === 'sem_internet' ? MSG.offlineFinish : e.error === 'exige_senha_recente' ? RECENT_PASSWORD_MESSAGE : e.message };
      return { ok: false, message: MSG.offlineFinish };
    }
  }, [api]);

  const changePin = useCallback<AuthContextValue['changePin']>(async (current, next, repeat) => {
    const f = validateNewPin(next);
    if (f) return { ok: false, message: PIN_FORMAT_MESSAGES[f] };
    if (next !== repeat) return { ok: false, message: MSG.pinMismatch };
    try {
      await api.pin.verify(current);
      await api.pin.set(next);
      const uid = sessionRef.current?.user.id;
      if (uid && deviceRef.current) { clearFails(uid); saveVerifierLater(uid, next); }
      return { ok: true };
    } catch (e) {
      if (e instanceof AuthApiError) {
        if (e.error === 'pin_incorreto') return { ok: false, message: 'O PIN atual não confere.' };
        if (e.error === 'exige_senha_recente') return { ok: false, message: RECENT_PASSWORD_MESSAGE };
        return { ok: false, message: e.error === 'sem_internet' ? 'Precisa de internet' : e.message };
      }
      return { ok: false, message: MSG.offlineGeneric };
    }
  }, [api]);

  const signOut = useCallback(async (): Promise<void> => {
    await flushBeforeLeaving();
    const leavingId = sessionRef.current?.user.id ?? null;
    intentionalOut.current = true;
    try { await supabase.auth.signOut({ scope: 'local' }); } finally { intentionalOut.current = false; }
    setSession(null);
    setAccessCase(null);
    // "Sair deste aparelho": esquece o e-mail e o papel guardados. O que ainda não foi enviado fica na fila local (não se apaga).
    try { localStorage.removeItem(K_LAST_EMAIL); } catch { /* sem armazenamento */ }
    setLastEmail('');
    if (leavingId) clearCachedMembership(leavingId);
    if (deviceRef.current) { setGateClosed(true); setGateReason('switch'); setGatePerson(null); }
  }, [supabase, flushBeforeLeaving]);

  // ---------- PC compartilhado ----------
  const refreshRoster = useCallback(async (): Promise<void> => {
    const d = deviceRef.current;
    if (!d?.secret) return;
    setRosterLoading(true);
    try {
      const r = await api.pin.roster(d.id, d.secret);
      writeRoster(r.people, new Date().toISOString());
      setRoster(r.people);
      // Com internet vale o que o servidor diz: quem não está bloqueado lá não fica bloqueado aqui.
      for (const p of r.people) if (!p.locked) clearFails(p.userId);
    } catch (e) {
      if (e instanceof AuthApiError && e.error === 'aparelho_invalido') {
        clearDevice(); setDevice(null); setDeviceBlock('revoked'); setGateClosed(false);
      }
      // outros erros (sem internet): fica com a cópia guardada
    } finally { setRosterLoading(false); }
  }, [api]);

  const lock = useCallback(() => {
    if (!deviceRef.current) return;
    setGateReason('idle');
    setGatePerson(sessionRef.current?.user.id ?? null);
    setGateClosed(true);
  }, []);

  const switchPerson = useCallback(async (): Promise<void> => {
    if (!deviceRef.current) return;
    setSwitching(true);
    try { if (isOnline()) await flushBeforeLeaving(); } finally { setSwitching(false); }
    setGateReason('switch');
    setGatePerson(null);
    setGateClosed(true);
  }, [flushBeforeLeaving]);

  const closeGate = useCallback(() => setGateClosed(false), []);
  const finishPinSetup = useCallback(() => { setPinSetup(false); setGateClosed(false); setGatePerson(null); }, []);

  const saveVerifierLater = (uid: string, pin: string): void => {
    // Só o verificador da pessoa entrada fica no aparelho: o de todas as outras é apagado.
    void makeVerifier(pin).then(v => { writeVerifier(uid, v); clearOtherVerifiers(uid); }).catch(() => undefined);
  };

  const unlock = useCallback<AuthContextValue['unlock']>(async (target, pin, confirmDiscard) => {
    const dev = deviceRef.current;
    if (!dev?.secret) return { ok: false, failure: interpretPinError('aparelho_invalido', undefined, 0) };
    const isCurrent = sessionRef.current?.user.id === target;
    const fails = readFails(target);
    const failWith = (code: string, restantes?: number): UnlockResult => {
      // Com internet quem conta é o servidor (`restantes` e `roster.locked`): nada de contagem local persistida aqui.
      const next = code === 'pin_incorreto' ? registerFail(fails) : fails;
      const f = interpretPinError(code, restantes, remainingTries(next));
      if (f.kind === 'blocked') {
        setRoster(r => r.map(p => (p.userId === target ? { ...p, locked: true } : p)));
      }
      if (f.kind === 'device_suspended') setDeviceBlock('suspended');
      if (f.kind === 'device_revoked') { clearDevice(); setDevice(null); setDeviceBlock('revoked'); }
      return { ok: false, failure: f };
    };
    const opened = (): UnlockResult => {
      clearFails(target);
      clearOtherVerifiers(target);
      writeLastUser(target);
      setGateClosed(false);
      setGatePerson(null);
      return { ok: true };
    };

    if (!isOnline()) {
      // Sem internet só a pessoa atual, contra o verificador local (decisão 1 do dono).
      if (!isCurrent) return { ok: false, failure: { kind: 'network', message: 'Sem internet. Só quem estava usando pode entrar agora.' } };
      if (fails.blocked) return { ok: false, failure: { kind: 'blocked', message: PIN_OFFLINE_BLOCKED_MESSAGE } };
      const ver = readVerifier(target);
      if (!ver) return { ok: false, failure: { kind: 'network', message: 'Precisa de internet para o primeiro desbloqueio neste computador.' } };
      if (await checkVerifier(pin, ver)) return opened();
      const next = registerFail(fails);
      writeFails(target, next);
      return { ok: false, failure: next.blocked
        ? { kind: 'blocked', message: PIN_OFFLINE_BLOCKED_MESSAGE, restantes: 0 }
        : { kind: 'wrong', message: wrongPinMessage(remainingTries(next)), restantes: remainingTries(next) } };
    }

    try {
      let done = false;
      if (isCurrent) {
        try { await api.pin.verify(pin); done = true; } catch (e) {
          const authLost = e instanceof AuthApiError && (e.error === 'nao_autenticado' || e.error === 'sem_acesso');
          if (!authLost) throw e;
        }
      }
      if (!done) {
        if (sessionRef.current && !isCurrent) await flushBeforeLeaving();
        const r = await api.pin.unlock(dev.id, dev.secret, target, pin);
        if (!isCurrent && confirmDiscard) {
          const left = dirtyLabels();
          if (left.length > 0 && !(await confirmDiscard(left))) return { ok: false, failure: { kind: 'other', message: '' } };
        }
        if (!isCurrent) {
          intentionalOut.current = true;
          try { await supabase.auth.signOut({ scope: 'local' }); } finally { intentionalOut.current = false; }
        }
        const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: r.tokenHash });
        if (error) return { ok: false, failure: interpretPinError('sem_internet', undefined, 0) };
        setAccessCase(null);
        setResumeSignal(n => n + 1);
      }
      saveVerifierLater(target, pin);
      return opened();
    } catch (e) {
      if (e instanceof AuthApiError) return failWith(e.error, e.restantes);
      return failWith('sem_internet');
    }
  }, [api, supabase, flushBeforeLeaving]);

  const registerThisDevice = useCallback<AuthContextValue['registerThisDevice']>(async name => {
    const n = name.trim();
    if (!n) return { ok: false, message: 'Dê um nome ao aparelho.' };
    try {
      const r = await api.device.register({ name: n, kind: 'pc_compartilhado' });
      writeDevice({ id: r.deviceId, name: n, kind: 'pc_compartilhado', secret: r.deviceSecret, idleMinutes: 15, authorizedAt: new Date().toISOString() });
      setDevice({ id: r.deviceId, kind: 'pc_compartilhado', name: n, secret: r.deviceSecret, idleMinutes: 15 });
      setDeviceBlock(null);
      setGateClosed(false);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof AuthApiError ? (e.error === 'sem_internet' ? 'Sem internet.' : e.message) : 'Sem internet.' };
    }
  }, [api]);

  const forgetThisDevice = useCallback<AuthContextValue['forgetThisDevice']>(async () => {
    const d = deviceRef.current;
    if (!d) return { ok: true };
    try {
      await api.device.revoke(d.id);
    } catch (e) {
      // já revogado ou removido no servidor: só falta limpar aqui. Qualquer outro erro (sem internet) não limpa nada.
      if (!(e instanceof AuthApiError && e.error === 'aparelho_nao_encontrado')) {
        return { ok: false, message: e instanceof AuthApiError ? (e.error === 'sem_internet' ? 'Sem internet.' : e.message) : 'Sem internet.' };
      }
    }
    clearDevice();
    clearRoster();
    setDevice(null);
    setDeviceBlock(null);
    setGateClosed(false);
    return { ok: true };
  }, [api]);

  const setIdleMinutes = useCallback<AuthContextValue['setIdleMinutes']>(async minutes => {
    const d = deviceRef.current;
    if (!d) return { ok: false, message: 'Este computador não está autorizado.' };
    try { await api.device.setIdle(d.id, minutes); } catch (e) {
      return { ok: false, message: e instanceof AuthApiError ? e.message : 'Sem internet.' };
    }
    const next = { ...d, idleMinutes: minutes };
    setDevice(next);
    if (d.secret) writeDevice({ id: d.id, name: d.name, kind: 'pc_compartilhado', secret: d.secret, idleMinutes: minutes, authorizedAt: '' });
    return { ok: true };
  }, [api]);

  const registerFlush = useCallback((fn: (() => Promise<void>) | null) => { flushRef.current = fn; }, []);

  // ---------- "Sem acesso" ----------
  const probeAccess = useCallback(async (): Promise<void> => {
    if (probing.current) return;
    probing.current = true;
    try {
      const cur = membershipRef.current;
      const ref = await supabase.auth.refreshSession();
      const networkDown = !isOnline() || ref.error?.name === 'AuthRetryableFetchError';
      if (networkDown) return; // não dá para concluir: tenta de novo quando a internet voltar
      const sessionValid = !ref.error && !!ref.data.session;
      // Pessoa desativada = usuário banido no Auth: o refresh volta "user_banned" (não é "entre de novo").
      const userBanned = isBannedError(ref.error);
      let row: { active: boolean; role: string } | null = null;
      if (sessionValid && ref.data.session) {
        const q = await supabase.from('memberships').select('active, role').eq('user_id', ref.data.session.user.id);
        const rows = (q.data ?? []) as { active: boolean; role: string }[];
        row = rows.find(r => r.active) ?? rows[0] ?? null;
      }
      const verdict = classifyAccess({ sessionValid, userBanned, membership: row, currentRole: cur?.role ?? '' });
      if (verdict === 'ok') { setAccessCase(null); setResumeSignal(n => n + 1); return; }
      if (verdict === 'deactivated') { setAccessCase('deactivated'); setMembershipState('none'); return; }
      if (verdict === 'roleChanged') { setAccessCase('roleChanged'); if (userId) void loadMembership(userId, 'refresh'); return; }
      setAccessCase('reauth');
    } finally { probing.current = false; }
  }, [supabase, userId, loadMembership]);

  const acceptRoleChange = useCallback(() => {
    if (pendingRole) { setMembership(pendingRole); setMembershipState('active'); }
    setPendingRole(null);
    setAccessCase(null);
    setResumeSignal(n => n + 1);
  }, [pendingRole]);

  const leaveDeactivated = useCallback(async (): Promise<void> => {
    const uid = sessionRef.current?.user.id ?? null;
    const ws = membershipRef.current?.workshopId ?? readCachedMembership(uid ?? '')?.workshopId ?? null;
    intentionalOut.current = true;
    try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* sessão já inválida */ } finally { intentionalOut.current = false; }
    setSession(null);
    setAccessCase(null);
    setMembershipState('unknown');
    if (uid) {
      forgetPerson(uid);
      clearCachedMembership(uid);
      if (ws) {
        // O provider precisa fechar o banco local antes de ele ser apagado.
        for (let i = 0; i < 5; i++) {
          await sleep(300 * (i + 1));
          try { await purgePersonCache(ws, uid); break; } catch { /* ainda aberto: tenta de novo */ }
        }
      }
    }
    if (deviceRef.current) { setGateClosed(true); setGateReason('switch'); setGatePerson(null); }
  }, [supabase]);

  // Quando a internet volta e o acesso estava em dúvida, confere de novo.
  useEffect(() => { if (online && accessCase === 'reauth' && sessionRef.current) void probeAccess(); }, [online, accessCase, probeAccess]);

  // Carrega os cartões ao abrir a tela de cartões (com cópia em cache enquanto isso).
  useEffect(() => { if (gateClosed && device && online) void refreshRoster(); }, [gateClosed, device, online, refreshRoster]);

  const reloadMembership = useCallback(async (): Promise<void> => {
    if (userId) await loadMembership(userId, 'refresh');
  }, [userId, loadMembership]);

  const sharedDevice = device !== null && deviceBlock !== 'revoked';
  const shownRole = membership?.role ?? null;

  const value = useMemo<AuthContextValue>(() => ({
    loading, session, userId, email, displayName: membership?.displayName || (session?.user.user_metadata?.display_name as string | undefined) || '',
    workshopId, workshopName: membership?.workshopName ?? '', role: shownRole, membershipState, mfaPending,
    importState: membership?.importState ?? 'concluido', lastExportAt: membership?.lastExportAt ?? null, reloadMembership,
    device, deviceId: device?.id ?? localDeviceId(), deviceName: device?.name ?? (typeof navigator !== 'undefined' && /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'Celular' : 'Navegador'),
    sharedDevice, deviceBlock, online, supabase, api, url,
    signIn, verifyMfa, sendResetLink, setNewPassword, changePassword, createPin, changePin, signOut,
    gateClosed, gateReason, gatePerson, switching, roster, rosterLoading, refreshRoster, lock, switchPerson, unlock, closeGate,
    registerThisDevice, setIdleMinutes, forgetThisDevice, registerFlush, pinSetup, finishPinSetup,
    accessCase: accessCase ?? (pendingRole ? 'roleChanged' : null), probeAccess, acceptRoleChange, leaveDeactivated, resumeSignal, lastEmail,
  }), [
    loading, session, userId, email, membership, workshopId, shownRole, membershipState, mfaPending, device, sharedDevice, deviceBlock,
    online, supabase, api, url, signIn, verifyMfa, sendResetLink, setNewPassword, changePassword, createPin, changePin, signOut,
    gateClosed, gateReason, gatePerson, switching, roster, rosterLoading, refreshRoster, lock, switchPerson, unlock, closeGate,
    registerThisDevice, setIdleMinutes, forgetThisDevice, registerFlush, pinSetup, finishPinSetup, accessCase, pendingRole, probeAccess, acceptRoleChange, leaveDeactivated,
    resumeSignal, lastEmail, reloadMembership,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
