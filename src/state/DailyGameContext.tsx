import React, { createContext, useContext } from 'react';
import { useDailyGame, UseDailyGameResult } from './useDailyGame';

/**
 * One shared copy of today's game. Home and the game board both read it, and
 * without this each screen would mount its own hook and fetch separately.
 */
const DailyGameContext = createContext<UseDailyGameResult | null>(null);

export function DailyGameProvider({ children }: { children: React.ReactNode }) {
  const value = useDailyGame();
  return <DailyGameContext.Provider value={value}>{children}</DailyGameContext.Provider>;
}

export function useDailyGameContext(): UseDailyGameResult {
  const ctx = useContext(DailyGameContext);
  if (!ctx) throw new Error('useDailyGameContext must be used within DailyGameProvider');
  return ctx;
}
