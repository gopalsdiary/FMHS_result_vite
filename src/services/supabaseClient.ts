import { createClient } from '@supabase/supabase-js'

const normalizeSupabaseUrl = (value: string | undefined) =>
  typeof value === 'string' ? value.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '') : ''

const DEFAULT_SUPABASE_URL = 'https://rtfefxghfbtirfnlbucb.supabase.co'
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0ZmVmeGdoZmJ0aXJmbmxidWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA1MDg3OTcsImV4cCI6MjA1NjA4NDc5N30.fb7_myCmFzbV7WPNjFN_NEl4z0sOmRCefnkQbk6c10w'

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL) || DEFAULT_SUPABASE_URL
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || DEFAULT_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)


