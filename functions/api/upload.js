// Cloudflare Pages Function: POST /api/upload
// Handles file uploads to Cloudflare R2 bucket binding 'R2_BUCKET' or 'BUCKET'

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const bucket = env.R2_BUCKET || env.BUCKET;
  if (!bucket) {
    return new Response(JSON.stringify({
      error: 'R2 bucket not bound. Bind your R2 bucket as R2_BUCKET in Cloudflare Pages settings (Settings > Functions > R2 bucket bindings).',
      mock: true
    }), { status: 503, headers: corsHeaders });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'No file provided in form data (expected field name: file)' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `uploads/${timestamp}-${safeName}`;

    await bucket.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream'
      },
      customMetadata: {
        originalName: file.name,
        size: String(file.size),
        uploadedAt: new Date().toISOString()
      }
    });

    return new Response(JSON.stringify({
      success: true,
      key,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString(),
      url: `/api/files/${encodeURIComponent(key)}`
    }), { status: 201, headers: corsHeaders });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
