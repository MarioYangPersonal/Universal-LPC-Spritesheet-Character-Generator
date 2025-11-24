const { createCanvas, loadImage } = require('canvas');
const path = require('path');
const { ANIMATION_OFFSETS, SHEET_WIDTH, SHEET_HEIGHT } = require('./constants');

/**
 * Generate spritesheet from layer definition
 * @param {Object} layerDefinition - { bodyTypeName, layers: [{fileName, zPos, variant}] }
 * @returns {Canvas} Canvas with rendered spritesheet
 */
async function generateSpritesheet(layerDefinition) {
  const { bodyTypeName, layers } = layerDefinition;

  if (!bodyTypeName || !layers || !Array.isArray(layers)) {
    throw new Error('Invalid layer definition: missing bodyTypeName or layers array');
  }

  // Create canvas
  const canvas = createCanvas(SHEET_WIDTH, SHEET_HEIGHT);
  const ctx = canvas.getContext('2d');

  // Clear canvas with transparent background
  ctx.clearRect(0, 0, SHEET_WIDTH, SHEET_HEIGHT);

  // Sort layers by zPos (lower = drawn first/behind)
  const sortedLayers = [...layers].sort((a, b) => a.zPos - b.zPos);

  // For each animation row, draw all layers
  for (const [animName, yPos] of Object.entries(ANIMATION_OFFSETS)) {
    for (const layer of sortedLayers) {
      try {
        // Build the full path to the sprite image
        // Input: "body/bodies/male/fur_grey.png"
        // Output: "/spritesheets/body/bodies/male/walk/fur_grey.png"

        const pathParts = layer.fileName.split('/');
        const filename = pathParts.pop(); // e.g., "fur_grey.png"
        const basePath = pathParts.join('/'); // e.g., "body/bodies/male"

        // Full path: basePath + animName + filename
        const spritePath = path.join(
          __dirname,
          '..',
          'spritesheets',
          basePath,
          animName,
          filename
        );

        // Load and draw the image
        const img = await loadImage(spritePath);
        ctx.drawImage(img, 0, yPos);

      } catch (err) {
        // Animation not available for this layer - skip silently
        // This is normal (not all items have all animations)
        if (process.env.NODE_ENV !== 'production') {
          console.log(`Skipping ${layer.fileName} for ${animName} (not found)`);
        }
      }
    }
  }

  return canvas;
}

/**
 * Generate multiple spritesheets (batch processing)
 * @param {Array} definitions - Array of layer definitions
 * @returns {Array} Array of { bodyTypeName, canvas }
 */
async function generateSpritesheets(definitions) {
  const results = [];

  for (const def of definitions) {
    try {
      const canvas = await generateSpritesheet(def);
      results.push({
        bodyTypeName: def.bodyTypeName,
        canvas,
        success: true
      });
    } catch (error) {
      results.push({
        bodyTypeName: def.bodyTypeName,
        error: error.message,
        success: false
      });
    }
  }

  return results;
}

module.exports = {
  generateSpritesheet,
  generateSpritesheets
};
