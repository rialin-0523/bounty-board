import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://tbtvgdeljiiwzixwiwue.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_CVVMEJT6cC1ho_s0URwf3g_DsATUGJP'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
