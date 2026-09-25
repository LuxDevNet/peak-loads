// Standalone Cloudflare Worker for R2 Storage
// Deploy with: npx wrangler deploy

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const bucket = env.R2_BUCKET || env.BUCKET;
    if (!bucket) {
      return new Response(JSON.stringify({
        error: 'R2 bucket not bound. Add [[r2_buckets]] binding named R2_BUCKET in wrangler.toml.'
      }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Route: POST /api/upload
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('file');

        if (!file || typeof file === 'string') {
          return new Response(JSON.stringify({ error: 'No file found in form data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
          url: `${url.origin}/api/files/${encodeURIComponent(key)}`
        }), {
          status: 201,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Route: GET /api/files
    if (url.pathname === '/api/files' && request.method === 'GET') {
      try {
        const listed = await bucket.list({ prefix: 'uploads/', limit: 50 });
        const objects = listed.objects.map(obj => ({
          key: obj.key,
          size: obj.size,
          uploadedAt: obj.uploaded,
          name: obj.customMetadata?.originalName || obj.key.replace(/^uploads\/\d+-/, ''),
          url: `${url.origin}/api/files/${encodeURIComponent(obj.key)}`
        }));

        return new Response(JSON.stringify({ objects }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Route: GET /api/files/:key
    if (url.pathname.startsWith('/api/files/') && request.method === 'GET') {
      const key = decodeURIComponent(url.pathname.replace('/api/files/', ''));
      const obj = await bucket.get(key);
      if (!obj) {
        return new Response('File not found in R2', { status: 404, headers: corsHeaders });
      }

      const headers = new Headers(corsHeaders);
      obj.writeHttpMetadata(headers);
      headers.set('etag', obj.httpEtag);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(obj.body, { headers });
    }

    return new Response(JSON.stringify({ status: 'SDG&E R2 Storage Worker Active' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
