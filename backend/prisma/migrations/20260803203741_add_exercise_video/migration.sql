-- CreateEnum
CREATE TYPE "ExerciseVideoStatus" AS ENUM ('GENERATING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "ExerciseVideo" (
    "id" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "runwayTaskId" TEXT,
    "videoUrl" TEXT,
    "status" "ExerciseVideoStatus" NOT NULL DEFAULT 'GENERATING',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseVideo_exerciseName_key" ON "ExerciseVideo"("exerciseName");
