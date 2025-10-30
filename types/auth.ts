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
