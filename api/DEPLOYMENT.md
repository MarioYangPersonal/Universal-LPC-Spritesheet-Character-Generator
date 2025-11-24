# Railway Deployment Guide

## Prerequisites

- Railway Pro account
- GitHub account
- Full LPC spritesheet assets in `/spritesheets` directory

## Step-by-Step Deployment

### 1. Prepare Your Repository

The `api/` directory needs access to the `spritesheets/` folder from the parent directory.

**Option A: Separate Repository (Recommended)**
```bash
# Create new repo for API only
mkdir lpc-api-deploy
cd lpc-api-deploy

# Copy API files
cp -r /path/to/LPC-NoSpriteAssets/api/* .

# Copy spritesheet assets
cp -r /path/to/LPC-NoSpriteAssets/spritesheets ./spritesheets

# Initialize git
git init
git add .
git commit -m "Initial commit: LPC Generator API"

# Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/lpc-api.git
git push -u origin main
```

**Option B: Monorepo with Subdirectory**

Update the Dockerfile to copy from parent:
```dockerfile
# In Dockerfile, replace:
COPY ../spritesheets ./spritesheets

# With absolute copy after COPY . .
# Railway will have access to parent directory
```

### 2. Deploy to Railway

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository
5. Railway will auto-detect the Dockerfile

### 3. Configure Railway Service

#### Build Settings
- **Build Command**: (leave empty, Docker handles it)
- **Dockerfile Path**: `Dockerfile` or `api/Dockerfile` (if monorepo)

#### Environment Variables
Set these in Railway dashboard:
```
NODE_ENV=production
```

Railway automatically sets `PORT` variable.

#### Resources (Railway Pro)
- **Memory**: 1GB minimum (recommended: 2GB)
- **CPU**: Default is fine
- **Replicas**: 1 (scale up if needed)

### 4. Get Your API URL

After deployment, Railway provides a URL like:
```
https://lpc-api-production-xxxx.up.railway.app
```

You can:
- Use this URL directly
- Add a custom domain in Railway settings

### 5. Test Your Deployment

```bash
# Health check
curl https://your-api-url.railway.app/health

# Generate spritesheet
curl -X POST https://your-api-url.railway.app/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "bodyTypeName": "male",
    "layers": [
      {
        "fileName": "body/bodies/male/light.png",
        "zPos": 10,
        "variant": "light"
      }
    ]
  }' \
  --output test.png
```

## Important Notes

### Asset Size
The `spritesheets/` directory is ~1-2GB. Make sure:
- ✅ It's included in your git repo OR
- ✅ Uploaded separately via Railway volumes OR
- ✅ Fetched during build from external source

### Build Time
First deployment takes 5-10 minutes:
- Installing node-canvas dependencies (~3 min)
- Copying assets (~2-5 min)
- Starting server (~1 min)

### Cost Estimate (Railway Pro)
- **Fixed**: ~$5-10/month for always-on service
- **Usage**: ~$0.000463/minute of execution
- **Example**: 1000 requests/day at 1s each = ~$4/month extra
- **Total**: ~$10-20/month typical usage

### Troubleshooting

#### Build fails with "node-canvas" errors
- Railway should use Dockerfile which installs dependencies
- Check Dockerfile is being detected

#### "spritesheets not found" errors
- Verify `spritesheets/` is in repository
- Check Dockerfile COPY command path
- View Railway logs to see file structure

#### Out of memory errors
- Increase memory allocation in Railway settings
- Add memory limit to Node.js: `NODE_OPTIONS=--max-old-space-size=1536`

#### Slow response times
- First request may be slow (cold start)
- Subsequent requests use cache (fast)
- Consider keeping service warm with health check pings

## Monitoring

Railway provides built-in metrics:
- **Response times**: Target <2s per generation
- **Memory usage**: Should stay <1GB typically
- **CPU usage**: Spikes during generation
- **Request count**: Track your usage

## Scaling

If you need more capacity:

1. **Vertical**: Increase memory/CPU in Railway settings
2. **Horizontal**: Add replicas (Railway Pro)
3. **Caching**: Results cached 1 hour by default
4. **CDN**: Put CloudFlare in front for extra caching

## Custom Domain (Optional)

In Railway:
1. Go to service settings
2. Click "Settings" → "Domains"
3. Add custom domain
4. Update DNS records as shown
5. Use `https://api.yourdomain.com/api/generate`

## Next Steps

After deployment:
- Test all endpoints thoroughly
- Monitor performance for a few days
- Adjust caching/rate limits as needed
- Document your API URL for Unity integration
