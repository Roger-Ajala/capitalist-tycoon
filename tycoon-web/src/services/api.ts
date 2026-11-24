import axios from 'axios';
import type { SessionResponse } from '../types/game';

export const SESSION_TOKEN_KEY = 'tycoon_session_token';

export const api = axios.create({
  baseURL: 'http://localhost:3333',
  timeout: 10000,
});

// Injeta automaticamente o token salvo em todas as requisições
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(SESSION_TOKEN_KEY);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

let sessionBootPromise: Promise<SessionResponse> | null = null;

export function bootstrapSession(): Promise<SessionResponse> {
  if (!sessionBootPromise) {
    sessionBootPromise = api
      .post<SessionResponse>('/game/session')
      .then((res) => {
        localStorage.setItem(SESSION_TOKEN_KEY, res.data.sessionToken);
        return res.data;
      })
      .catch((err) => {
        sessionBootPromise = null;
        throw err;
      });
  }

  return sessionBootPromise;
}

export function resetSessionBoot() {
  sessionBootPromise = null;
}