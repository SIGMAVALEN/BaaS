import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return new Response('Unauthorized', { status: 401 })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const now = new Date()
  const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const { data, error } = await supabase.from('appointments').select('id,title,scheduled_at,owner_id').eq('completed', false).gte('scheduled_at', now.toISOString()).lte('scheduled_at', horizon.toISOString())
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ reminders: data ?? [], generated_at: now.toISOString() })
})
