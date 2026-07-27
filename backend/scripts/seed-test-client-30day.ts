import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";

async function main() {
  const email = "test-30day@vintusperformance.org";
  const passwordHash = await bcrypt.hash("TestPass123!", 10);
  await prisma.user.deleteMany({ where: { email } });
  await prisma.user.create({
    data: {
      email, passwordHash, role: "CLIENT",
      athleteProfile: { create: { firstName: "Casey", lastName: "Test", primaryGoal: "lose-fat", trainingDaysPerWeek: 3, experienceLevel: "beginner", equipmentAccess: "minimal" } },
      subscription: { create: { planTier: "TRAINING_30DAY", status: "ACTIVE", currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
    },
  });
  console.log("seeded 30day user");
}
main().finally(() => prisma.$disconnect());
