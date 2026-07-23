'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useDerivWS } from '@deriv/core';
import { useAuth } from '@/hooks/use-auth';
import type { DerivWS } from '@deriv/core';
import type { UseAuthReturn } from '@/hooks/use-auth';

interface DerivWSContextValue {
  ws: DerivWS | null;
  isConnected: boolean;
  isExhausted: boolean;
  auth: UseAuthReturn;
}

const DerivWSContext = createContext<DerivWSContextValue | null>(null);

function TradeResultNotification({ ws, isConnected, balance, currency }: { ws: DerivWS | null; isConnected: boolean; balance?: string | number; currency?: string }) {
  const [notice, setNotice] = useState<{ profit: number; currency: string; balance: string | number; id: string } | null>(null);
  const seen = useRef(new Map<string, boolean>());
  useEffect(() => {
    if (!ws || !isConnected) return;
    return ws.onMessage(data => {
      if (data.msg_type !== 'proposal_open_contract') return;
      const contract = data.proposal_open_contract as Record<string, unknown> | undefined;
      if (!contract?.contract_id) return;
      const id = String(contract.contract_id);
      const closed = !!contract.is_sold || !!contract.is_expired || contract.status !== 'open';
      const wasOpen = seen.current.get(id);
      seen.current.set(id, !closed);
      if (wasOpen && closed) setNotice({ id, profit: Number(contract.profit || 0), currency: String(contract.currency || currency || ''), balance: String(contract.balance_after || balance || '') });
    });
  }, [ws, isConnected, balance, currency]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 3500); const key = (e: KeyboardEvent) => e.key === 'Escape' && setNotice(null); window.addEventListener('keydown', key); return () => { clearTimeout(timer); window.removeEventListener('keydown', key); }; }, [notice]);
  if (!notice) return null;
  const won = notice.profit > 0;
  return <aside role="status" aria-live="polite" style={{ position:'fixed', zIndex:100, top:20, right:20, width:'min(390px, calc(100vw - 40px))', padding:'18px 42px 18px 78px', borderRadius:14, color:'#fff', background:won?'rgba(4,61,39,.96)':'rgba(72,17,30,.96)', border:`1px solid ${won?'#19d475':'#ff4056'}`, boxShadow:'0 20px 55px rgba(0,0,0,.42)', animation:'profitera-result-in .28s ease-out' }}>
    <style>{'@keyframes profitera-result-in{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}'}</style><span style={{position:'absolute',left:18,top:18,width:46,height:46,borderRadius:'50%',display:'grid',placeItems:'center',fontSize:22,background:won?'#17c96d':'#ff3d4d'}}>{won?'↗':'↘'}</span><button onClick={() => setNotice(null)} aria-label="Close trade result" style={{position:'absolute',right:10,top:7,border:0,background:'transparent',color:'#fff',fontSize:22,cursor:'pointer'}}>×</button><strong style={{fontSize:17}}>{won?'Trade Won! 🎉':'Trade Lost 😔'}</strong><div style={{marginTop:5,fontWeight:700}}>{won?'You gained ':'You lost '}{Math.abs(notice.profit).toFixed(2)} {notice.currency}</div><div style={{marginTop:5,color:'#e1e9ef'}}>New balance: {notice.balance} {notice.currency}</div>
  </aside>;
}

/**
 * Maintains a single WebSocket connection and auth state above all page components
 * so navigation between pages (e.g. main → reports → back) does not tear down
 * and recreate the connection.
 */
export function DerivWSProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { ws, isConnected, isExhausted } = useDerivWS({
    url: auth.wsUrl,
    accountId: auth.activeAccountId ?? undefined,
  });

  useEffect(() => {
    if (!ws || !isConnected || auth.authState !== 'authenticated') return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    ws.subscribe({ balance: 1 }, data => {
      const update = data.balance as { balance?: string | number; loginid?: string; account_id?: string; currency?: string } | undefined;
      if (!cancelled && update?.balance != null) {
        auth.updateBalance(update.balance, update.loginid || update.account_id, update.currency);
      }
    }).then(subscription => {
      unsubscribe = subscription.unsubscribe;
    }).catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [ws, isConnected, auth.authState, auth.updateBalance]);

  return (
    <DerivWSContext.Provider value={{ ws, isConnected, isExhausted, auth }}>
      {children}
      <TradeResultNotification ws={ws} isConnected={isConnected} balance={auth.activeAccount?.balance} currency={auth.activeAccount?.currency} />
    </DerivWSContext.Provider>
  );
}

export function useDerivWSContext(): DerivWSContextValue {
  const ctx = useContext(DerivWSContext);
  if (!ctx) {
    throw new Error('useDerivWSContext must be used within a DerivWSProvider');
  }
  return ctx;
}
