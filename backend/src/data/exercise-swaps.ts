/**
 * Exercise Swap Groups — bounded self-edit for Private Coaching clients.
 *
 * Each group is a movement pattern. A client can only swap an exercise for
 * another member of the *same* group — same pattern, sets/reps/rest/intensity
 * untouched — so a swap can never turn into a different training stimulus or
 * an unapproved volume change. Exercises not listed here (most warmup/cooldown
 * items, and anything without a safe like-for-like substitute) simply have no
 * swap options, which the frontend treats as "no Swap button" rather than an
 * error.
 */

export type EquipmentTier = "bodyweight-only" | "minimal" | "home-gym" | "full-gym";

const EQUIPMENT_RANK: Record<EquipmentTier, number> = {
  "bodyweight-only": 0,
  minimal: 1,
  "home-gym": 2,
  "full-gym": 3,
};

// Injury-area keywords an alternative must avoid stressing. Matched against a
// lowercased blob of the athlete's injuryHistory, specificInjuries areas, and
// riskFlags — a best-effort net on top of the primary safeguard, which is that
// every option in a group is already a same-pattern, same-loading substitute.
type BodyArea = "knee" | "shoulder" | "lower-back" | "wrist" | "elbow" | "hip" | "hamstring";

interface SwapMember {
  exercise: string;
  tier: EquipmentTier;
  avoid: BodyArea[];
}

const GROUPS: SwapMember[][] = [
  // Horizontal push
  [
    { exercise: "Barbell Bench Press", tier: "full-gym", avoid: ["shoulder"] },
    { exercise: "Incline Dumbbell Press", tier: "home-gym", avoid: ["shoulder"] },
    { exercise: "Dumbbell Bench Press", tier: "home-gym", avoid: ["shoulder"] },
    { exercise: "Cable Flyes", tier: "full-gym", avoid: ["shoulder"] },
    { exercise: "Push-ups", tier: "bodyweight-only", avoid: ["wrist"] },
    { exercise: "Diamond Push-ups", tier: "bodyweight-only", avoid: ["wrist", "elbow"] },
  ],
  // Vertical push
  [
    { exercise: "Overhead Press", tier: "full-gym", avoid: ["shoulder"] },
    { exercise: "Dumbbell Shoulder Press", tier: "home-gym", avoid: ["shoulder"] },
    { exercise: "Landmine Press", tier: "full-gym", avoid: ["shoulder"] },
    { exercise: "Pike Push-ups", tier: "bodyweight-only", avoid: ["shoulder", "wrist"] },
  ],
  // Triceps isolation
  [
    { exercise: "Tricep Pushdowns", tier: "full-gym", avoid: ["elbow"] },
    { exercise: "Overhead Tricep Extension", tier: "home-gym", avoid: ["elbow", "shoulder"] },
    { exercise: "Bench Dips", tier: "bodyweight-only", avoid: ["elbow", "shoulder"] },
  ],
  // Horizontal pull
  [
    { exercise: "Barbell Rows", tier: "full-gym", avoid: ["lower-back"] },
    { exercise: "Seated Cable Rows", tier: "full-gym", avoid: ["lower-back"] },
    { exercise: "Single-Arm Dumbbell Row", tier: "home-gym", avoid: ["lower-back"] },
    { exercise: "Inverted Rows", tier: "minimal", avoid: ["shoulder"] },
  ],
  // Vertical pull
  [
    { exercise: "Weighted Pull-ups", tier: "full-gym", avoid: ["shoulder"] },
    { exercise: "Lat Pulldowns", tier: "full-gym", avoid: ["shoulder"] },
    { exercise: "Pull-ups", tier: "minimal", avoid: ["shoulder"] },
    { exercise: "Chin-up Negatives", tier: "minimal", avoid: ["shoulder", "elbow"] },
    { exercise: "Dead Hang", tier: "minimal", avoid: ["shoulder"] },
  ],
  // Rear delt / upper back isolation
  [
    { exercise: "Face Pulls", tier: "full-gym", avoid: ["shoulder"] },
    { exercise: "Band Face Pulls", tier: "minimal", avoid: ["shoulder"] },
  ],
  // Biceps isolation
  [
    { exercise: "Dumbbell Curls", tier: "home-gym", avoid: ["elbow"] },
    { exercise: "Hammer Curls", tier: "home-gym", avoid: ["elbow"] },
    { exercise: "Barbell Curls", tier: "full-gym", avoid: ["elbow"] },
  ],
  // Squat pattern
  [
    { exercise: "Barbell Back Squat", tier: "full-gym", avoid: ["knee", "lower-back"] },
    { exercise: "Front Squat", tier: "full-gym", avoid: ["knee", "lower-back"] },
    { exercise: "Barbell Squats", tier: "full-gym", avoid: ["knee", "lower-back"] },
    { exercise: "Leg Press", tier: "full-gym", avoid: ["knee"] },
    { exercise: "Bodyweight Squats", tier: "bodyweight-only", avoid: ["knee"] },
    { exercise: "Jump Squats", tier: "bodyweight-only", avoid: ["knee"] },
    { exercise: "Wall Sit", tier: "bodyweight-only", avoid: ["knee"] },
  ],
  // Unilateral squat / lateral hip
  [
    { exercise: "Bulgarian Split Squats", tier: "minimal", avoid: ["knee"] },
    { exercise: "Pistol Squat Progressions", tier: "bodyweight-only", avoid: ["knee"] },
    { exercise: "Step-ups", tier: "minimal", avoid: ["knee"] },
    { exercise: "Cossack Squats", tier: "bodyweight-only", avoid: ["knee", "hip"] },
    { exercise: "Lateral Lunges", tier: "bodyweight-only", avoid: ["knee", "hip"] },
  ],
  // Hinge pattern
  [
    { exercise: "Romanian Deadlift", tier: "home-gym", avoid: ["lower-back", "hamstring"] },
    { exercise: "Barbell Deadlift", tier: "full-gym", avoid: ["lower-back"] },
    { exercise: "Single-Leg Deadlift", tier: "minimal", avoid: ["lower-back", "hamstring"] },
    { exercise: "Glute Bridges", tier: "bodyweight-only", avoid: ["lower-back"] },
  ],
  // Lunge pattern
  [
    { exercise: "Walking Lunges", tier: "bodyweight-only", avoid: ["knee"] },
    { exercise: "Lunges", tier: "bodyweight-only", avoid: ["knee"] },
  ],
  // Calf
  [
    { exercise: "Calf Raises", tier: "minimal", avoid: [] },
    { exercise: "Single-Leg Calf Raises", tier: "bodyweight-only", avoid: [] },
  ],
  // Hamstring isolation
  [
    { exercise: "Hamstring Curls", tier: "full-gym", avoid: ["knee"] },
    { exercise: "Nordic Curl Negatives", tier: "bodyweight-only", avoid: ["knee", "hamstring"] },
  ],
  // Core stability
  [
    { exercise: "Plank", tier: "bodyweight-only", avoid: ["lower-back"] },
    { exercise: "Plank Hold", tier: "bodyweight-only", avoid: ["lower-back"] },
    { exercise: "Plank Shoulder Taps", tier: "bodyweight-only", avoid: ["shoulder", "lower-back"] },
    { exercise: "Superman Hold", tier: "bodyweight-only", avoid: ["lower-back"] },
    { exercise: "Mountain Climbers", tier: "bodyweight-only", avoid: ["wrist", "lower-back"] },
    { exercise: "Plank to Push-up", tier: "bodyweight-only", avoid: ["wrist", "shoulder"] },
  ],
  // Conditioning / full-body
  [
    { exercise: "Burpees", tier: "bodyweight-only", avoid: ["knee", "wrist"] },
    { exercise: "Kettlebell Swings", tier: "minimal", avoid: ["lower-back"] },
    { exercise: "Box Jumps", tier: "minimal", avoid: ["knee"] },
    { exercise: "Battle Ropes", tier: "minimal", avoid: ["shoulder"] },
    { exercise: "Dumbbell Thrusters", tier: "home-gym", avoid: ["shoulder", "knee"] },
    { exercise: "Rowing Sprints", tier: "full-gym", avoid: ["lower-back"] },
    { exercise: "High Knees", tier: "bodyweight-only", avoid: ["knee"] },
    { exercise: "Sled Push", tier: "full-gym", avoid: ["knee"] },
    { exercise: "Medicine Ball Slams", tier: "minimal", avoid: ["lower-back", "shoulder"] },
    { exercise: "Assault Bike Sprint", tier: "full-gym", avoid: [] },
    { exercise: "Farmer's Carry", tier: "minimal", avoid: ["lower-back"] },
  ],
  // Cardio — Zone 2
  [
    { exercise: "Zone 2 Run", tier: "bodyweight-only", avoid: ["knee"] },
    { exercise: "Stationary Bike — Zone 2", tier: "full-gym", avoid: ["knee"] },
    { exercise: "Incline Treadmill Walk", tier: "full-gym", avoid: ["knee"] },
    { exercise: "Easy Aerobic Run", tier: "bodyweight-only", avoid: ["knee"] },
    { exercise: "Moderate Steady Ride", tier: "full-gym", avoid: ["knee"] },
  ],
  // Cardio — intervals / tempo
  [
    { exercise: "4 min Hard Run", tier: "bodyweight-only", avoid: ["knee"] },
    { exercise: "Tempo Run", tier: "bodyweight-only", avoid: ["knee"] },
    { exercise: "Bike Sprint Intervals", tier: "full-gym", avoid: ["knee"] },
  ],
];

const AREA_KEYWORDS: Record<BodyArea, string[]> = {
  knee: ["knee"],
  shoulder: ["shoulder", "rotator cuff"],
  "lower-back": ["lower back", "low back", "lumbar", "spine", "back injury", "herniated"],
  wrist: ["wrist"],
  elbow: ["elbow", "tennis elbow", "golfer's elbow"],
  hip: ["hip"],
  hamstring: ["hamstring"],
};

function hasInjuryOverlap(avoid: BodyArea[], injuryBlob: string): boolean {
  if (avoid.length === 0 || !injuryBlob) return false;
  return avoid.some((area) => AREA_KEYWORDS[area].some((kw) => injuryBlob.includes(kw)));
}

/**
 * Returns up to 3 pre-approved alternative exercise names for `exerciseName`,
 * filtered to what the client's equipment can perform and clear of anything
 * touching their flagged injury areas. Empty array means no swap is offered.
 */
export function getSwapOptions(
  exerciseName: string,
  equipmentAccess: string,
  injuryBlob: string
): string[] {
  const tier = (equipmentAccess as EquipmentTier) in EQUIPMENT_RANK ? (equipmentAccess as EquipmentTier) : "bodyweight-only";
  const clientRank = EQUIPMENT_RANK[tier];
  const lowerBlob = injuryBlob.toLowerCase();

  const group = GROUPS.find((g) => g.some((m) => m.exercise === exerciseName));
  if (!group) return [];

  return group
    .filter((m) => m.exercise !== exerciseName)
    .filter((m) => EQUIPMENT_RANK[m.tier] <= clientRank)
    .filter((m) => !hasInjuryOverlap(m.avoid, lowerBlob))
    .slice(0, 3)
    .map((m) => m.exercise);
}

/** True if `exerciseName` and `candidate` are both valid members of the same group. */
export function isValidSwap(exerciseName: string, candidate: string): boolean {
  const group = GROUPS.find((g) => g.some((m) => m.exercise === exerciseName));
  if (!group) return false;
  return group.some((m) => m.exercise === candidate);
}
