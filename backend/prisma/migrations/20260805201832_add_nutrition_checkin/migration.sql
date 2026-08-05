-- CreateTable
CREATE TABLE "NutritionCheckIn" (
    "id" TEXT NOT NULL,
    "athleteProfileId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "completedIndices" INTEGER[],
    "totalItems" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutritionCheckIn_athleteProfileId_date_key" ON "NutritionCheckIn"("athleteProfileId", "date");

-- AddForeignKey
ALTER TABLE "NutritionCheckIn" ADD CONSTRAINT "NutritionCheckIn_athleteProfileId_fkey" FOREIGN KEY ("athleteProfileId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
