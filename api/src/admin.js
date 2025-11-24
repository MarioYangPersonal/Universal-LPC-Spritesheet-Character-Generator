const express = require('express');
const router = express.Router();
const {
  getCachedSpritesheet,
  saveCachedSpritesheet,
  getCacheStats,
  listCachedSpritesheets,
  clearCache,
  deleteCachedSpritesheet
} = require('./cache');
const { generateSpritesheet } = require('./renderer');

/**
 * Authentication middleware for admin routes
 */
function adminAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!process.env.ADMIN_API_KEY) {
    return res.status(500).json({
      error: 'Admin API key not configured on server'
    });
  }

  if (apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
  }

  next();
}

// Apply auth to all admin routes
router.use(adminAuth);

/**
 * GET /api/admin/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = await getCacheStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get cache stats',
      message: error.message
    });
  }
});

/**
 * GET /api/admin/cache/list
 * List all cached spritesheets
 */
router.get('/cache/list', async (req, res) => {
  try {
    const files = await listCachedSpritesheets();
    res.json({
      success: true,
      count: files.length,
      files
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to list cache',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/cache/generate
 * Pre-generate and cache spritesheets
 *
 * Body: [
 *   { bodyTypeName: "male", layers: [...] },
 *   { bodyTypeName: "female", layers: [...] }
 * ]
 */
router.post('/cache/generate', async (req, res) => {
  try {
    const definitions = req.body;

    if (!Array.isArray(definitions)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Body must be an array of character definitions'
      });
    }

    const results = [];
    let generated = 0;
    let alreadyCached = 0;
    let failed = 0;

    for (const def of definitions) {
      const { bodyTypeName, layers } = def;

      try {
        // Check if already cached
        const cached = await getCachedSpritesheet(bodyTypeName, layers);

        if (cached.hit) {
          alreadyCached++;
          results.push({
            bodyTypeName,
            status: 'already_cached',
            hash: cached.hash
          });
          continue;
        }

        // Generate spritesheet
        const canvas = await generateSpritesheet({ bodyTypeName, layers });
        const buffer = canvas.toBuffer('image/png');

        // Save to disk cache
        const hash = await saveCachedSpritesheet(bodyTypeName, layers, buffer);

        generated++;
        results.push({
          bodyTypeName,
          status: 'generated',
          hash,
          size: buffer.length
        });

        console.log(`[Pre-cached] ${bodyTypeName} - ${hash}`);

      } catch (error) {
        failed++;
        results.push({
          bodyTypeName,
          status: 'failed',
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      summary: {
        total: definitions.length,
        generated,
        alreadyCached,
        failed
      },
      results
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to pre-generate cache',
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/cache/clear
 * Clear entire cache
 */
router.delete('/cache/clear', async (req, res) => {
  try {
    const result = await clearCache();
    res.json({
      success: true,
      message: 'Cache cleared successfully',
      ...result
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

/**
 * DELETE /api/admin/cache/:hash
 * Delete specific cached spritesheet
 */
router.delete('/cache/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const result = await deleteCachedSpritesheet(hash);

    if (result.success) {
      res.json({
        success: true,
        message: `Deleted cached spritesheet: ${hash}`
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Not found',
        message: result.message
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete cached spritesheet',
      message: error.message
    });
  }
});

/**
 * POST /api/admin/cache/warmup
 * Warm up cache by requesting all cached spritesheets
 * (Useful after cold start to load into memory)
 */
router.post('/cache/warmup', async (req, res) => {
  try {
    const files = await listCachedSpritesheets();
    res.json({
      success: true,
      message: `Warmed up ${files.length} cached spritesheets`,
      count: files.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to warm up cache',
      message: error.message
    });
  }
});

module.exports = router;
