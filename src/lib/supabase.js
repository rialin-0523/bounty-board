import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tbtvgdeljiiwzixwiwue.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRidHZnZGVsamlpd3ppeHdpd3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MDk3NTYsImV4cCI6MjA5NTA4NTc1Nn0.CxgHBxLkb1P4kriGbIDGIU2lIDtQXEgh8vSIL2XzvZA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)