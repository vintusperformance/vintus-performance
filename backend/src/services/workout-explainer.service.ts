import { prisma } from "../lib/prisma.js";
import { GOAL_REP_PROFILES, type MainExercise } from "../data/exercise-library.js";

/**
 * "Why These Workouts?" explainer — reflects back the real programming logic
 * that was actually used for this session (antagonist pairing, the ramp/
 * autoregulation scheme, and the client's own goal), rather than generating
 * generic fitness copy. Pulls the exercise-specific rationale straight from
 * the session's own stored `notes` fields — the same text a human coach
 * wrote into the template or that Claude generated for Week 1 — instead of
 * re-deriving or guessing muscle-group relationships from exercise names.
 */

const GOAL_LABELS: Record<string, string> = {
  "build-muscle": "Build Muscle",
  recomposition: "Body Recomposition",
  "lose-fat": "Lose Fat",
  endurance: "Improve Endurance",
  "well-rounded": "Well-Rounded Fitness",
};

const PAIRING_PRINCIPLE =
  "When the same muscle group trains twice in one session — like chest, then triceps, right after — the second one is already pre-fatigued as a secondary mover from every set before it, so it never gets to perform at real capacity. Pairing a lift with a non-competing muscle instead (chest with biceps or rear delts, back with triceps or front/side delts) means the resting muscle gets real, productive work during your rest window instead of sitting idle, and neither one steals the other's output.";

const RAMP_PRINCIPLE =
  "Sets build from light to heavy, ending in a true top set — the early sets are supposed to feel easy. That's on purpose: it means you have everything left for the set that actually counts, and it warms up the exact movement pattern instead of a generic warm-up.";

const AUTOREGULATION_NOTE =
  "No fixed weight here is gospel. Sleep, stress, and how your body actually shows up today all matter — if it's not a good day, drop the load and get quality reps in instead of chasing a number. No ego lifting.";

interface PairingExplanation {
  primary: string;
  primaryNote: string | null;
  accessory: string;
  accessoryNote: string | null;
}

export interface WorkoutExplanation {
  sessionTitle: string;
  goal: string;
  goalLabel: string;
  goalPhilosophy: string;
  hasPairing: boolean;
  hasRamp: boolean;
  pairingPrinciple: string | null;
  rampPrinciple: string | null;
  pairings: PairingExplanation[];
  soloRampExercises: string[];
  autoregulationNote: string;
}

export async function explainSessionProgramming(
  sessionId: string,
  athleteProfileId: string
): Promise<WorkoutExplanation | null> {
  const session = await prisma.workoutSession.findFirst({
    where: { id: sessionId, workoutPlan: { athleteProfileId } },
    include: { workoutPlan: { include: { athleteProfile: true } } },
  });
  if (!session) return null;

  const goal = session.workoutPlan.athleteProfile.primaryGoal;
  const goalProfile = GOAL_REP_PROFILES[goal] ?? GOAL_REP_PROFILES["well-rounded"];

  const content = session.content as { main?: MainExercise[] } | null;
  const main = Array.isArray(content?.main) ? (content!.main as MainExercise[]) : [];

  const pairsById = new Map<string, { primary?: MainExercise; accessory?: MainExercise }>();
  for (const ex of main) {
    if (!ex.pairId) continue;
    const entry = pairsById.get(ex.pairId) ?? {};
    if (ex.isRamp) entry.primary = ex;
    if (ex.isSuperset) entry.accessory = ex;
    pairsById.set(ex.pairId, entry);
  }

  const pairings: PairingExplanation[] = [];
  for (const { primary, accessory } of pairsById.values()) {
    if (!primary || !accessory) continue;
    pairings.push({
      primary: primary.exercise,
      primaryNote: primary.notes ?? null,
      accessory: accessory.exercise,
      accessoryNote: accessory.notes ?? null,
    });
  }

  const soloRampExercises = main
    .filter((ex) => ex.isRamp && !ex.pairId)
    .map((ex) => ex.exercise);

  const hasRamp = main.some((ex) => ex.isRamp);
  const hasPairing = pairings.length > 0;

  return {
    sessionTitle: session.title,
    goal,
    goalLabel: GOAL_LABELS[goal] ?? goal,
    goalPhilosophy: goalProfile.philosophy,
    hasPairing,
    hasRamp,
    pairingPrinciple: hasPairing ? PAIRING_PRINCIPLE : null,
    rampPrinciple: hasRamp ? RAMP_PRINCIPLE : null,
    pairings,
    soloRampExercises,
    autoregulationNote: AUTOREGULATION_NOTE,
  };
}
