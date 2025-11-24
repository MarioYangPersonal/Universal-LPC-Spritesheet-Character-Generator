const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const { generateSpritesheet, generateSpritesheets } = require('./src/renderer');
const { getCachedSpritesheet, saveCachedSpritesheet, getCacheStats } = require('./src/cache');
const adminRouter = require('./src/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Cache for generated spritesheets (1 hour TTL)
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// Rate limiting (100 requests per 15 minutes per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Mount admin router
app.use('/api/admin', adminRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint with API info
app.get('/', (req, res) => {
  res.json({
    name: 'LPC Spritesheet Generator API',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      generate: 'POST /api/generate',
      generateBatch: 'POST /api/generate-batch'
    },
    documentation: 'https://github.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator'
  });
});

/**
 * POST /api/generate
 * Generate a single spritesheet
 *
 * Body: {
 *   bodyTypeName: "male",
 *   layers: [
 *     { fileName: "body/bodies/male/fur_grey.png", zPos: 10, variant: "fur_grey" },
 *     ...
 *   ]
 * }
 *
 * Returns: PNG image
 */
app.post('/api/generate', async (req, res) => {
  const startTime = Date.now();

  try {
    const { bodyTypeName, layers } = req.body;

    // Validation
    if (!bodyTypeName || !layers || !Array.isArray(layers)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request must include bodyTypeName (string) and layers (array)'
      });
    }

    if (layers.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'layers array cannot be empty'
      });
    }

    // Validate each layer
    for (const layer of layers) {
      if (!layer.fileName || typeof layer.zPos !== 'number') {
        return res.status(400).json({
          error: 'Invalid layer',
          message: 'Each layer must have fileName (string) and zPos (number)'
        });
      }
    }

    // Check disk cache first (persistent, pre-generated)
    const diskCached = await getCachedSpritesheet(bodyTypeName, layers);

    if (diskCached.hit) {
      console.log(`[Disk Cache Hit] ${bodyTypeName} - ${layers.length} layers - ${diskCached.hash}`);
      res.set({
        'Content-Type': 'image/png',
        'X-Cache': 'DISK-HIT',
        'X-Cache-Key': diskCached.hash,
        'X-Render-Time': '0ms'
      });
      return res.send(diskCached.buffer);
    }

    // Check memory cache (recent generations)
    const cacheKey = JSON.stringify({ bodyTypeName, layers });
    const memoryCached = cache.get(cacheKey);

    if (memoryCached) {
      console.log(`[Memory Cache Hit] ${bodyTypeName} - ${layers.length} layers`);
      res.set({
        'Content-Type': 'image/png',
        'X-Cache': 'MEMORY-HIT',
        'X-Render-Time': '0ms'
      });
      return res.send(memoryCached);
    }

    // Generate spritesheet (not in any cache)
    const canvas = await generateSpritesheet({ bodyTypeName, layers });
    const buffer = canvas.toBuffer('image/png');

    // Cache in memory for 1 hour
    cache.set(cacheKey, buffer);

    // Optionally save to disk cache for persistence
    // Uncomment if you want all generated sprites cached to disk:
    // await saveCachedSpritesheet(bodyTypeName, layers, buffer);

    const renderTime = Date.now() - startTime;

    console.log(`[Generated] ${bodyTypeName} - ${layers.length} layers - ${renderTime}ms - ${buffer.length} bytes`);

    res.set({
      'Content-Type': 'image/png',
      'Content-Length': buffer.length,
      'X-Cache': 'MISS',
      'X-Render-Time': `${renderTime}ms`
    });

    res.send(buffer);

  } catch (error) {
    console.error('Error generating spritesheet:', error);
    res.status(500).json({
      error: 'Generation failed',
      message: error.message
    });
  }
});

/**
 * POST /api/generate-batch
 * Generate multiple spritesheets (for different body types)
 *
 * Body: [
 *   { bodyTypeName: "male", layers: [...] },
 *   { bodyTypeName: "female", layers: [...] }
 * ]
 *
 * Returns: JSON with base64-encoded PNGs
 */
app.post('/api/generate-batch', async (req, res) => {
  const batchStartTime = Date.now();

  try {
    const definitions = req.body;

    if (!Array.isArray(definitions) || definitions.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request body must be a non-empty array of layer definitions'
      });
    }

    const maxBatchSize = parseInt(process.env.MAX_BATCH_SIZE || '200', 10);
    if (definitions.length > maxBatchSize) {
      return res.status(400).json({
        error: 'Too many requests',
        message: `Maximum ${maxBatchSize} spritesheets per batch request`
      });
    }

    // Process each definition and check cache
    const results = [];
    let diskHits = 0;
    let memoryHits = 0;
    let generated = 0;

    for (const def of definitions) {
      const { bodyTypeName, layers } = def;
      const itemStartTime = Date.now();

      try {
        // Check disk cache first
        const diskCached = await getCachedSpritesheet(bodyTypeName, layers);

        if (diskCached.hit) {
          // Disk cache hit!
          diskHits++;
          const renderTime = Date.now() - itemStartTime;

          results.push({
            bodyTypeName,
            success: true,
            cacheStatus: 'DISK-HIT',
            cacheKey: diskCached.hash,
            renderTime: `${renderTime}ms`,
            data: diskCached.buffer.toString('base64'),
            size: diskCached.buffer.length
          });

          console.log(`[Batch DISK-HIT] ${bodyTypeName} - ${diskCached.hash} - ${renderTime}ms`);
          continue;
        }

        // Check memory cache
        const cacheKey = JSON.stringify({ bodyTypeName, layers });
        const memoryCached = cache.get(cacheKey);

        if (memoryCached) {
          // Memory cache hit!
          memoryHits++;
          const renderTime = Date.now() - itemStartTime;

          results.push({
            bodyTypeName,
            success: true,
            cacheStatus: 'MEMORY-HIT',
            renderTime: `${renderTime}ms`,
            data: memoryCached.toString('base64'),
            size: memoryCached.length
          });

          console.log(`[Batch MEMORY-HIT] ${bodyTypeName} - ${renderTime}ms`);
          continue;
        }

        // Not in cache - generate
        const canvas = await generateSpritesheet({ bodyTypeName, layers });
        const buffer = canvas.toBuffer('image/png');

        // Cache in memory for future requests
        cache.set(cacheKey, buffer);

        generated++;
        const renderTime = Date.now() - itemStartTime;

        results.push({
          bodyTypeName,
          success: true,
          cacheStatus: 'GENERATED',
          renderTime: `${renderTime}ms`,
          data: buffer.toString('base64'),
          size: buffer.length
        });

        console.log(`[Batch GENERATED] ${bodyTypeName} - ${renderTime}ms - ${buffer.length} bytes`);

      } catch (error) {
        results.push({
          bodyTypeName,
          success: false,
          cacheStatus: 'ERROR',
          error: error.message
        });
        console.error(`[Batch ERROR] ${bodyTypeName} - ${error.message}`);
      }
    }

    const totalTime = Date.now() - batchStartTime;

    console.log(`[Batch Complete] Total: ${results.length}, Disk: ${diskHits}, Memory: ${memoryHits}, Generated: ${generated} - ${totalTime}ms`);

    res.json({
      results,
      summary: {
        total: results.length,
        diskHits,
        memoryHits,
        generated,
        totalTime: `${totalTime}ms`
      }
    });

  } catch (error) {
    console.error('Error in batch generation:', error);
    res.status(500).json({
      error: 'Batch generation failed',
      message: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 LPC Generator API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
});
