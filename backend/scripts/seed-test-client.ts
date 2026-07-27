import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const email = "test-pc@vintusperformance.org";
  const passwordHash = await bcrypt.hash("TestPass123!", 10);

  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: "CLIENT",
      athleteProfile: {
        create: {
          firstName: "Jordan",
          lastName: "Test",
          primaryGoal: "build-muscle",
          trainingDaysPerWeek: 4,
          experienceLevel: "intermediate",
          equipmentAccess: "full-gym",
          injuryHistory: null,
        },
      },
      subscription: {
        create: {
          planTier: "PRIVATE_COACHING",
          status: "ACTIVE",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      },
    },
    include: { athleteProfile: true },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(today);
  const day = weekStart.getUTCDay();
  weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const plan = await prisma.workoutPlan.create({
    data: {
      athleteProfileId: user.athleteProfile!.id,
      name: "Week 1 — Foundation Phase",
      weekNumber: 1,
      blockType: "base",
      startDate: weekStart,
      endDate: weekEnd,
      isActive: true,
      plannedTSS: 200,
    },
  });

  await prisma.workoutSession.create({
    data: {
      workoutPlanId: plan.id,
      scheduledDate: today,
      scheduledOrder: 1,
      sessionType: "STRENGTH_UPPER",
      title: "Upper Body Strength",
      description: "Test session for swap-flow verification.",
      prescribedDuration: 45,
      prescribedTSS: 50,
      status: "SCHEDULED",
      content: {
        warmup: [{ exercise: "Arm Circles", duration: "30 sec", notes: "Progressive range" }],
        main: [
          { exercise: "Barbell Bench Press", sets: 4, reps: "8-10", rest: "90s", intensity: "RPE 7", notes: "Control the eccentric" },
          { exercise: "Barbell Rows", sets: 3, reps: "8-10", rest: "90s", intensity: "RPE 7" },
        ],
        cooldown: [{ exercise: "Static Stretch — Worked Muscles", duration: "3 min" }],
        estimatedDuration: 45,
        estimatedTSS: 50,
      },
    },
  });

  console.log("Seeded:", email, "/ TestPass123!");
}

main().finally(() => prisma.$disconnect());
