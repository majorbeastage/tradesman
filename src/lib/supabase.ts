import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { authStorageForCurrentPlatform } from './supabaseAuthStorage'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

const supabaseKey = supabaseAnonKey
const nativeAuthStorage = authStorageForCurrentPlatform()

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
          ...(nativeAuthStorage ? { storage: nativeAuthStorage } : {}),
        },
      })
    : null
