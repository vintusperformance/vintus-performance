-- AlterTable
ALTER TABLE "AthleteProfile" ADD COLUMN     "activityLevel" TEXT,
ADD COLUMN     "cookingSkill" TEXT,
ADD COLUMN     "foodAllergies" TEXT,
ADD COLUMN     "foodBudget" TEXT,
ADD COLUMN     "foodsHated" TEXT,
ADD COLUMN     "foodsLoved" TEXT,
ADD COLUMN     "mealPrepTime" TEXT;

-- CreateTable
CREATE TABLE "NutritionPlan" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dailyCalories" INTEGER NOT NULL,
    "proteinG" INTEGER NOT NULL,
    "carbsG" INTEGER NOT NULL,
    "fatG" INTEGER NOT NULL,
    "mealTiming" TEXT NOT NULL,
    "sampleMeals" JSONB NOT NULL,
    "supplementNotes" TEXT,
    "coachNotes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionPlan_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NutritionPlan" ADD CONSTRAINT "NutritionPlan_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
