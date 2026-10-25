// Media storage for ENCRYPTED files (the server never sees photos/videos in clear).
// Pick one with env vars:
//   LAKIYA_API_KEY=...            -> Lakiya Cloud  (https://cloud.laksidu.site, no credit card)
//   S3_BUCKET=... (+S3_*)         -> any S3 bucket (Cloudflare R2, Backblaze B2, ...)
const { Readable } = require('stream');
const crypto = require('crypto');


// ── S3 / Backblaze B2 settings: accepts the usual variable names, cleans them up and works out the region ──
const clean = v => String(v == null ? '' : v).trim().replace(/^["']+|["']+$/g, '').trim();
const pick = (...names) => { for (const n of names) { const v = clean(process.env[n]); if (v) return v; } return ''; };
function s3config() {
  const Bucket = pick('S3_BUCKET', 'S3_BUCKET_NAME', 'B2_BUCKET', 'B2_BUCKET_NAME', 'BUCKET_NAME', 'BACKBLAZE_BUCKET');
  if (!Bucket) return null;
  let endpoint = pick('S3_ENDPOINT', 'S3_ENDPOINT_URL', 'B2_ENDPOINT', 'B2_S3_ENDPOINT', 'AWS_ENDPOINT_URL', 'BACKBLAZE_ENDPOINT');
  let region = pick('S3_REGION', 'B2_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION').toLowerCase();
  const accessKeyId = pick('S3_ACCESS_KEY', 'S3_ACCESS_KEY_ID', 'B2_KEY_ID', 'B2_APPLICATION_KEY_ID', 'B2_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID', 'BACKBLAZE_KEY_ID');
  const secretAccessKey = pick('S3_SECRET_KEY', 'S3_SECRET_ACCESS_KEY', 'B2_APPLICATION_KEY', 'B2_SECRET_KEY', 'B2_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY', 'BACKBLAZE_APPLICATION_KEY');
  if (!endpoint && region && region !== 'auto') endpoint = 'https://s3.' + region + '.backblazeb2.com';   // only a Backblaze region given
  if (endpoint && !/^https?:\/\//i.test(endpoint)) endpoint = 'https://' + endpoint;
  let problem = '';
  if (endpoint) {
    try {
      const u = new URL(endpoint); let host = u.host.toLowerCase();
      if (host.startsWith(Bucket.toLowerCase() + '.')) host = host.slice(Bucket.length + 1);   // "bucket.s3.us-west-004..." pasted instead of the plain endpoint
      endpoint = u.protocol + '//' + host;
      const m = host.match(/^s3\.([a-z0-9-]+)\.backblazeb2\.com$/);
      if (m && (!region || region === 'auto' || region !== m[1])) region = m[1];                  // B2 signs with its own region, "auto" fails with SignatureDoesNotMatch
    } catch { problem = 'S3_ENDPOINT is not a valid URL: ' + endpoint; }
  } else problem = 'S3_ENDPOINT is not set (Backblaze: Buckets → your bucket → "Endpoint", e.g. s3.us-west-004.backblazeb2.com)';
  if (!problem && (!accessKeyId || !secretAccessKey)) problem = 'S3_ACCESS_KEY (keyID) and S3_SECRET_KEY (applicationKey) must both be set';
  return { Bucket, endpoint, region: region || 'auto', accessKeyId, secretAccessKey, problem };
}
function explain(e, c) {   // turn the SDK's vague errors into something you can act on
  const n = e.name || e.Code || 'Error', code = e.$metadata && e.$metadata.httpStatusCode;
  let hint = '';
  if (/NoSuchBucket/.test(n) || code === 404) hint = ' → bucket name "' + c.Bucket + '" not found at this endpoint (check the exact bucket name and that the endpoint region matches the bucket)';
  else if (/InvalidAccessKeyId|AccessDenied|Forbidden/.test(n) || code === 401 || code === 403) hint = ' → key rejected: use the keyID + applicationKey of a key that can read/write THIS bucket (not the master key) and has no file-name prefix limit';
  else if (/SignatureDoesNotMatch/.test(n)) hint = ' → wrong applicationKey, or region/endpoint mismatch (endpoint ' + c.endpoint + ', region ' + c.region + ')';
  else if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN/.test(String(e.code || n))) hint = ' → endpoint host cannot be reached: ' + c.endpoint;
  return n + ': ' + (e.message || 'failed') + hint;
}

function make() {
  // ───────── Lakiya Cloud ─────────
  if (process.env.STORAGE === 'lakiya' || (process.env.LAKIYA_API_KEY && !s3config())) {   // an S3 bucket, when configured, is always used first
    const base = (process.env.LAKIYA_URL || 'https://cloud.laksidu.site').replace(/\/$/, '');
    const apiKey = process.env.LAKIYA_API_KEY || '';
    const expiry = process.env.LAKIYA_EXPIRY || '24h';          // 1h, 6h, 24h, 7d, 30d (0 = permanent)
    return {
      name: 'Lakiya Cloud (' + base + ')',
      async put(uid, buf) {
        const fd = new FormData();
        fd.append('file', new Blob([buf], { type: 'application/octet-stream' }), crypto.randomBytes(8).toString('hex') + '.bin');
        fd.append('expiry', expiry);
        const r = await fetch(base + '/api/cloud/upload', { method: 'POST', headers: apiKey ? { 'x-api-key': apiKey } : {}, body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.file_id) throw new Error('Lakiya upload failed: ' + (j.error || j.message || r.status));
        return `u/${uid}/${j.file_id}`;
      },
      async send(key, res, extra = {}) {
        try {
          const r = await fetch(base + '/dl/' + encodeURIComponent(key.split('/')[2]));
          if (!r.ok || !r.body) return res.status(404).end();
          res.set({ ...extra, 'Content-Type': 'application/octet-stream' });
          const len = r.headers.get('content-length'); if (len) res.set('Content-Length', len);
          const s = Readable.fromWeb(r.body); s.on('error', () => res.destroy()); s.pipe(res);
        } catch { if (!res.headersSent) res.status(404).end(); }
      },
      async del() {},     // files expire by themselves (LAKIYA_EXPIRY)
      async sweep() {},
    };
  }
  // ───────── S3-compatible (Backblaze B2 / R2 / ...) ─────────
  const s3c = s3config();
  if (s3c) {
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadBucketCommand } = require('@aws-sdk/client-s3');
    const { Bucket } = s3c;
    const s3 = new S3Client({ region: s3c.region, endpoint: s3c.endpoint, forcePathStyle: true,
      credentials: { accessKeyId: s3c.accessKeyId, secretAccessKey: s3c.secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
    const del = Key => s3.send(new DeleteObjectCommand({ Bucket, Key })).catch(() => {});
    return {
      name: 'bucket ' + Bucket + ' @ ' + s3c.endpoint + ' (' + s3c.region + ')',
      async check() {   // logged at start-up: tells you right away if endpoint / keys / bucket name are wrong
        if (s3c.problem) throw new Error(s3c.problem);
        try { await s3.send(new HeadBucketCommand({ Bucket })); }
        catch (e) {   // a bucket-restricted B2 key may not be allowed HeadBucket — a tiny list call is a second opinion
          try { await s3.send(new ListObjectsV2Command({ Bucket, MaxKeys: 1 })); }
          catch (e2) { throw new Error(explain(e2, s3c)); }
        }
      },
      async put(uid, buf) { const Key = `u/${uid}/${crypto.randomBytes(12).toString('hex')}`;
        try { await s3.send(new PutObjectCommand({ Bucket, Key, Body: buf, ContentType: 'application/octet-stream' })); }
        catch (e) { throw new Error('Media upload failed: ' + explain(e, s3c)); }
        return Key; },
      async send(Key, res, extra = {}) {
        try {
          const r = await s3.send(new GetObjectCommand({ Bucket, Key }));
          res.set({ ...extra, 'Content-Type': 'application/octet-stream' });
          if (r.ContentLength) res.set('Content-Length', String(r.ContentLength));
          r.Body.on('error', () => res.destroy()); r.Body.pipe(res);
        } catch (e) { console.error('media get', Key, e.name + ': ' + e.message); if (!res.headersSent) res.status(404).end(); }
      },
      del,
      async sweep() {
        try {
          let t, n = 0; const old = Date.now() - 26 * 36e5;
          do {
            const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: 'u/', ContinuationToken: t }));
            for (const o of r.Contents || []) if (o.LastModified.getTime() < old) { await del(o.Key); n++; }
            t = r.IsTruncated ? r.NextContinuationToken : undefined;
          } while (t);
          if (n) console.log('sweep: removed', n, 'expired file(s)');
        } catch (e) { console.error('sweep', e.message); }
      },
    };
  }
  return null;
}
module.exports = make();
