// Every number that sets the feel of action mode, in one place. Distances are in cells (one cell is
// CELL_METRES in the world), times in seconds, speeds in cells per second.
export const Tuning = {
  /** Seconds per PD turn: buffs, blobs, hunger and regeneration tick on this clock. */
  TURN: 0.5,
  /** Fixed simulation step. */
  STEP: 1 / 30,
  /** How big a cell is in the world; the view scales characters and props to match. */
  CELL_METRES: 3,

  /** Hero running speed at PD speed 1 (about 4.8 m/s). */
  HERO_SPEED: 1.6,
  /** How quickly velocity follows the stick (1/s): higher is snappier. */
  HERO_ACCEL: 14,
  /** Collision radius of characters (about 0.36 m). */
  BODY_RADIUS: 0.12,

  /** A door opens when a body's centre comes this close to the door cell's centre, and closes when none is. */
  DOOR_OPEN_RADIUS: 0.85,
  /** Distance travelled between footstep sounds. */
  FOOTSTEP_EVERY: 0.55,
};
