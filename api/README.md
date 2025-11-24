# LPC Spritesheet Generator API

REST API for programmatically generating LPC character spritesheets.

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start server
npm start

# Or use nodemon for development
npm run dev
```

Server will run on `http://localhost:3000`

### Test the API

```bash
# Health check
curl http://localhost:3000/health

# Generate spritesheet
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d @test-request.json \
  --output character.png
```

## API Endpoints

### `GET /health`
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-24T12:00:00.000Z",
  "uptime": 123.45
}
```

### `POST /api/generate`
Generate a single character spritesheet

**Request Body:**
```json
{
  "bodyTypeName": "male",
  "layers": [
    {
      "fileName": "body/bodies/male/fur_grey.png",
      "zPos": 10,
      "variant": "fur_grey"
    },
    {
      "fileName": "head/heads/troll/adult/light.png",
      "zPos": 100,
      "variant": "light"
    }
  ]
}
```

**Response:**
- Content-Type: `image/png`
- Binary PNG image (832x3456 pixels)

**Headers:**
- `X-Cache`: `HIT` or `MISS` (indicates if result was cached)
- `X-Render-Time`: Time taken to render in milliseconds

### `POST /api/generate-batch`
Generate multiple spritesheets (max 10 per request)

**Request Body:**
```json
[
  {
    "bodyTypeName": "male",
    "layers": [...]
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
  "results": [
    {
      "bodyTypeName": "male",
      "success": true,
      "data": "base64-encoded-png-data...",
      "size": 123456
    }
  ],
  "totalTime": "1234ms"
}
```

## Layer Definition Format

Each layer must have:
- `fileName`: Path relative to `spritesheets/` directory (without animation folder)
- `zPos`: Z-order position (lower = drawn first/behind)
- `variant`: Variant name (optional, for metadata)

**File Path Format:**
```
"body/bodies/male/fur_grey.png"
```

The API automatically appends the animation name:
```
spritesheets/body/bodies/male/walk/fur_grey.png
spritesheets/body/bodies/male/slash/fur_grey.png
...
```

## Supported Animations

The API generates all these animations (if assets exist):
- spellcast, thrust, walk, slash, shoot, hurt
- climb, idle, jump, sit, emote, run
- combat_idle, backslash, halfslash

Output spritesheet: 832x3456px (13 frames × 54 rows)

## Deployment

### Railway

1. Push this directory to GitHub
2. Create new Railway project from GitHub repo
3. Railway will auto-detect the Dockerfile
4. Set environment variable: `NODE_ENV=production`
5. Deploy!

Make sure the `spritesheets/` directory with all assets is included in your repository.

### Docker

```bash
# Build
docker build -t lpc-api .

# Run
docker run -p 3000:3000 lpc-api
```

## Performance

- **Caching**: Results cached for 1 hour
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Render Time**: ~500ms-2s per spritesheet (uncached)

## Unity Integration Example

```csharp
using UnityEngine.Networking;
using System.Collections;

IEnumerator GenerateSpritesheet(string layerJson)
{
    var request = new UnityWebRequest(
        "https://your-api.railway.app/api/generate",
        "POST"
    );

    byte[] bodyRaw = System.Text.Encoding.UTF8.GetBytes(layerJson);
    request.uploadHandler = new UploadHandlerRaw(bodyRaw);
    request.downloadHandler = new DownloadHandlerBuffer();
    request.SetRequestHeader("Content-Type", "application/json");

    yield return request.SendWebRequest();

    if (request.result == UnityWebRequest.Result.Success)
    {
        byte[] pngData = request.downloadHandler.data;
        Texture2D texture = new Texture2D(832, 3456);
        texture.LoadImage(pngData);

        // Use texture...
    }
}
```

## License

GPL-3.0 (matches parent LPC project)
