const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

/**
 * Generate a consistent hash from layer definition
 * This ensures the same character always gets the same cache key
 */
function generateCacheKey(bodyTypeName, layers) {
  // Sort layers by fileName to ensure consistent ordering
  const sortedLayers = [...layers].sort((a, b) =>
    a.fileName.localeCompare(b.fileName)
  );

  const cacheData = {
    bodyTypeName,
    layers: sortedLayers.map(l => ({
      fileName: l.fileName,
      zPos: l.zPos,
      variant: l.variant
    }))
  };

  const json = JSON.stringify(cacheData);
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  return hash;
}

/**
 * Get path to cached file on disk
 */
function getCachePath(hash) {
  return path.join(__dirname, '..', 'cache', `${hash}.png`);
}

/**
 * Check if spritesheet exists in disk cache
 */
async function getCachedSpritesheet(bodyTypeName, layers) {
  try {
    const hash = generateCacheKey(bodyTypeName, layers);
    const cachePath = getCachePath(hash);

    const buffer = await fs.readFile(cachePath);
    return { buffer, hash, hit: true };
  } catch (err) {
    return { buffer: null, hash: null, hit: false };
  }
}

/**
 * Save spritesheet to disk cache
 */
async function saveCachedSpritesheet(bodyTypeName, layers, buffer) {
  try {
    const hash = generateCacheKey(bodyTypeName, layers);
    const cachePath = getCachePath(hash);

    // Ensure cache directory exists
    await fs.mkdir(path.dirname(cachePath), { recursive: true });

    await fs.writeFile(cachePath, buffer);
    return hash;
  } catch (err) {
    console.error('Failed to save to cache:', err);
    return null;
  }
}

/**
 * List all cached spritesheets
 */
async function listCachedSpritesheets() {
  try {
    const cacheDir = path.join(__dirname, '..', 'cache');
    const files = await fs.readdir(cacheDir);
    return files.filter(f => f.endsWith('.png'));
  } catch (err) {
    return [];
  }
}

/**
 * Get cache statistics
 */
async function getCacheStats() {
  try {
    const cacheDir = path.join(__dirname, '..', 'cache');
    const files = await fs.readdir(cacheDir);
    const pngFiles = files.filter(f => f.endsWith('.png'));

    let totalSize = 0;
    for (const file of pngFiles) {
      const stats = await fs.stat(path.join(cacheDir, file));
      totalSize += stats.size;
    }

    return {
      count: pngFiles.length,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
    };
  } catch (err) {
    return { count: 0, totalSize: 0, totalSizeMB: 0 };
  }
}

/**
 * Clear entire cache directory
 */
async function clearCache() {
  try {
    const cacheDir = path.join(__dirname, '..', 'cache');
    const files = await fs.readdir(cacheDir);
    const pngFiles = files.filter(f => f.endsWith('.png'));

    for (const file of pngFiles) {
      await fs.unlink(path.join(cacheDir, file));
    }

    return {
      success: true,
      deletedCount: pngFiles.length
    };
  } catch (err) {
    console.error('Failed to clear cache:', err);
    return {
      success: false,
      deletedCount: 0,
      error: err.message
    };
  }
}

/**
 * Delete a specific cached spritesheet by hash
 */
async function deleteCachedSpritesheet(hash) {
  try {
    const cachePath = getCachePath(hash);
    await fs.unlink(cachePath);
    return {
      success: true,
      message: `Deleted ${hash}.png`
    };
  } catch (err) {
    return {
      success: false,
      message: err.code === 'ENOENT' ? 'File not found' : err.message
    };
  }
}

module.exports = {
  generateCacheKey,
  getCachedSpritesheet,
  saveCachedSpritesheet,
  listCachedSpritesheets,
  getCacheStats,
  clearCache,
  deleteCachedSpritesheet
};
