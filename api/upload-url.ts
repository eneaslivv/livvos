import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// This serverless function creates signed upload URLs using the service_role key.
// The actual file upload goes directly from the browser to Supabase Storage,
// bypassing Vercel's body size limits. The service_role key stays server-side (secure).

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Verify the user is authenticated by checking their JWT
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' })
  }

  const userToken = authHeader.replace('Bearer ', '')

  try {
    // Verify user token using service_role client (can verify any JWT)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
    const { data: { user }, error: authError } = await adminClient.auth.getUser(userToken)

    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido' })
    }

    const { fileName, contentType } = req.body || {}

    if (!fileName) {
      return res.status(400).json({ error: 'fileName es requerido' })
    }

    // Build storage path: userId/timestamp_filename
    const storagePath = `${user.id}/${Date.now()}_${fileName}`

    // Create a signed upload URL (adminClient already created above with service_role key)
    const { data, error } = await adminClient.storage
      .from('documents')
      .createSignedUploadUrl(storagePath)

    if (error) {
      console.error('Error creating signed URL:', error)
      return res.status(500).json({ error: `Error creando URL de subida: ${error.message}` })
    }

    // Get the public URL for the file (will be valid after upload)
    const { data: urlData } = adminClient.storage
      .from('documents')
      .getPublicUrl(storagePath)

    return res.status(200).json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
      publicUrl: urlData.publicUrl,
      userId: user.id
    })
  } catch (err: any) {
    console.error('Upload URL error:', err)
    return res.status(500).json({ error: err.message || 'Error interno del servidor' })
  }
}
