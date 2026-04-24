import { createClient } from '@supabase/supabase-js'

const normalizeSupabaseUrl = (value: string | undefined) =>
  typeof value === 'string' ? value.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') : ''

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env or .env.local file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
