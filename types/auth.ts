import { User } from '@supabase/supabase-js';

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
