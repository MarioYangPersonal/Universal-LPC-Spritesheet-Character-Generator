// Animation positions on the spritesheet
const FRAME_SIZE = 64;

const ANIMATION_OFFSETS = {
  spellcast: 0,
  thrust: 4 * FRAME_SIZE,
  walk: 8 * FRAME_SIZE,
  slash: 12 * FRAME_SIZE,
  shoot: 16 * FRAME_SIZE,
  hurt: 20 * FRAME_SIZE,
  climb: 21 * FRAME_SIZE,
  idle: 22 * FRAME_SIZE,
  jump: 26 * FRAME_SIZE,
  sit: 30 * FRAME_SIZE,
  emote: 34 * FRAME_SIZE,
  run: 38 * FRAME_SIZE,
  combat_idle: 42 * FRAME_SIZE,
  backslash: 46 * FRAME_SIZE,
  halfslash: 50 * FRAME_SIZE
};

const SHEET_WIDTH = 832;  // 13 frames * 64px
const SHEET_HEIGHT = 3456; // 54 rows * 64px

module.exports = {
  FRAME_SIZE,
  ANIMATION_OFFSETS,
  SHEET_WIDTH,
  SHEET_HEIGHT
};
