-- AlterTable
ALTER TABLE "NutritionPlan" ADD COLUMN     "mealRotation" JSONB;

-- CreateTable
CREATE TABLE "NutritionFavorite" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "foods" JSONB NOT NULL,
    "instructions" TEXT,
    "calories" INTEGER NOT NULL,
    "proteinG" INTEGER NOT NULL,
    "carbsG" INTEGER NOT NULL,
    "fatG" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NutritionFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutritionFavorite_athleteProfileId_title_key" ON "NutritionFavorite"("athleteProfileId", "title");

-- AddForeignKey
ALTER TABLE "NutritionFavorite" ADD CONSTRAINT "NutritionFavorite_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
