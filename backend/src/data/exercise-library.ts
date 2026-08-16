/**
 * Exercise Library — typed exercise templates for workout generation.
 * Used by workout.service.ts to build session content JSON.
 *
 * Minimum requirements:
 * - 6 upper body strength (3 push, 3 pull)
 * - 4 lower body strength
 * - 4 full body strength
 * - 4 Zone 2 endurance
 * - 3 interval/tempo endurance
 * - 3 HIIT
 * - 3 mobility/recovery
 *
 * Programming philosophy for strength templates (push/pull/upper/lower/full):
 * antagonist-paired supersets + autoregulated ramp sets, not a traditional
 * same-muscle-twice split. A push day pairs chest with biceps/rear-delt
 * (never triceps — triceps are already pre-fatigued as a secondary mover on
 * every chest press, so isolating them last means they never perform at
 * capacity) and a pull day pairs back with triceps/front-delt the same way.
 * The primary lift for each pairing is marked `isRamp: true` — its `reps`
 * encodes a full build-up sequence (e.g. "20, 20, 5, 4, 3") ending in a true,
 * autoregulated top set, not a flat range. Its paired accessory is marked
 * `isSuperset: true` and shares a `pairId` — performed between the ramp's
 * sets so the resting muscle group gets productive work instead of dead
 * time, then a full rest before the next ramp set. `applyGoalRepScheme`
 * (below) rewrites both fields at generation time based on the client's
 * actual primaryGoal, so a strength-emphasis goal gets a heavier top set
 * than a fat-loss or endurance-support goal.
 */

// ============================================================
// Types
// ============================================================

export interface WarmupExercise {
  exercise: string;
  duration: string;
  notes: string;
}

export interface MainExercise {
  exercise: string;
  sets: number;
  reps: string;
  rest: string;
  intensity: string;
  notes?: string;
  /**
   * This entry's `reps` encodes a full autoregulated build-up sequence
   * (comma-separated, ending in the top set) rather than a flat range.
   * `applyGoalRepScheme` rewrites `sets`/`reps`/`intensity` on these entries
   * based on the client's goal; `applyExperienceModifiers`/`scaleVolume`
   * must NOT overwrite them or the sequence breaks.
   */
  isRamp?: boolean;
  /**
   * The antagonist accessory performed between a paired ramp's sets — kept
   * deliberately light/moderate (active recovery for the resting muscle),
   * regardless of experience level. `applyGoalRepScheme` still tunes its
   * rep target by goal.
   */
  isSuperset?: boolean;
  /** Shared between an isRamp entry and its isSuperset partner. */
  pairId?: string;
}

export interface CooldownExercise {
  exercise: string;
  duration: string;
}

export interface SessionTemplate {
  id: string;
  sessionType: string;
  label: string;
  equipment: "full-gym" | "home-gym" | "minimal" | "bodyweight-only";
  warmup: WarmupExercise[];
  main: MainExercise[];
  cooldown: CooldownExercise[];
  estimatedDuration: number;
  estimatedTSS: number;
}

// ============================================================
// Experience-level volume/intensity modifiers
// ============================================================

export interface ExperienceModifiers {
  setsMultiplier: number;
  restMultiplier: number;
  intensityLabel: string;
  repRange: string;
}

export const EXPERIENCE_MODIFIERS: Record<string, ExperienceModifiers> = {
  beginner: {
    setsMultiplier: 0.75,   // 3 sets → ~3 (floor applied)
    restMultiplier: 1.5,    // longer rest
    intensityLabel: "RPE 6",
    repRange: "10-12",
  },
  intermediate: {
    setsMultiplier: 1.0,
    restMultiplier: 1.0,
    intensityLabel: "RPE 7",
    repRange: "8-10",
  },
  advanced: {
    setsMultiplier: 1.25,
    restMultiplier: 0.85,
    intensityLabel: "RPE 8",
    repRange: "6-8",
  },
  elite: {
    setsMultiplier: 1.5,
    restMultiplier: 0.75,
    intensityLabel: "RPE 8-9",
    repRange: "4-6",
  },
};

// ============================================================
// Goal-based rep scheme — tunes ramp/superset entries to what the
// client is actually training for, not a one-size-fits-all rep range.
// ============================================================

export interface GoalRepProfile {
  /** Comma-separated set-by-set reps, e.g. "20, 20, 5, 4, 3" — length = set count. */
  rampSteps: string;
  /** Replaces `intensity` on ramp entries — the autoregulation cue for the top set. */
  topSetLabel: string;
  /** Rep target for the paired antagonist accessory. */
  accessoryReps: string;
  /** One-line rationale, surfaced by the "Why These Workouts?" explainer. */
  philosophy: string;
}

export const GOAL_REP_PROFILES: Record<string, GoalRepProfile> = {
  "build-muscle": {
    rampSteps: "20, 20, 5, 4, 3",
    topSetLabel: "Build to a true top set of 3 — the first two sets should feel easy, save the tank for the last one.",
    accessoryReps: "8-10",
    philosophy:
      "Build Muscle is framed around gaining strength and size, so the ramp ends heavy — a true 3-rep top set biases the fast-twitch, max-strength motor units. The paired accessory stays moderate (8-10 reps) so it doesn't eat into your energy for the next heavy set.",
  },
  recomposition: {
    rampSteps: "20, 15, 8, 6, 5",
    topSetLabel: "Build to a strong top set of 5 — heavy and controlled, not a grind.",
    accessoryReps: "10-12",
    philosophy:
      "Recomposition blends strength and fat-loss work, so the ramp lands a bit higher than a pure strength goal (5 vs 3) — still heavy enough to build real strength, with more total training density to support the fat-loss side.",
  },
  "lose-fat": {
    rampSteps: "20, 15, 12, 10",
    topSetLabel: "Build to a strong top set of 10 — keep the pace up between sets.",
    accessoryReps: "15-20",
    philosophy:
      "Lose Fat prioritizes total work density over max load, so reps stay higher throughout the ramp and the paired accessory runs higher-rep too — more quality work in less time, without turning it into a grinding max-effort session.",
  },
  endurance: {
    rampSteps: "20, 15, 12, 12",
    topSetLabel: "Controlled top set of 12 — this session supports your cardio training, it's not a max-strength day.",
    accessoryReps: "15-20",
    philosophy:
      "Strength work here supports your endurance training rather than competing with it — reps stay high and the top set stays controlled so you're not carrying heavy soreness or fatigue into your cardio days.",
  },
  "well-rounded": {
    rampSteps: "15, 12, 8, 6",
    topSetLabel: "Build to a solid top set of 6 — heavy enough to build real strength, light enough to leave energy for the rest of your week.",
    accessoryReps: "10-12",
    philosophy:
      "Well-Rounded blends every rep range across the week, so this ramp sits in the middle — heavy enough to build real strength, light enough to leave room for the cardio and mobility work also on your schedule.",
  },
};

/**
 * Rewrites ramp/superset entries to match the client's actual goal. Must run
 * before applyExperienceModifiers so experience-level logic can see the
 * isRamp/isSuperset flags and skip them correctly.
 */
export function applyGoalRepScheme(main: MainExercise[], goal: string): MainExercise[] {
  const profile = GOAL_REP_PROFILES[goal] ?? GOAL_REP_PROFILES["well-rounded"];
  const rampStepCount = profile.rampSteps.split(",").length;

  return main.map((ex) => {
    if (ex.isRamp) {
      return { ...ex, sets: rampStepCount, reps: profile.rampSteps, intensity: profile.topSetLabel };
    }
    if (ex.isSuperset) {
      return { ...ex, reps: profile.accessoryReps };
    }
    return ex;
  });
}

// ============================================================
// Standard warmups & cooldowns
// ============================================================

const STRENGTH_WARMUP: WarmupExercise[] = [
  { exercise: "Foam Roll — Full Body", duration: "3 min", notes: "Focus on tight areas" },
  { exercise: "Band Pull-Aparts", duration: "15 reps", notes: "Shoulder activation" },
  { exercise: "Bodyweight Squats", duration: "10 reps", notes: "Hip and ankle mobility" },
  { exercise: "Cat-Cow", duration: "8 reps", notes: "Spinal mobility" },
];

const UPPER_WARMUP: WarmupExercise[] = [
  { exercise: "Arm Circles", duration: "30 sec each direction", notes: "Progressive range" },
  { exercise: "Band Pull-Aparts", duration: "15 reps", notes: "Rear delt activation" },
  { exercise: "Push-up to Downward Dog", duration: "8 reps", notes: "Upper body activation" },
  { exercise: "Scapular Push-ups", duration: "10 reps", notes: "Serratus activation" },
];

const LOWER_WARMUP: WarmupExercise[] = [
  { exercise: "Foam Roll — Quads & Glutes", duration: "2 min", notes: "Focus on tight spots" },
  { exercise: "Hip 90/90 Transitions", duration: "8 each side", notes: "Hip mobility" },
  { exercise: "Glute Bridges", duration: "12 reps", notes: "Glute activation" },
  { exercise: "Walking Lunges", duration: "8 each side", notes: "Dynamic hip stretch" },
];

const ENDURANCE_WARMUP: WarmupExercise[] = [
  { exercise: "Easy Walk/Jog", duration: "5 min", notes: "Gradually increase pace" },
  { exercise: "Leg Swings", duration: "10 each side", notes: "Front-to-back and lateral" },
  { exercise: "High Knees", duration: "30 sec", notes: "Light, controlled" },
];

const HIIT_WARMUP: WarmupExercise[] = [
  { exercise: "Jumping Jacks", duration: "1 min", notes: "Easy pace" },
  { exercise: "High Knees", duration: "30 sec", notes: "Build tempo" },
  { exercise: "Arm Circles", duration: "30 sec", notes: "Both directions" },
  { exercise: "Bodyweight Squats", duration: "10 reps", notes: "Full depth" },
  { exercise: "Inchworms", duration: "5 reps", notes: "Pause at push-up position" },
];

const STRENGTH_COOLDOWN: CooldownExercise[] = [
  { exercise: "Static Stretch — Worked Muscles", duration: "3 min" },
  { exercise: "Deep Breathing", duration: "2 min" },
];

const ENDURANCE_COOLDOWN: CooldownExercise[] = [
  { exercise: "Easy Walk", duration: "3 min" },
  { exercise: "Static Stretch — Lower Body", duration: "3 min" },
  { exercise: "Deep Breathing", duration: "2 min" },
];

const HIIT_COOLDOWN: CooldownExercise[] = [
  { exercise: "Walk It Out", duration: "2 min" },
  { exercise: "Full Body Static Stretch", duration: "4 min" },
  { exercise: "Controlled Breathing", duration: "2 min" },
];

// Shared autoregulation line, appended to a template's straight-set (non-ramp)
// main exercises where it reads naturally — no fixed weight is gospel; how the
// body actually shows up today (sleep, stress, recovery) decides the load.
const AUTOREG_NOTE = "If today's not a good day, don't force the weight — more reps, lighter load, no ego.";

// ============================================================
// CHEST + BICEPS + REAR DELT — paired push day (STRENGTH_PUSH) (3)
// ============================================================

const UPPER_PUSH_GYM: SessionTemplate[] = [
  {
    id: "chest-bi-reardelt-gym-1",
    sessionType: "STRENGTH_PUSH",
    label: "Chest, Biceps & Rear Delts — Paired Strength",
    equipment: "full-gym",
    warmup: UPPER_WARMUP,
    main: [
      {
        exercise: "Incline Dumbbell Press",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Dumbbell Curls below, then take your full rest before the next Incline Press set.",
        isRamp: true, pairId: "cb1-1",
      },
      {
        exercise: "Dumbbell Curls",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — light, this is active recovery for your chest",
        notes: "Performed between Incline Dumbbell Press sets above. Pick a weight that stays easy for all 3 rounds.",
        isSuperset: true, pairId: "cb1-1",
      },
      {
        exercise: "Flat Dumbbell Bench Press",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Band Rear Delt Flys below, then take your full rest before the next Flat Bench set.",
        isRamp: true, pairId: "cb1-2",
      },
      {
        exercise: "Band Rear Delt Flys",
        sets: 3, reps: "12-15", rest: "—",
        intensity: "RPE 5-6 — controlled, not heavy",
        notes: "Performed between Flat Dumbbell Bench Press sets above.",
        isSuperset: true, pairId: "cb1-2",
      },
      { exercise: "Pec Deck Fly", sets: 3, reps: "12-15", rest: "60s", intensity: "RPE 7", notes: `Straight sets — full stretch and squeeze. ${AUTOREG_NOTE}` },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 55,
    estimatedTSS: 70,
  },
  {
    id: "chest-bi-reardelt-gym-2",
    sessionType: "STRENGTH_PUSH",
    label: "Chest, Biceps & Rear Delts — Barbell Variation",
    equipment: "full-gym",
    warmup: UPPER_WARMUP,
    main: [
      {
        exercise: "Flat Barbell Bench Press",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Hammer Curls below, then take your full rest before the next Bench Press set.",
        isRamp: true, pairId: "cb2-1",
      },
      {
        exercise: "Hammer Curls",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — light, this is active recovery for your chest",
        notes: "Performed between Flat Barbell Bench Press sets above.",
        isSuperset: true, pairId: "cb2-1",
      },
      {
        exercise: "Seated Dumbbell Shoulder Press",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Face Pulls below, then take your full rest before the next Shoulder Press set.",
        isRamp: true, pairId: "cb2-2",
      },
      {
        exercise: "Face Pulls",
        sets: 3, reps: "15-20", rest: "—",
        intensity: "RPE 5-6 — controlled, not heavy",
        notes: "Performed between Seated Dumbbell Shoulder Press sets above.",
        isSuperset: true, pairId: "cb2-2",
      },
      { exercise: "Cable Crossover", sets: 3, reps: "12-15", rest: "60s", intensity: "RPE 7", notes: `Straight sets — finisher for chest. ${AUTOREG_NOTE}` },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 55,
    estimatedTSS: 70,
  },
  {
    id: "chest-bi-reardelt-bw-1",
    sessionType: "STRENGTH_PUSH",
    label: "Chest, Biceps & Rear Delts — Bodyweight",
    equipment: "bodyweight-only",
    warmup: UPPER_WARMUP,
    main: [
      {
        exercise: "Push-ups",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to your hardest true top set of 3-5 — elevate feet or slow the tempo to make it harder",
        notes: "Superset with the isometric bicep hold below. If you have any resistance band or light household object, use Band/Object Curls instead — true bicep isolation needs load, this is the honest bodyweight substitute.",
        isRamp: true, pairId: "cbbw-1",
      },
      {
        exercise: "Doorframe Isometric Bicep Hold",
        sets: 3, reps: "20-30 sec", rest: "—",
        intensity: "RPE 5-6 — light tension, this is active recovery for your chest",
        notes: "Pull against a doorframe with elbows bent, holding tension. Performed between Push-up sets above.",
        isSuperset: true, pairId: "cbbw-1",
      },
      {
        exercise: "Pike Push-ups",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to your hardest true top set of 3-5",
        notes: "Superset each set with Superman Y-Raises below, then take your full rest before the next Pike Push-up set.",
        isRamp: true, pairId: "cbbw-2",
      },
      {
        exercise: "Superman Y-Raise",
        sets: 3, reps: "12-15", rest: "—",
        intensity: "RPE 5-6 — controlled, not heavy",
        notes: "Performed between Pike Push-up sets above. Targets rear delts.",
        isSuperset: true, pairId: "cbbw-2",
      },
      { exercise: "Diamond Push-ups", sets: 3, reps: "10-12", rest: "60s", intensity: "RPE 7", notes: `Straight sets — chest/tricep finisher. ${AUTOREG_NOTE}` },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 45,
    estimatedTSS: 55,
  },
];

// ============================================================
// BACK + TRICEPS + FRONT/SIDE DELT — paired pull day (STRENGTH_PULL) (3)
// ============================================================

const UPPER_PULL_GYM: SessionTemplate[] = [
  {
    id: "back-tri-frontdelt-gym-1",
    sessionType: "STRENGTH_PULL",
    label: "Back, Triceps & Front/Side Delts — Paired Strength",
    equipment: "full-gym",
    warmup: UPPER_WARMUP,
    main: [
      {
        exercise: "Seated Cable Row",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Tricep Pushdowns below, then take your full rest before the next Row set.",
        isRamp: true, pairId: "bt1-1",
      },
      {
        exercise: "Tricep Pushdowns",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — light, this is active recovery for your back",
        notes: "Performed between Seated Cable Row sets above.",
        isSuperset: true, pairId: "bt1-1",
      },
      {
        exercise: "Lat Pulldown",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Lateral Raises below, then take your full rest before the next Pulldown set. This is where the pairing shifts from triceps to front/side delt.",
        isRamp: true, pairId: "bt1-2",
      },
      {
        exercise: "Lateral Raises",
        sets: 3, reps: "12-15", rest: "—",
        intensity: "RPE 5-6 — controlled, not heavy",
        notes: "Performed between Lat Pulldown sets above.",
        isSuperset: true, pairId: "bt1-2",
      },
      { exercise: "Face Pulls", sets: 3, reps: "15-20", rest: "45s", intensity: "RPE 6", notes: `Straight sets — rear delt and upper back health. ${AUTOREG_NOTE}` },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 55,
    estimatedTSS: 68,
  },
  {
    id: "back-tri-frontdelt-gym-2",
    sessionType: "STRENGTH_PULL",
    label: "Back, Triceps & Front/Side Delts — Barbell Variation",
    equipment: "full-gym",
    warmup: UPPER_WARMUP,
    main: [
      {
        exercise: "Barbell Bent-Over Row",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Overhead Tricep Extension below, then take your full rest before the next Row set.",
        isRamp: true, pairId: "bt2-1",
      },
      {
        exercise: "Overhead Tricep Extension",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — light, this is active recovery for your back",
        notes: "Performed between Barbell Bent-Over Row sets above.",
        isSuperset: true, pairId: "bt2-1",
      },
      {
        exercise: "Weighted Pull-ups",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — bodyweight only for the first sets if needed",
        notes: "Superset each set with Front Raises below, then take your full rest before the next Pull-up set.",
        isRamp: true, pairId: "bt2-2",
      },
      {
        exercise: "Front Raises",
        sets: 3, reps: "12-15", rest: "—",
        intensity: "RPE 5-6 — controlled, not heavy",
        notes: "Performed between Weighted Pull-up sets above.",
        isSuperset: true, pairId: "bt2-2",
      },
      { exercise: "Single-Arm Dumbbell Row", sets: 3, reps: "10-12 each", rest: "60s", intensity: "RPE 7", notes: `Straight sets — finisher for back. ${AUTOREG_NOTE}` },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 55,
    estimatedTSS: 70,
  },
  {
    id: "back-tri-frontdelt-bw-1",
    sessionType: "STRENGTH_PULL",
    label: "Back, Triceps & Front/Side Delts — Bodyweight",
    equipment: "bodyweight-only",
    warmup: UPPER_WARMUP,
    main: [
      {
        exercise: "Inverted Rows",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to your hardest true top set of 3-5 — adjust body angle to make it harder",
        notes: "Superset each set with Bench Dips below, then take your full rest before the next Row set.",
        isRamp: true, pairId: "btbw-1",
      },
      {
        exercise: "Bench Dips",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — light, this is active recovery for your back",
        notes: "Performed between Inverted Row sets above.",
        isSuperset: true, pairId: "btbw-1",
      },
      {
        exercise: "Chin-up Negatives",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to your hardest true top set of 3-5 — 5 sec lowering phase on the heaviest sets",
        notes: "Superset each set with Plank Shoulder Taps below, then take your full rest before the next set. This is where the pairing shifts from triceps to front/side delt.",
        isRamp: true, pairId: "btbw-2",
      },
      {
        exercise: "Plank Shoulder Taps",
        sets: 3, reps: "20 total", rest: "—",
        intensity: "RPE 5-6 — controlled, not fast",
        notes: "Performed between Chin-up Negative sets above.",
        isSuperset: true, pairId: "btbw-2",
      },
      { exercise: "Superman Hold", sets: 3, reps: "30 sec", rest: "45s", intensity: "RPE 6", notes: `Straight sets — upper back and rear delt endurance. ${AUTOREG_NOTE}` },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 45,
    estimatedTSS: 55,
  },
];

// ============================================================
// FULL UPPER — PAIRED (for STRENGTH_UPPER type) — a compressed version of
// both the push and pull pairing patterns in one session (3)
// ============================================================

const UPPER_COMBINED_GYM: SessionTemplate[] = [
  {
    id: "full-upper-paired-gym-1",
    sessionType: "STRENGTH_UPPER",
    label: "Full Upper — Paired Push & Pull",
    equipment: "full-gym",
    warmup: UPPER_WARMUP,
    main: [
      {
        exercise: "Flat Dumbbell Bench Press",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Dumbbell Curls below, then take your full rest before the next Bench set.",
        isRamp: true, pairId: "fu1-1",
      },
      {
        exercise: "Dumbbell Curls",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — light, active recovery for your chest",
        notes: "Performed between Flat Dumbbell Bench Press sets above.",
        isSuperset: true, pairId: "fu1-1",
      },
      {
        exercise: "Seated Cable Row",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Tricep Pushdowns below, then take your full rest before the next Row set.",
        isRamp: true, pairId: "fu1-2",
      },
      {
        exercise: "Tricep Pushdowns",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — light, active recovery for your back",
        notes: "Performed between Seated Cable Row sets above.",
        isSuperset: true, pairId: "fu1-2",
      },
      { exercise: "Standing Overhead Press", sets: 3, reps: "8-10", rest: "75s", intensity: "RPE 7", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Face Pulls", sets: 3, reps: "15-20", rest: "45s", intensity: "RPE 6", notes: "Straight sets — rear delt and upper back health." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 55,
    estimatedTSS: 70,
  },
  {
    id: "full-upper-paired-gym-2",
    sessionType: "STRENGTH_UPPER",
    label: "Full Upper — Paired Volume Focus",
    equipment: "full-gym",
    warmup: UPPER_WARMUP,
    main: [
      {
        exercise: "Incline Dumbbell Press",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Hammer Curls below, then take your full rest before the next Press set.",
        isRamp: true, pairId: "fu2-1",
      },
      {
        exercise: "Hammer Curls",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — light, active recovery for your chest",
        notes: "Performed between Incline Dumbbell Press sets above.",
        isSuperset: true, pairId: "fu2-1",
      },
      {
        exercise: "Lat Pulldown",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Overhead Tricep Extension below, then take your full rest before the next Pulldown set.",
        isRamp: true, pairId: "fu2-2",
      },
      {
        exercise: "Overhead Tricep Extension",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — light, active recovery for your back",
        notes: "Performed between Lat Pulldown sets above.",
        isSuperset: true, pairId: "fu2-2",
      },
      { exercise: "Lateral Raises", sets: 3, reps: "12-15", rest: "45s", intensity: "RPE 7", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Cable Flyes", sets: 3, reps: "12-15", rest: "60s", intensity: "RPE 6", notes: "Straight sets — chest finisher." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 55,
    estimatedTSS: 68,
  },
  {
    id: "full-upper-paired-bw-1",
    sessionType: "STRENGTH_UPPER",
    label: "Full Upper — Paired Bodyweight",
    equipment: "bodyweight-only",
    warmup: UPPER_WARMUP,
    main: [
      {
        exercise: "Push-ups",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to your hardest true top set of 3-5",
        notes: "Superset with the isometric bicep hold below. Use Band/Object Curls instead if you have anything with resistance.",
        isRamp: true, pairId: "fubw-1",
      },
      {
        exercise: "Doorframe Isometric Bicep Hold",
        sets: 3, reps: "20-30 sec", rest: "—",
        intensity: "RPE 5-6 — light tension, active recovery for your chest",
        notes: "Performed between Push-up sets above.",
        isSuperset: true, pairId: "fubw-1",
      },
      {
        exercise: "Inverted Rows",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to your hardest true top set of 3-5",
        notes: "Superset each set with Bench Dips below, then take your full rest before the next Row set.",
        isRamp: true, pairId: "fubw-2",
      },
      {
        exercise: "Bench Dips",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — light, active recovery for your back",
        notes: "Performed between Inverted Row sets above.",
        isSuperset: true, pairId: "fubw-2",
      },
      { exercise: "Pike Push-ups", sets: 3, reps: "8-10", rest: "75s", intensity: "RPE 7", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Superman Hold", sets: 3, reps: "30 sec", rest: "45s", intensity: "RPE 6", notes: "Straight sets — rear delt and upper back endurance." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 45,
    estimatedTSS: 55,
  },
];

// ============================================================
// LOWER BODY STRENGTH (4) — ramp + autoregulation, paired with a
// low-fatigue-cost accessory (core/calves) rather than a competing lift
// ============================================================

const LOWER_GYM: SessionTemplate[] = [
  {
    id: "lower-gym-1",
    sessionType: "STRENGTH_LOWER",
    label: "Lower Body A — Squat Emphasis",
    equipment: "full-gym",
    warmup: LOWER_WARMUP,
    main: [
      {
        exercise: "Barbell Back Squat",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Standing Calf Raises below, then take your full rest before the next Squat set.",
        isRamp: true, pairId: "lg1-1",
      },
      {
        exercise: "Standing Calf Raises",
        sets: 3, reps: "15-20", rest: "—",
        intensity: "RPE 5-6 — light, low central fatigue",
        notes: "Performed between Barbell Back Squat sets above.",
        isSuperset: true, pairId: "lg1-1",
      },
      { exercise: "Romanian Deadlift", sets: 3, reps: "8-10", rest: "90s", intensity: "RPE 7", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Walking Lunges", sets: 3, reps: "10 each", rest: "75s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Leg Press", sets: 3, reps: "10-12", rest: "75s", intensity: "RPE 7", notes: "Straight sets." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 55,
    estimatedTSS: 75,
  },
  {
    id: "lower-gym-2",
    sessionType: "STRENGTH_LOWER",
    label: "Lower Body B — Hinge Emphasis",
    equipment: "full-gym",
    warmup: LOWER_WARMUP,
    main: [
      {
        exercise: "Barbell Deadlift",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "75-100s (after the paired accessory)",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "Superset each set with Hanging Knee Raises below, then take your full rest before the next Deadlift set.",
        isRamp: true, pairId: "lg2-1",
      },
      {
        exercise: "Hanging Knee Raises",
        sets: 3, reps: "10-12", rest: "—",
        intensity: "RPE 5-6 — controlled, low central fatigue",
        notes: "Performed between Barbell Deadlift sets above.",
        isSuperset: true, pairId: "lg2-1",
      },
      { exercise: "Front Squat", sets: 3, reps: "8-10", rest: "90s", intensity: "RPE 7", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Bulgarian Split Squats", sets: 3, reps: "10 each", rest: "75s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Calf Raises", sets: 3, reps: "15-20", rest: "45s", intensity: "RPE 7", notes: "Straight sets." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 55,
    estimatedTSS: 78,
  },
  {
    id: "lower-bw-1",
    sessionType: "STRENGTH_LOWER",
    label: "Lower Body — Bodyweight A",
    equipment: "bodyweight-only",
    warmup: LOWER_WARMUP,
    main: [
      {
        exercise: "Bulgarian Split Squats",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to your hardest true top set of 3-5 each side",
        notes: "Superset each set with Plank Hold below, then take your full rest before the next set.",
        isRamp: true, pairId: "lbw1-1",
      },
      {
        exercise: "Plank Hold",
        sets: 3, reps: "30-45 sec", rest: "—",
        intensity: "RPE 5-6 — controlled, low central fatigue",
        notes: "Performed between Bulgarian Split Squat sets above.",
        isSuperset: true, pairId: "lbw1-1",
      },
      { exercise: "Pistol Squat Progressions", sets: 3, reps: "6-8 each", rest: "90s", intensity: "RPE 8", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Glute Bridges", sets: 3, reps: "15-20", rest: "60s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Single-Leg Calf Raises", sets: 3, reps: "15 each", rest: "45s", intensity: "RPE 7", notes: "Straight sets." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 45,
    estimatedTSS: 55,
  },
  {
    id: "lower-bw-2",
    sessionType: "STRENGTH_LOWER",
    label: "Lower Body — Bodyweight B",
    equipment: "bodyweight-only",
    warmup: LOWER_WARMUP,
    main: [
      {
        exercise: "Jump Squats",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s (after the paired accessory)",
        intensity: "Build to your hardest true top set of 3-5 — land soft",
        notes: "Superset each set with Single-Leg Deadlift below, then take your full rest before the next set.",
        isRamp: true, pairId: "lbw2-1",
      },
      {
        exercise: "Single-Leg Deadlift",
        sets: 3, reps: "10 each", rest: "—",
        intensity: "RPE 5-6 — controlled, low central fatigue",
        notes: "Performed between Jump Squat sets above.",
        isSuperset: true, pairId: "lbw2-1",
      },
      { exercise: "Lateral Lunges", sets: 3, reps: "10 each", rest: "60s", intensity: "RPE 7", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Wall Sit", sets: 3, reps: "45 sec", rest: "60s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Nordic Curl Negatives", sets: 3, reps: "5-6", rest: "90s", intensity: "RPE 8", notes: "Straight sets." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 45,
    estimatedTSS: 58,
  },
];

// ============================================================
// FULL BODY STRENGTH (4) — ramp on the primary compound lift,
// autoregulation on the rest
// ============================================================

const FULL_BODY_GYM: SessionTemplate[] = [
  {
    id: "full-body-gym-1",
    sessionType: "STRENGTH_FULL",
    label: "Full Body A — Compound Focus",
    equipment: "full-gym",
    warmup: STRENGTH_WARMUP,
    main: [
      {
        exercise: "Barbell Deadlift",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "90-120s",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "The heaviest lift of the session — build to a real top set, then move on.",
        isRamp: true,
      },
      { exercise: "Dumbbell Bench Press", sets: 3, reps: "8-10", rest: "90s", intensity: "RPE 7", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Barbell Squats", sets: 3, reps: "8-10", rest: "120s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Pull-ups", sets: 3, reps: "6-8", rest: "90s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Dumbbell Shoulder Press", sets: 3, reps: "10-12", rest: "60s", intensity: "RPE 7", notes: "Straight sets." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 55,
    estimatedTSS: 80,
  },
  {
    id: "full-body-gym-2",
    sessionType: "STRENGTH_FULL",
    label: "Full Body B — Functional Strength",
    equipment: "full-gym",
    warmup: STRENGTH_WARMUP,
    main: [
      {
        exercise: "Front Squat",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "90-120s",
        intensity: "Build to a true top set of 3 — first two sets should feel easy",
        notes: "The heaviest lift of the session — build to a real top set, then move on.",
        isRamp: true,
      },
      { exercise: "Barbell Rows", sets: 3, reps: "8-10", rest: "90s", intensity: "RPE 7", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Incline Dumbbell Press", sets: 3, reps: "10-12", rest: "75s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Romanian Deadlift", sets: 3, reps: "8-10", rest: "90s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Face Pulls", sets: 3, reps: "15-20", rest: "45s", intensity: "RPE 6", notes: "Straight sets." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 55,
    estimatedTSS: 75,
  },
  {
    id: "full-body-bw-1",
    sessionType: "STRENGTH_FULL",
    label: "Full Body — Bodyweight A",
    equipment: "bodyweight-only",
    warmup: STRENGTH_WARMUP,
    main: [
      {
        exercise: "Bodyweight Squats",
        sets: 5, reps: "20, 20, 5, 4, 3", rest: "60-90s",
        intensity: "Build to your hardest true top set of 3-5 — slow the tempo or add a pause to make it harder",
        notes: "The primary lift of the session — build to a real top effort, then move on.",
        isRamp: true,
      },
      { exercise: "Push-ups", sets: 3, reps: "15-20", rest: "60s", intensity: "RPE 7", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Inverted Rows", sets: 3, reps: "10-12", rest: "60s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Lunges", sets: 3, reps: "12 each", rest: "60s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Plank", sets: 3, reps: "45 sec", rest: "45s", intensity: "RPE 6", notes: "Straight sets." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 45,
    estimatedTSS: 55,
  },
  {
    id: "full-body-bw-2",
    sessionType: "STRENGTH_FULL",
    label: "Full Body — Bodyweight B",
    equipment: "bodyweight-only",
    warmup: STRENGTH_WARMUP,
    main: [
      { exercise: "Burpees", sets: 3, reps: "10", rest: "75s", intensity: "RPE 7", notes: `Straight sets. ${AUTOREG_NOTE}` },
      { exercise: "Bulgarian Split Squats", sets: 3, reps: "10 each", rest: "60s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Diamond Push-ups", sets: 3, reps: "10-12", rest: "60s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Glute Bridges", sets: 3, reps: "15-20", rest: "45s", intensity: "RPE 7", notes: "Straight sets." },
      { exercise: "Superman Hold", sets: 3, reps: "30 sec", rest: "45s", intensity: "RPE 6", notes: "Straight sets." },
      { exercise: "Mountain Climbers", sets: 3, reps: "30 sec", rest: "45s", intensity: "RPE 7", notes: "Straight sets." },
    ],
    cooldown: STRENGTH_COOLDOWN,
    estimatedDuration: 45,
    estimatedTSS: 58,
  },
];

// ============================================================
// ZONE 2 ENDURANCE (4)
// ============================================================

const ZONE2: SessionTemplate[] = [
  {
    id: "zone2-run-1",
    sessionType: "ENDURANCE_ZONE2",
    label: "Zone 2 Run — Steady State",
    equipment: "bodyweight-only",
    warmup: ENDURANCE_WARMUP,
    main: [
      { exercise: "Zone 2 Run", sets: 1, reps: "30 min", rest: "—", intensity: "Zone 2 (conversational pace)", notes: "Maintain heart rate in Zone 2. You should be able to hold a conversation." },
    ],
    cooldown: ENDURANCE_COOLDOWN,
    estimatedDuration: 45,
    estimatedTSS: 45,
  },
  {
    id: "zone2-cycle-1",
    sessionType: "ENDURANCE_ZONE2",
    label: "Zone 2 Cycle — Base Building",
    equipment: "full-gym",
    warmup: ENDURANCE_WARMUP,
    main: [
      { exercise: "Stationary Bike — Zone 2", sets: 1, reps: "35 min", rest: "—", intensity: "Zone 2 (60-70% max HR)", notes: "Steady cadence 80-90 RPM. Easy effort." },
    ],
    cooldown: ENDURANCE_COOLDOWN,
    estimatedDuration: 50,
    estimatedTSS: 50,
  },
  {
    id: "zone2-walk-incline-1",
    sessionType: "ENDURANCE_ZONE2",
    label: "Zone 2 Incline Walk",
    equipment: "full-gym",
    warmup: [
      { exercise: "Flat Walk", duration: "3 min", notes: "Easy pace warm-up" },
    ],
    main: [
      { exercise: "Incline Treadmill Walk", sets: 1, reps: "35 min", rest: "—", intensity: "Zone 2 (10-15% incline, 3.0-3.5 mph)", notes: "Keep heart rate in Zone 2. Great low-impact aerobic builder." },
    ],
    cooldown: ENDURANCE_COOLDOWN,
    estimatedDuration: 45,
    estimatedTSS: 42,
  },
  {
    id: "zone2-run-2",
    sessionType: "ENDURANCE_ZONE2",
    label: "Zone 2 Easy Aerobic Run",
    equipment: "bodyweight-only",
    warmup: ENDURANCE_WARMUP,
    main: [
      { exercise: "Easy Aerobic Run", sets: 1, reps: "35 min", rest: "—", intensity: "Zone 2 (nasal breathing pace)", notes: "If you can't breathe through your nose, slow down." },
    ],
    cooldown: ENDURANCE_COOLDOWN,
    estimatedDuration: 50,
    estimatedTSS: 48,
  },
];

// ============================================================
// INTERVAL / TEMPO ENDURANCE (3)
// ============================================================

const INTERVALS: SessionTemplate[] = [
  {
    id: "interval-run-1",
    sessionType: "ENDURANCE_INTERVALS",
    label: "Run Intervals — 4x4 Protocol",
    equipment: "bodyweight-only",
    warmup: ENDURANCE_WARMUP,
    main: [
      { exercise: "4 min Hard Run", sets: 4, reps: "4 min", rest: "3 min jog", intensity: "Zone 4 (85-90% max HR)", notes: "Recovery jog between intervals — don't stop completely." },
    ],
    cooldown: ENDURANCE_COOLDOWN,
    estimatedDuration: 45,
    estimatedTSS: 65,
  },
  {
    id: "tempo-run-1",
    sessionType: "ENDURANCE_TEMPO",
    label: "Tempo Run — Sustained Effort",
    equipment: "bodyweight-only",
    warmup: ENDURANCE_WARMUP,
    main: [
      { exercise: "Tempo Run", sets: 1, reps: "25 min", rest: "—", intensity: "Zone 3 (comfortably hard)", notes: "Hold a steady pace you could maintain for about 45-60 min max. Breathing controlled but deliberate." },
    ],
    cooldown: ENDURANCE_COOLDOWN,
    estimatedDuration: 40,
    estimatedTSS: 55,
  },
  {
    id: "interval-cycle-1",
    sessionType: "ENDURANCE_INTERVALS",
    label: "Bike Intervals — Tabata Style",
    equipment: "full-gym",
    warmup: [
      { exercise: "Easy Spin", duration: "5 min", notes: "Light resistance, build cadence" },
    ],
    main: [
      { exercise: "Bike Sprint Intervals", sets: 8, reps: "30 sec all-out", rest: "30 sec easy spin", intensity: "Zone 5 (90-95% max HR)", notes: "Maximum effort sprints. Full recovery not expected between sets." },
      { exercise: "Moderate Steady Ride", sets: 1, reps: "10 min", rest: "—", intensity: "Zone 3", notes: "Bring heart rate down gradually." },
    ],
    cooldown: ENDURANCE_COOLDOWN,
    estimatedDuration: 35,
    estimatedTSS: 60,
  },
];

// ============================================================
// HIIT (3)
// ============================================================

const HIIT_TEMPLATES: SessionTemplate[] = [
  {
    id: "hiit-gym-1",
    sessionType: "HIIT",
    label: "HIIT Circuit A — Full Gym",
    equipment: "full-gym",
    warmup: HIIT_WARMUP,
    main: [
      { exercise: "Kettlebell Swings", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 8" },
      { exercise: "Box Jumps", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 8" },
      { exercise: "Battle Ropes", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 8" },
      { exercise: "Dumbbell Thrusters", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 8" },
      { exercise: "Rowing Sprints", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 8" },
    ],
    cooldown: HIIT_COOLDOWN,
    estimatedDuration: 35,
    estimatedTSS: 70,
  },
  {
    id: "hiit-bw-1",
    sessionType: "HIIT",
    label: "HIIT Circuit — Bodyweight",
    equipment: "bodyweight-only",
    warmup: HIIT_WARMUP,
    main: [
      { exercise: "Burpees", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 8" },
      { exercise: "Mountain Climbers", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 8" },
      { exercise: "Jump Squats", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 8" },
      { exercise: "Push-ups", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 7" },
      { exercise: "High Knees", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 8" },
    ],
    cooldown: HIIT_COOLDOWN,
    estimatedDuration: 30,
    estimatedTSS: 65,
  },
  {
    id: "hiit-gym-2",
    sessionType: "HIIT",
    label: "HIIT Circuit B — Metabolic",
    equipment: "full-gym",
    warmup: HIIT_WARMUP,
    main: [
      { exercise: "Sled Push", sets: 4, reps: "30 sec", rest: "30s", intensity: "RPE 8" },
      { exercise: "Medicine Ball Slams", sets: 4, reps: "30 sec", rest: "30s", intensity: "RPE 8" },
      { exercise: "Assault Bike Sprint", sets: 4, reps: "30 sec", rest: "30s", intensity: "RPE 9" },
      { exercise: "Farmer's Carry", sets: 4, reps: "40 sec", rest: "20s", intensity: "RPE 7" },
      { exercise: "Plank to Push-up", sets: 4, reps: "30 sec", rest: "30s", intensity: "RPE 7" },
    ],
    cooldown: HIIT_COOLDOWN,
    estimatedDuration: 35,
    estimatedTSS: 72,
  },
];

// ============================================================
// MOBILITY / RECOVERY (3)
// ============================================================

const MOBILITY: SessionTemplate[] = [
  {
    id: "mobility-1",
    sessionType: "MOBILITY_RECOVERY",
    label: "Mobility Flow A — Full Body",
    equipment: "bodyweight-only",
    warmup: [
      { exercise: "Easy Walk", duration: "3 min", notes: "Get blood flowing" },
    ],
    main: [
      { exercise: "Foam Roll — Full Body", sets: 1, reps: "8 min", rest: "—", intensity: "Low", notes: "Spend extra time on tight areas" },
      { exercise: "Hip 90/90 Stretch", sets: 2, reps: "45 sec each side", rest: "—", intensity: "Low" },
      { exercise: "Cat-Cow", sets: 2, reps: "10 reps", rest: "—", intensity: "Low" },
      { exercise: "World's Greatest Stretch", sets: 2, reps: "5 each side", rest: "—", intensity: "Low" },
      { exercise: "Deep Squat Hold", sets: 3, reps: "30 sec", rest: "—", intensity: "Low" },
      { exercise: "Dead Hang", sets: 3, reps: "20-30 sec", rest: "—", intensity: "Low" },
    ],
    cooldown: [
      { exercise: "Supine Spinal Twist", duration: "2 min" },
      { exercise: "Diaphragmatic Breathing", duration: "3 min" },
    ],
    estimatedDuration: 30,
    estimatedTSS: 15,
  },
  {
    id: "mobility-2",
    sessionType: "ACTIVE_RECOVERY",
    label: "Active Recovery — Light Movement",
    equipment: "bodyweight-only",
    warmup: [
      { exercise: "Easy Walk", duration: "5 min", notes: "Relaxed pace" },
    ],
    main: [
      { exercise: "Walking", sets: 1, reps: "15 min", rest: "—", intensity: "Very Low", notes: "Conversational pace, outdoors if possible" },
      { exercise: "Foam Roll — Lower Body", sets: 1, reps: "5 min", rest: "—", intensity: "Low" },
      { exercise: "Pigeon Stretch", sets: 2, reps: "45 sec each side", rest: "—", intensity: "Low" },
      { exercise: "Child's Pose", sets: 2, reps: "30 sec", rest: "—", intensity: "Low" },
    ],
    cooldown: [
      { exercise: "Box Breathing", duration: "3 min" },
    ],
    estimatedDuration: 30,
    estimatedTSS: 10,
  },
  {
    id: "mobility-3",
    sessionType: "MOBILITY_RECOVERY",
    label: "Mobility Flow B — Lower Body Focus",
    equipment: "bodyweight-only",
    warmup: [
      { exercise: "Easy Walk", duration: "3 min", notes: "Get blood flowing" },
    ],
    main: [
      { exercise: "Foam Roll — Quads, Hamstrings, Glutes", sets: 1, reps: "8 min", rest: "—", intensity: "Low" },
      { exercise: "Couch Stretch", sets: 2, reps: "45 sec each side", rest: "—", intensity: "Low" },
      { exercise: "Banded Hip Distraction", sets: 2, reps: "30 sec each side", rest: "—", intensity: "Low" },
      { exercise: "Cossack Squats", sets: 2, reps: "8 each side", rest: "—", intensity: "Low" },
      { exercise: "Ankle Mobility Circles", sets: 2, reps: "10 each direction", rest: "—", intensity: "Low" },
      { exercise: "Standing Hamstring Stretch", sets: 2, reps: "30 sec each side", rest: "—", intensity: "Low" },
    ],
    cooldown: [
      { exercise: "Supine Figure-4 Stretch", duration: "2 min" },
      { exercise: "Diaphragmatic Breathing", duration: "3 min" },
    ],
    estimatedDuration: 30,
    estimatedTSS: 12,
  },
];

// ============================================================
// ALL TEMPLATES — flat array for easy querying
// ============================================================

export const ALL_TEMPLATES: SessionTemplate[] = [
  ...UPPER_PUSH_GYM,
  ...UPPER_PULL_GYM,
  ...UPPER_COMBINED_GYM,
  ...LOWER_GYM,
  ...FULL_BODY_GYM,
  ...ZONE2,
  ...INTERVALS,
  ...HIIT_TEMPLATES,
  ...MOBILITY,
];

// ============================================================
// Lookup helpers
// ============================================================

/**
 * Get templates matching a session type and equipment level.
 * Equipment fallback: bodyweight-only templates work for all levels.
 */
export function getTemplatesForType(
  sessionType: string,
  equipment: string
): SessionTemplate[] {
  return ALL_TEMPLATES.filter((t) => {
    if (t.sessionType !== sessionType) return false;
    const eq = t.equipment as string;
    // bodyweight-only templates are universal
    if (eq === "bodyweight-only") return true;
    // full-gym templates work for full-gym and home-gym
    if (equipment === "full-gym") return true;
    if (equipment === "home-gym") return true;
    // minimal/bodyweight users get bodyweight templates only
    if (equipment === "minimal" || equipment === "bodyweight-only") {
      return eq === "bodyweight-only" || eq === "minimal";
    }
    return true;
  });
}

/**
 * Pick a template for the given session type and equipment, avoiding recent IDs.
 */
export function pickTemplate(
  sessionType: string,
  equipment: string,
  avoidIds: string[] = []
): SessionTemplate | null {
  const candidates = getTemplatesForType(sessionType, equipment);
  // Prefer templates not recently used
  const fresh = candidates.filter((t) => !avoidIds.includes(t.id));
  if (fresh.length > 0) {
    return fresh[Math.floor(Math.random() * fresh.length)];
  }
  // Fallback: any matching template
  if (candidates.length > 0) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  return null;
}

/**
 * Apply experience-level modifiers to a template's main exercises.
 * Returns a new array of exercises with adjusted sets/reps/rest/intensity.
 */
export function applyExperienceModifiers(
  main: MainExercise[],
  experienceLevel: string
): MainExercise[] {
  const mods = EXPERIENCE_MODIFIERS[experienceLevel] ?? EXPERIENCE_MODIFIERS["intermediate"];

  return main.map((ex) => {
    if (ex.isRamp || ex.isSuperset) {
      // Ramp sequences and their paired accessory reps are set by
      // applyGoalRepScheme based on the client's actual goal — a flat
      // experience-level rep range would overwrite that goal-specific
      // structure. Their `rest` strings are descriptive ("60-90s (after the
      // paired accessory)"), not a bare number, so adjustRest's leading-digit
      // regex would silently truncate the explanation — leave rest as authored.
      return ex;
    }
    return {
      ...ex,
      sets: Math.max(2, Math.round(ex.sets * mods.setsMultiplier)),
      reps: mods.repRange !== "8-10" ? mods.repRange : ex.reps,
      rest: adjustRest(ex.rest, mods.restMultiplier),
      intensity: mods.intensityLabel,
    };
  });
}

/**
 * Scale volume (sets) by a multiplier, applied to main exercises.
 */
export function scaleVolume(
  main: MainExercise[],
  multiplier: number
): MainExercise[] {
  return main.map((ex) => {
    if (ex.isRamp) {
      // A ramp's set count is the number of prescribed build-up steps, not a
      // generic volume dial -- multiplying it would corrupt the sequence.
      // The ramp's own autoregulation framing already absorbs a bad day.
      return ex;
    }
    return { ...ex, sets: Math.max(1, Math.round(ex.sets * multiplier)) };
  });
}

function adjustRest(rest: string, multiplier: number): string {
  const match = rest.match(/^(\d+)/);
  if (!match) return rest;
  const seconds = Math.round(parseInt(match[1], 10) * multiplier);
  return `${seconds}s`;
}
