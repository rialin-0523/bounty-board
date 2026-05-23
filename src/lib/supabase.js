import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tbtvgdeljiiwzixwiwue.supabase.co'
const supabaseAnonKey = 'sb_publishable_CVVMEJT6cC1ho_s0URwf3g_DsATUGJP'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)