import { User } from '@supabase/supabase-js';

export enum UserRole {
  ADMIN = 1,
  MANAGER = 2,
  AGENT = 3,
  NON_DEFINI = 4,
  FINANCE = 5,
}

export const isAdminRole = (role?: unknown): boolean => {
  if (role === undefined || role === null) return false;
  if (role === UserRole.ADMIN || role === 1) return true;
  const s = String(role).trim().toLowerCase();
  return s === '1' || s === 'admin';
};

export const isManagerRole = (role?: unknown): boolean => {
  if (role === undefined || role === null) return false;
  if (role === UserRole.MANAGER || role === 2) return true;
  const s = String(role).trim().toLowerCase();
  return s === '2' || s === 'manager' || s === 'managers';
};

export const isFinanceRole = (role?: unknown): boolean => {
  if (role === undefined || role === null) return false;
  if (role === UserRole.FINANCE || role === 5) return true;
  const s = String(role).trim().toLowerCase();
  return s === '5' || s === 'finance';
};

export const canAccessAdminReports = (role?: unknown): boolean => {
  return isAdminRole(role) || isManagerRole(role) || isFinanceRole(role);
};

export interface UserProfile {
  id: number;
  user_id: string;
  email: string;
  firstname: string;
  name: string;
  role: number;
  created_at: string;
  updated_at: string;
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isOffline: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthError {
  message: string;
  code?: string;
}

export interface DeviceSession {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_info: {
    userAgent: string;
    screenWidth: number;
    screenHeight: number;
    timezone: string;
    language: string;
    platform: string;
  };
  last_active: string;
  created_at: string;
  is_active: boolean;
}
