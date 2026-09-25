// Cloudflare Pages Function: GET /api/files
// Lists objects stored in the bound Cloudflare R2 bucket

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export async function onRequestGet(context) {
  const { env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const bucket = env.R2_BUCKET || env.BUCKET;
  if (!bucket) {
    return new Response(JSON.stringify({
      objects: [],
      warning: 'R2 bucket not bound. Bind your R2 bucket as R2_BUCKET in Cloudflare.'
    }), { status: 200, headers: corsHeaders });
  }

  try {
    const listed = await bucket.list({ prefix: 'uploads/', limit: 50 });
    const objects = listed.objects.map(obj => ({
      key: obj.key,
      size: obj.size,
      uploadedAt: obj.uploaded,
      name: obj.customMetadata?.originalName || obj.key.replace(/^uploads\/\d+-/, ''),
      url: `/api/files/${encodeURIComponent(obj.key)}`
    }));

    return new Response(JSON.stringify({ objects }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}
