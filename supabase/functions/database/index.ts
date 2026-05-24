import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ===== PROFILES =====
async function handleProfiles(req: Request, client: any, userId: string) {
  const method = req.method
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (method === 'GET') {
    if (id) {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()
      return error ? json({ error: error.message }, 400) : json(data)
    }
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
    return error ? json({ error: error.message }, 400) : json(data)
  }

  if (method === 'POST') {
    const body = await req.json()
    const { data, error } = await client
      .from('profiles')
      .insert({ ...body, user_id: userId })
      .select()
      .single()
    return error ? json({ error: error.message }, 400) : json(data, 201)
  }

  if (method === 'PUT') {
    if (!id) return json({ error: 'ID required for update' }, 400)
    const body = await req.json()
    const { data, error } = await client
      .from('profiles')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    return error ? json({ error: error.message }, 400) : json(data)
  }

  if (method === 'DELETE') {
    if (!id) return json({ error: 'ID required for delete' }, 400)
    const { error } = await client
      .from('profiles')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    return error ? json({ error: error.message }, 400) : json({ success: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

// ===== DOCUMENTS =====
async function handleDocuments(req: Request, client: any, userId: string) {
  const method = req.method
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (method === 'GET') {
    if (id) {
      const { data, error } = await client
        .from('documents')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()
      return error ? json({ error: error.message }, 400) : json(data)
    }
    const { data, error } = await client
      .from('documents')
      .select('*')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false })
    return error ? json({ error: error.message }, 400) : json(data)
  }

  if (method === 'POST') {
    const body = await req.json()
    const { data, error } = await client
      .from('documents')
      .insert({ ...body, user_id: userId })
      .select()
      .single()
    return error ? json({ error: error.message }, 400) : json(data, 201)
  }

  if (method === 'PUT') {
    if (!id) return json({ error: 'ID required for update' }, 400)
    const body = await req.json()
    const { data, error } = await client
      .from('documents')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    return error ? json({ error: error.message }, 400) : json(data)
  }

  if (method === 'DELETE') {
    if (!id) return json({ error: 'ID required for delete' }, 400)
    const { error } = await client
      .from('documents')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    return error ? json({ error: error.message }, 400) : json({ success: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

// ===== APPLICATIONS =====
async function handleApplications(req: Request, client: any, userId: string) {
  const method = req.method
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (method === 'GET') {
    if (id) {
      const { data, error } = await client
        .from('applications')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()
      return error ? json({ error: error.message }, 400) : json(data)
    }
    const { data, error } = await client
      .from('applications')
      .select('*')
      .eq('user_id', userId)
      .order('created_date', { ascending: false })
    return error ? json({ error: error.message }, 400) : json(data)
  }

  if (method === 'POST') {
    const body = await req.json()
    const { data, error } = await client
      .from('applications')
      .insert({ ...body, user_id: userId, created_date: new Date().toISOString() })
      .select()
      .single()
    return error ? json({ error: error.message }, 400) : json(data, 201)
  }

  if (method === 'PUT') {
    if (!id) return json({ error: 'ID required for update' }, 400)
    const body = await req.json()
    const { data, error } = await client
      .from('applications')
      .update({ ...body, last_modified: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    return error ? json({ error: error.message }, 400) : json(data)
  }

  if (method === 'DELETE') {
    if (!id) return json({ error: 'ID required for delete' }, 400)
    const { error } = await client
      .from('applications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    return error ? json({ error: error.message }, 400) : json({ success: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

// ===== CONTACTS =====
async function handleContacts(req: Request, client: any, userId: string) {
  const method = req.method
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (method === 'GET') {
    if (id) {
      const { data, error } = await client
        .from('contacts')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()
      return error ? json({ error: error.message }, 400) : json(data)
    }
    const { data, error } = await client
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .order('added_date', { ascending: false })
    return error ? json({ error: error.message }, 400) : json(data)
  }

  if (method === 'POST') {
    const body = await req.json()
    const { data, error } = await client
      .from('contacts')
      .insert({ ...body, user_id: userId, added_date: new Date().toISOString() })
      .select()
      .single()
    return error ? json({ error: error.message }, 400) : json(data, 201)
  }

  if (method === 'PUT') {
    if (!id) return json({ error: 'ID required for update' }, 400)
    const body = await req.json()
    const { data, error } = await client
      .from('contacts')
      .update({ ...body, updated_date: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    return error ? json({ error: error.message }, 400) : json(data)
  }

  if (method === 'DELETE') {
    if (!id) return json({ error: 'ID required for delete' }, 400)
    const { error } = await client
      .from('contacts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    return error ? json({ error: error.message }, 400) : json({ success: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

// ===== SAVED EVENTS =====
async function handleSavedEvents(req: Request, client: any, userId: string) {
  const method = req.method
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (method === 'GET') {
    if (id) {
      const { data, error } = await client
        .from('saved_events')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single()
      return error ? json({ error: error.message }, 400) : json(data)
    }
    const { data, error } = await client
      .from('saved_events')
      .select('*')
      .eq('user_id', userId)
      .order('saved_at', { ascending: false })
    return error ? json({ error: error.message }, 400) : json(data)
  }

  if (method === 'POST') {
    const body = await req.json()
    const { data, error } = await client
      .from('saved_events')
      .insert({ ...body, user_id: userId, saved_at: new Date().toISOString() })
      .select()
      .single()
    return error ? json({ error: error.message }, 400) : json(data, 201)
  }

  if (method === 'PUT') {
    if (!id) return json({ error: 'ID required for update' }, 400)
    const body = await req.json()
    const { data, error } = await client
      .from('saved_events')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single()
    return error ? json({ error: error.message }, 400) : json(data)
  }

  if (method === 'DELETE') {
    if (!id) return json({ error: 'ID required for delete' }, 400)
    const { error } = await client
      .from('saved_events')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    return error ? json({ error: error.message }, 400) : json({ success: true })
  }

  return json({ error: 'Method not allowed' }, 405)
}

// ===== MAIN HANDLER =====
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!supabaseUrl || !supabaseKey) {
      return json({ error: 'Missing Supabase configuration' }, 500)
    }

    const client = createClient(supabaseUrl, supabaseKey)

    // Get user ID from Authorization header
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: authError } = await client.auth.getUser(token)

    if (authError || !userData?.user?.id) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const userId = userData.user.id
    const url = new URL(req.url)
    const resource = url.searchParams.get('resource') || url.pathname.split('/').pop()

    // Route to appropriate handler
    switch (resource) {
      case 'profiles':
        return await handleProfiles(req, client, userId)
      case 'documents':
        return await handleDocuments(req, client, userId)
      case 'applications':
        return await handleApplications(req, client, userId)
      case 'contacts':
        return await handleContacts(req, client, userId)
      case 'saved_events':
      case 'saved-events':
        return await handleSavedEvents(req, client, userId)
      default:
        return json({ error: `Unknown resource: ${resource}` }, 404)
    }
  } catch (error: any) {
    console.error('Database function error:', error)
    return json({ error: error.message || 'Internal server error' }, 500)
  }
})
