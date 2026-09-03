'use client';

import { useState, useEffect, createContext, useContext } from 'react';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'miembro' | 'observador';
};

type SessionContextType = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<SessionContextType>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
});

export function useSession() {
  return useContext(SessionContext);
}

export { SessionContext };
export type { User, SessionContextType };
