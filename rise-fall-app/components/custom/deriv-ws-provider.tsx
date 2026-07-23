'use client';

import { createContext, useContext, useEffect } from 'react';
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
