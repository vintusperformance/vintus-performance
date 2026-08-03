/**
 * Exercise demo video generation — prompt builder + starter exercise metadata.
 *
 * Scope: the ~24 highest-frequency exercises across exercise-library.ts session
 * templates, not the full ~112-exercise exercise-swaps.ts list. Same reasoning
 * as the earlier photo-graphics pilot (see scratchpad brief from that pass):
 * stock/generation quality and human review time both thin out fast past the
 * "major lift" tier, so start narrow and expand deliberately rather than
 * generating all ~112 uniformly.
 *
 * Note on why there's no gender field here: because a video is generated once
 * per exerciseName and reused for every client (Runway generate-once +
 * human-approve architecture, not per-client generation), there is no
 * per-client personalization — the earlier "ask the client's gender so we can
 * match the demo" requirement from the original ask doesn't apply to this
 * design. The trainer in every video is a fixed, professional, plainly-dressed
 * model — the point is showing the movement, not the person performing it.
 */

export type CameraAngle = "side" | "front" | "three-quarter";

export interface ExerciseVideoCue {
  /** Must match the naming used in exercise-library.ts / exercise-swaps.ts exactly. */
  exerciseName: string;
  cameraAngle: CameraAngle;
  /** What's visibly in frame besides the trainer — equipment, setup. */
  equipmentDetail: string;
  /** 3-4 short biomechanical cues, same voice as the earlier photo-graphics brief. */
  formCues: string[];
}

export const STARTER_EXERCISE_CUES: ExerciseVideoCue[] = [
  // Horizontal push
  {
    exerciseName: "Barbell Bench Press",
    cameraAngle: "side",
    equipmentDetail: "flat bench, barbell loaded with visible weight plates",
    formCues: [
      "elbows hold a 45 to 75 degree angle",
      "bar tracks straight down to mid-chest",
      "feet stay flat and planted",
      "shoulder blades stay set against the bench",
    ],
  },
  {
    exerciseName: "Push-ups",
    cameraAngle: "side",
    equipmentDetail: "open floor space, exercise mat",
    formCues: [
      "hands sit under the shoulders",
      "body holds one straight line from head to heel",
      "elbows travel back near 45 degrees",
      "core stays braced throughout",
    ],
  },
  // Vertical push
  {
    exerciseName: "Overhead Press",
    cameraAngle: "front",
    equipmentDetail: "squat rack or barbell stand, barbell at shoulder height",
    formCues: [
      "bar starts at the collarbone",
      "core braced, no lower-back arch",
      "bar path stays close to the face on the way up",
      "full lockout overhead with the bar over mid-foot",
    ],
  },
  {
    exerciseName: "Dumbbell Shoulder Press",
    cameraAngle: "front",
    equipmentDetail: "flat bench or standing, pair of dumbbells at shoulder height",
    formCues: [
      "dumbbells start level with the shoulders",
      "core braced, ribs stay down",
      "controlled path straight overhead",
      "full lockout without shrugging the shoulders",
    ],
  },
  // Triceps isolation
  {
    exerciseName: "Tricep Pushdowns",
    cameraAngle: "side",
    equipmentDetail: "cable machine, straight or rope attachment at head height",
    formCues: [
      "elbows stay pinned to the sides",
      "only the forearm moves",
      "full extension without locking out aggressively",
      "controlled return, no swinging the cable stack",
    ],
  },
  {
    exerciseName: "Bench Dips",
    cameraAngle: "side",
    equipmentDetail: "flat bench, hands gripping the edge",
    formCues: [
      "hands grip the bench edge, fingers forward",
      "elbows track straight back, not flared out",
      "hips stay close to the bench",
      "controlled descent to roughly 90 degrees",
    ],
  },
  // Horizontal pull
  {
    exerciseName: "Barbell Rows",
    cameraAngle: "side",
    equipmentDetail: "barbell on the floor, athlete hinged forward",
    formCues: [
      "torso holds a consistent forward-hinge angle",
      "bar pulls to the lower ribs",
      "elbows stay close to the body",
      "no jerking or using the lower back to heave the weight",
    ],
  },
  {
    exerciseName: "Seated Cable Rows",
    cameraAngle: "side",
    equipmentDetail: "seated cable row machine, close-grip handle",
    formCues: [
      "torso stays upright, no leaning back to pull",
      "handle pulls to the lower ribs",
      "shoulder blades pull together at the finish",
      "controlled return to a full stretch",
    ],
  },
  // Vertical pull
  {
    exerciseName: "Pull-ups",
    cameraAngle: "front",
    equipmentDetail: "pull-up bar, full hang start position",
    formCues: [
      "starts from a full dead hang",
      "chin clears the bar at the top",
      "controlled descent, no kipping",
      "shoulder blades engage before the arms pull",
    ],
  },
  {
    exerciseName: "Lat Pulldowns",
    cameraAngle: "front",
    equipmentDetail: "lat pulldown machine, wide-grip bar",
    formCues: [
      "slight backward lean, chest stays tall",
      "bar pulls to the upper chest",
      "elbows drive down and back",
      "controlled return to a full stretch overhead",
    ],
  },
  // Rear delt / upper back isolation
  {
    exerciseName: "Face Pulls",
    cameraAngle: "side",
    equipmentDetail: "cable machine, rope attachment at face height",
    formCues: [
      "pull to eye level, not the chest",
      "elbows finish high, above shoulder height",
      "hands separate at the face",
      "controlled return without letting the weight stack slam",
    ],
  },
  // Biceps isolation
  {
    exerciseName: "Dumbbell Curls",
    cameraAngle: "side",
    equipmentDetail: "standing, pair of dumbbells at the sides",
    formCues: [
      "elbows stay pinned to the ribs",
      "no swinging or using the hips to heave the weight",
      "full range from a straight arm to full flexion",
      "controlled lowering, not a fast drop",
    ],
  },
  // Squat pattern
  {
    exerciseName: "Barbell Back Squat",
    cameraAngle: "side",
    equipmentDetail: "squat rack, barbell racked across the upper back",
    formCues: [
      "bar sits across the traps",
      "knees track over the toes",
      "hips break below parallel",
      "chest stays tall through the whole rep",
    ],
  },
  {
    exerciseName: "Bodyweight Squats",
    cameraAngle: "side",
    equipmentDetail: "open floor space",
    formCues: [
      "knees track over the toes",
      "hips sit back and down",
      "chest stays tall, no forward collapse",
      "full depth with control, no bouncing at the bottom",
    ],
  },
  {
    exerciseName: "Bulgarian Split Squats",
    cameraAngle: "side",
    equipmentDetail: "flat bench, rear foot elevated",
    formCues: [
      "rear foot rests on the bench, laces down",
      "front knee tracks over the front foot",
      "torso stays upright through the descent",
      "controlled depth, no bouncing off the bottom",
    ],
  },
  {
    exerciseName: "Walking Lunges",
    cameraAngle: "side",
    equipmentDetail: "open floor space, walking forward through the rep",
    formCues: [
      "front knee tracks over the front foot",
      "back knee drops straight down, not forward",
      "torso stays upright",
      "controlled step through to the next rep",
    ],
  },
  // Hinge pattern
  {
    exerciseName: "Romanian Deadlift",
    cameraAngle: "side",
    equipmentDetail: "barbell or dumbbells, standing start position",
    formCues: [
      "slight knee bend held constant through the rep",
      "hips hinge straight back",
      "bar or dumbbells stay close to the legs",
      "flat back through the whole range, no rounding",
    ],
  },
  {
    exerciseName: "Barbell Deadlift",
    cameraAngle: "side",
    equipmentDetail: "barbell on the floor, feet hip-width",
    formCues: [
      "bar stays over mid-foot",
      "flat back from setup to lockout",
      "hips and shoulders rise together",
      "full lockout with hips through, no lower-back hyperextension",
    ],
  },
  {
    exerciseName: "Glute Bridges",
    cameraAngle: "side",
    equipmentDetail: "exercise mat, floor",
    formCues: [
      "feet planted flat, hip-width apart",
      "drive through the heels",
      "full hip extension at the top without arching the lower back",
      "controlled lowering, not a drop",
    ],
  },
  // Calf
  {
    exerciseName: "Calf Raises",
    cameraAngle: "side",
    equipmentDetail: "standing on flat ground or a small step",
    formCues: [
      "full range from a deep stretch to a full rise onto the toes",
      "controlled tempo, no bouncing",
      "knees stay soft, not locked",
      "even weight across both feet",
    ],
  },
  // Core stability
  {
    exerciseName: "Plank",
    cameraAngle: "side",
    equipmentDetail: "exercise mat, forearms on the ground",
    formCues: [
      "straight line from head to heel",
      "hips stay level, no sagging or piking",
      "core braced, glutes engaged",
      "neutral neck, eyes toward the floor",
    ],
  },
  {
    exerciseName: "Mountain Climbers",
    cameraAngle: "side",
    equipmentDetail: "exercise mat, plank start position",
    formCues: [
      "hips stay level and low through the movement",
      "knees drive toward the chest, not out to the side",
      "hands stay planted under the shoulders",
      "controlled tempo, no bouncing the hips",
    ],
  },
  // Conditioning / full-body
  {
    exerciseName: "Burpees",
    cameraAngle: "side",
    equipmentDetail: "open floor space",
    formCues: [
      "controlled drop to a plank, no collapsing to the floor",
      "chest touches down on the push-up",
      "feet snap forward together under the hips",
      "full extension on the jump at the top",
    ],
  },
  {
    exerciseName: "Kettlebell Swings",
    cameraAngle: "side",
    equipmentDetail: "single kettlebell on the floor between the feet",
    formCues: [
      "movement is a hip hinge, not a squat",
      "kettlebell floats to chest height off hip drive",
      "flat back through the whole swing",
      "controlled backswing between the legs",
    ],
  },
];

const PROMPT_PREFIX =
  "A professional fitness trainer in athletic wear demonstrates proper exercise " +
  "form in a clean, well-lit modern gym.";

const PROMPT_SUFFIX =
  "Steady camera, no cuts, no text overlays, no on-screen graphics, realistic human " +
  "anatomy and movement, natural gym lighting, plain neutral gray or black athletic " +
  "clothing with no visible logos or text. Approximately 15 seconds, 3 clean and " +
  "controlled repetitions.";

/**
 * Builds the exact prompt sent to Runway for a given exercise. Deterministic —
 * same cue produces the same prompt string, so it's stored verbatim on
 * ExerciseVideo.prompt for reproducibility (matches the model comment on that field).
 */
export function buildVideoPrompt(cue: ExerciseVideoCue): string {
  const angleText =
    cue.cameraAngle === "side"
      ? "Camera holds a steady side-on shot"
      : cue.cameraAngle === "front"
        ? "Camera holds a steady front-facing shot"
        : "Camera holds a steady three-quarter angle shot";

  return [
    PROMPT_PREFIX,
    `Exercise: ${cue.exerciseName}.`,
    `Setup: ${cue.equipmentDetail}.`,
    `${angleText} at mid-distance, capturing the full body throughout the movement.`,
    `Form cues to show clearly: ${cue.formCues.join("; ")}.`,
    PROMPT_SUFFIX,
  ].join(" ");
}

export function getStarterCue(exerciseName: string): ExerciseVideoCue | undefined {
  return STARTER_EXERCISE_CUES.find((c) => c.exerciseName === exerciseName);
}
