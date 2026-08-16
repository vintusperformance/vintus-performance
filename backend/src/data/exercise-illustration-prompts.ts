/**
 * Exercise demo illustration generation — prompt builder + starter exercise
 * metadata. Replaces the earlier video-based "Show Me How" pilot; the cue
 * data below carries over unchanged (it's dietary-neutral body-mechanics
 * data, equally valid for describing a still illustration or a video).
 *
 * The list below is the curated, highest-quality tier — the ~24
 * highest-frequency exercises, hand-written with camera angle, equipment,
 * and biomechanical form cues for a better prompt than a bare exercise name
 * alone produces. It is NOT the ceiling on what can be generated: client
 * plans are AI-generated free text, not drawn from a fixed list, so full
 * coverage requires generating from just the exercise name for anything
 * outside this curated set too — see buildGenericIllustrationPrompt below,
 * and exercise-illustration.service.ts's getExercisesNeedingIllustration,
 * which finds exactly which names real client plans are currently using
 * without an illustration yet.
 *
 * Unlike the video pilot, illustrations have no gender variant — a form
 * diagram depicts the movement, not a person to identify with, so one
 * generated (and admin-approved) illustration is reused for every client
 * regardless of their own gender.
 */

export type CameraAngle = "side" | "front" | "three-quarter";

export interface ExerciseIllustrationCue {
  /** Must match the naming used in exercise-library.ts / exercise-swaps.ts exactly. */
  exerciseName: string;
  cameraAngle: CameraAngle;
  /** What's visibly in frame besides the athlete — equipment, setup. */
  equipmentDetail: string;
  /** 3-4 short biomechanical cues to depict visually (posture, joint angles, movement path). */
  formCues: string[];
}

export const STARTER_EXERCISE_CUES: ExerciseIllustrationCue[] = [
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

const PROMPT_SUFFIX =
  "Professional 2D fitness instructional illustration, clean flat-color vector art style, " +
  "textbook or infographic quality — the kind found in a physical therapy or strength " +
  "coaching manual. Plain white or light neutral background, no clutter. Show clear " +
  "directional arrows indicating the movement path. Realistic human proportions and " +
  "anatomy, athletic build, plain neutral athletic clothing with no logos or text. " +
  "Absolutely no text, words, letters, numbers, or labels anywhere in the image — " +
  "AI-generated text is unreliable, so the image must communicate entirely through the " +
  "illustration itself.";

/**
 * Builds the exact prompt sent to the image model for a given exercise cue.
 * Deterministic — the same cue always produces the same prompt string, so
 * it's stored verbatim on ExerciseIllustration.prompt for reproducibility
 * (matches the model comment on that field).
 */
export function buildIllustrationPrompt(cue: ExerciseIllustrationCue): string {
  const angleText =
    cue.cameraAngle === "side"
      ? "Side-view angle"
      : cue.cameraAngle === "front"
        ? "Front-facing angle"
        : "Three-quarter angle";

  return [
    `A professional fitness instructional illustration demonstrating proper form for: ${cue.exerciseName}.`,
    `Setup: ${cue.equipmentDetail}.`,
    `${angleText}, showing the full body and the complete range of motion — depict the start and end position, or use motion arrows to show the movement path within a single image.`,
    `Key form details to depict visually: ${cue.formCues.join("; ")}.`,
    PROMPT_SUFFIX,
  ].join(" ");
}

export function getStarterCue(exerciseName: string): ExerciseIllustrationCue | undefined {
  return STARTER_EXERCISE_CUES.find((c) => c.exerciseName === exerciseName);
}

/**
 * Fallback for any exercise name without curated cue data. Client plans are
 * AI-generated free text, not drawn from a fixed list, so the curated set
 * above can never have full coverage on its own — this is what makes "every
 * exercise a client sees" achievable at all. Lower fidelity than a curated
 * cue (no camera angle or biomechanical form cues to steer the model with,
 * just the name itself), but still gated by the same admin-approval step
 * before a client ever sees it, so a worse prompt just means more likely to
 * need a Reject + Regenerate, not a safety risk.
 */
export function buildGenericIllustrationPrompt(exerciseName: string): string {
  return [
    `A professional fitness instructional illustration demonstrating proper form for: ${exerciseName}.`,
    `Choose a camera angle (side, front, or three-quarter) that best shows the movement pattern implied by the exercise name. Show the full body and the complete range of motion — depict the start and end position, or use motion arrows to show the movement path within a single image. Infer reasonable equipment and setup from the exercise name.`,
    PROMPT_SUFFIX,
  ].join(" ");
}
