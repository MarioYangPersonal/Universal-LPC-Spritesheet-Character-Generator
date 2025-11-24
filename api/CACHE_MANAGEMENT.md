# Cache Management Guide

## Overview

The API uses a **3-tier caching system**:

1. **Disk Cache** (Persistent) - Pre-generated common characters
2. **Memory Cache** (1 hour) - Recently requested characters
3. **On-Demand** - Generate if not cached

## Railway Volume Setup (Required for Persistence)

### 1. Create Volume in Railway

1. Go to your Railway project
2. Click on your service
3. Go to **"Settings"** → **"Volumes"**
4. Click **"New Volume"**
5. Configure:
   ```
   Mount Path: /app/cache
   Size: 10GB (adjust based on needs)
   ```
6. Deploy

**Important:** Without a volume, the cache is ephemeral and resets on every deployment!

### 2. Update Dockerfile (if needed)

The cache directory is already configured in the code. Just ensure it's writable:

```dockerfile
# In Dockerfile, after WORKDIR /app
RUN mkdir -p cache
```

## Admin API Endpoints

All admin endpoints require authentication via `X-Api-Key` header.

### Authentication

Set in Railway environment variables:
```bash
ADMIN_API_KEY=your-secure-secret-key-here
```

Use in requests:
```bash
curl -H "X-Api-Key: your-secure-secret-key-here" \
  https://your-api.railway.app/api/admin/cache/stats
```

### Endpoints

#### 1. Get Cache Statistics

```bash
GET /api/admin/cache/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "count": 200,
    "totalSize": 471859200,
    "totalSizeMB": "450.00"
  }
}
```

#### 2. List All Cached Characters

```bash
GET /api/admin/cache/list
```

**Response:**
```json
{
  "success": true,
  "count": 200,
  "files": [
    "a3f8b9c2d1e4f5a6b7c8d9e0f1a2b3c4.png",
    "b4e9c0d2f3a4b5c6d7e8f9a0b1c2d3e4.png",
    ...
  ]
}
```

#### 3. Pre-Generate Characters (Warm Cache)

```bash
POST /api/admin/cache/generate
Content-Type: application/json

[
  {
    "bodyTypeName": "male",
    "layers": [
      { "fileName": "body/bodies/male/light.png", "zPos": 10, "variant": "light" },
      { "fileName": "hair/male/short/brown.png", "zPos": 120, "variant": "brown" }
    ]
  },
  {
    "bodyTypeName": "female",
    "layers": [...]
  }
]
```

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 2,
    "generated": 2,
    "alreadyCached": 0,
    "failed": 0
  },
  "results": [
    {
      "bodyTypeName": "male",
      "status": "generated",
      "hash": "a3f8b9c2d1e4f5a6b7c8d9e0f1a2b3c4",
      "size": 2359296
    }
  ]
}
```

#### 4. Clear Entire Cache

```bash
DELETE /api/admin/cache/clear
```

**Response:**
```json
{
  "success": true,
  "message": "Cache cleared successfully",
  "deletedCount": 200
}
```

#### 5. Delete Specific Cached Character

```bash
DELETE /api/admin/cache/:hash
```

Example:
```bash
DELETE /api/admin/cache/a3f8b9c2d1e4f5a6b7c8d9e0f1a2b3c4
```

#### 6. Warm Up Cache (Load into Memory)

```bash
POST /api/admin/cache/warmup
```

Useful after cold start to load disk cache into memory.

## Pre-Generating 200 Common Characters

### Step 1: Create Character Definitions File

Create `common-characters.json`:

```json
[
  {
    "bodyTypeName": "male",
    "layers": [
      { "fileName": "body/bodies/male/light.png", "zPos": 10, "variant": "light" },
      { "fileName": "head/heads/human/male/light.png", "zPos": 100, "variant": "light" },
      { "fileName": "hair/male/short/brown.png", "zPos": 120, "variant": "brown" }
    ]
  },
  ... (198 more)
]
```

### Step 2: Pre-Generate via API

```bash
curl -X POST https://your-api.railway.app/api/admin/cache/generate \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your-admin-key" \
  -d @common-characters.json
```

This will:
- Generate all 200 spritesheets
- Save them to `/app/cache/` (Railway volume)
- Persist across deployments
- Serve instantly on requests

### Step 3: Verify

```bash
curl -H "X-Api-Key: your-admin-key" \
  https://your-api.railway.app/api/admin/cache/stats
```

Should show 200 cached files.

## Cache Behavior

### Request Flow

```
1. Request comes in
   ↓
2. Check DISK cache (/app/cache/*.png)
   ↓ [Hit: Return immediately - 0ms]
   ↓ [Miss: Continue]
3. Check MEMORY cache (NodeCache)
   ↓ [Hit: Return from memory - 0ms]
   ↓ [Miss: Continue]
4. Generate spritesheet (~500-2000ms)
   ↓
5. Save to MEMORY cache (1 hour TTL)
   ↓
6. Return to client
```

### Cache Headers

Response includes cache information:

```http
X-Cache: DISK-HIT        # Served from disk cache
X-Cache: MEMORY-HIT      # Served from memory cache
X-Cache: MISS            # Generated on-demand
X-Cache-Key: a3f8b9c... # Hash of character definition
X-Render-Time: 1234ms    # Generation time (if applicable)
```

## Cost & Performance Impact

### Without Pre-Caching

- First request: ~1-2 seconds (generation time)
- Railway execution time charged for generation
- 1000 requests/day × 1.5s avg = ~25 minutes execution = ~$0.35/day

### With Pre-Caching (200 common characters)

- Cached requests: ~5-50ms (disk read)
- Railway execution time: minimal
- If 80% of requests are cached:
  - 800 cached × 0.01s = 8 seconds
  - 200 generated × 1.5s = 300 seconds
  - Total = ~5 minutes execution = ~$0.07/day

**Savings: ~80% reduction in Railway costs!**

### Cache Storage

- Each spritesheet: ~2-3 MB
- 200 characters: ~500 MB
- Recommendation: 10GB Railway volume (plenty of headroom)

## Example: Pre-Generate Script

Create `scripts/pregenerate.js`:

```javascript
const fs = require('fs');
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.ADMIN_API_KEY;

async function pregenerateCache() {
  const characters = JSON.parse(fs.readFileSync('common-characters.json'));

  console.log(`Pre-generating ${characters.length} characters...`);

  const response = await axios.post(
    `${API_URL}/api/admin/cache/generate`,
    characters,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY
      }
    }
  );

  console.log('Results:', response.data.summary);
  console.log(`Generated: ${response.data.summary.generated}`);
  console.log(`Already Cached: ${response.data.summary.alreadyCached}`);
  console.log(`Failed: ${response.data.summary.failed}`);
}

pregenerateCache().catch(console.error);
```

Run:
```bash
node scripts/pregenerate.js
```

## Security Considerations

1. **Protect Admin API Key**: Never commit to git
2. **Use Environment Variables**: Set in Railway dashboard
3. **Rate Limiting**: Admin endpoints are still rate-limited
4. **Monitor Usage**: Check logs for suspicious activity
5. **Rotate Keys**: Change ADMIN_API_KEY periodically

## Monitoring

Track cache effectiveness:

```bash
# Check cache stats regularly
curl -H "X-Api-Key: $ADMIN_API_KEY" \
  https://your-api.railway.app/api/admin/cache/stats

# Monitor response headers in your application
X-Cache: DISK-HIT vs MISS ratio
```

## Troubleshooting

### Cache not persisting across deployments

- **Cause**: No Railway volume mounted
- **Fix**: Create volume at `/app/cache` in Railway settings

### "Permission denied" errors

- **Cause**: Cache directory not writable
- **Fix**: Ensure Dockerfile creates directory with proper permissions

### Cache growing too large

- **Cause**: Auto-caching all requests to disk (optional feature enabled)
- **Fix**: Clear old cache periodically or disable auto-caching

### Pre-generation timing out

- **Cause**: Generating 200+ characters in one request is slow
- **Fix**: Split into batches of 50 or run as background job

## Best Practices

1. **Pre-generate during deployment**: Add to build process
2. **Monitor cache hit rate**: Aim for >80% disk cache hits
3. **Update cache when assets change**: Clear and regenerate
4. **Use meaningful names**: Store character definitions with descriptions
5. **Backup cache definitions**: Keep `common-characters.json` in version control

---

Questions? Check the main README or open an issue on GitHub.
