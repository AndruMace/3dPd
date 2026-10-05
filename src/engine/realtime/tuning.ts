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

  // ---- Sprint ----
  /** Speed multiplier while sprinting. */
  SPRINT_SPEED: 1.6,
  /** Extra hunger while sprinting, in PD hunger points per second (normal drain is 1 per turn = 2/s). */
  SPRINT_HUNGER: 1,

  // ---- Combat ----
  /** How far (centre to centre) a melee blow reaches, in cells (about 1.3 m). */
  MELEE_REACH: 0.44,
  /** A blow still lands if the target has moved at most this much further away during the wind-up. */
  REACH_SLACK: 0.2,
  /** Hero swing: time from the start of the swing to the blow landing. */
  HERO_WINDUP: 0.12,
  /** Hero speed multiplier while swinging. */
  SWING_SLOWDOWN: 0.35,
  /** Auto-target: nearest enemy within this many cells, preferring those in front of the hero. */
  AUTO_TARGET_RANGE: 3.2,
  /** Freeze on a solid hit (seconds). */
  HITSTOP: 0.06,
  /** Knockback on a hit, in cells per second of initial push (decays quickly). */
  KNOCKBACK: 1.6,

  // ---- Mobs ----
  /** Mob walking speed at PD speed 1 (a bit slower than the hero, so you can break away). */
  MOB_SPEED: 1.45,
  /** How much of a mob's PD speed bonus carries over (crabs, speed 2, aren't twice as fast). */
  MOB_SPEED_BONUS: 0.5,
  /** Default wind-up before a mob's blow lands: the telegraph you can step out of. */
  MOB_WINDUP: 0.4,
  /** Per-mob wind-ups (class names). */
  WINDUPS: { Rat: 0.32, Albino: 0.32, Gnoll: 0.42, Crab: 0.5, FetidRat: 0.4 } as Record<string, number>,
  /** How often a mob reconsiders its path (seconds). */
  THINK: 0.2,
};
