import { createClient } from '@supabase/supabase-js'
import type { Database } from '../data/types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(url && anonKey)

if (!isConfigured) {
  console.error(
    'Supabase is not configured. Copy .env.example to .env and fill in your project URL and key.',
  )
}

/**
 * Single shared client. Sessions persist and refresh automatically, which is
 * what lets the same account pick up where it left off on another device.
 */
export const supabase = createClient<Database>(url ?? 'http://localhost', anonKey ?? 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
