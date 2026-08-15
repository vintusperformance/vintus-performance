-- CreateEnum
CREATE TYPE "ExerciseIllustrationStatus" AS ENUM ('GENERATING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "ExerciseIllustration" (
    "id" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "ExerciseIllustrationStatus" NOT NULL DEFAULT 'GENERATING',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseIllustration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseIllustration_exerciseName_key" ON "ExerciseIllustration"("exerciseName");
