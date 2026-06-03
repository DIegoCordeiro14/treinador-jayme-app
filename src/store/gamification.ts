import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { League } from '@/lib/edn/gamification';

export interface XPNotification {
  id: string;
  xp: number;
  reason: string;
  timestamp: number;
}

interface GamificationState {
  userXp: number;
  userLevel: number;
  ednScore: number;
  league: League;
  pendingNotifications: XPNotification[];
  addXPNotification: (xp: number, reason: string) => void;
  dismissNotification: (id: string) => void;
  setUserXP: (xp: number, level: number) => void;
  setEdnScore: (score: number, league: League) => void;
}

export const useGamificationStore = create<GamificationState>()(
  immer((set) => ({
    userXp: 0,
    userLevel: 1,
    ednScore: 0,
    league: 'bronze',
    pendingNotifications: [],

    addXPNotification: (xp, reason) =>
      set((state) => {
        state.pendingNotifications.push({ id: crypto.randomUUID(), xp, reason, timestamp: Date.now() });
      }),

    dismissNotification: (id) =>
      set((state) => {
        state.pendingNotifications = state.pendingNotifications.filter((n) => n.id !== id);
      }),

    setUserXP: (xp, level) =>
      set((state) => { state.userXp = xp; state.userLevel = level; }),

    setEdnScore: (score, league) =>
      set((state) => { state.ednScore = score; state.league = league; }),
  }))
);
