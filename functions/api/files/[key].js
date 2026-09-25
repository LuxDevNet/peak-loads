// Cloudflare Pages Function: GET /api/files/:key
// Serves an uploaded file directly from the Cloudflare R2 bucket

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range'
    }
  });
}

export async function onRequestGet(context) {
  const { params, env } = context;
  const key = decodeURIComponent(params.key);

  const bucket = env.R2_BUCKET || env.BUCKET;
  if (!bucket) {
    return new Response('R2 bucket not bound', { status: 503 });
  }

  try {
    const obj = await bucket.get(key);
    if (!obj) {
      return new Response('File not found in R2 bucket', { status: 404 });
    }

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new Response(obj.body, { headers });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}
