-- AddColumn (nullable first, so we can backfill before enforcing NOT NULL)
ALTER TABLE "ExerciseVideo" ADD COLUMN "trainerGender" TEXT;

-- Backfill known rows from production live-testing (Barbell Bench Press was
-- generated with the male-trainer prompt, Push-ups with the female-trainer
-- prompt — see exercise-video-prompts.ts alternating assignment at the time).
UPDATE "ExerciseVideo" SET "trainerGender" = 'male' WHERE "exerciseName" = 'Barbell Bench Press' AND "trainerGender" IS NULL;
UPDATE "ExerciseVideo" SET "trainerGender" = 'female' WHERE "exerciseName" = 'Push-ups' AND "trainerGender" IS NULL;

-- Any other pre-existing row (shouldn't exist, but just in case) defaults to
-- male rather than failing the NOT NULL constraint below.
UPDATE "ExerciseVideo" SET "trainerGender" = 'male' WHERE "trainerGender" IS NULL;

ALTER TABLE "ExerciseVideo" ALTER COLUMN "trainerGender" SET NOT NULL;

-- DropIndex (old single-column uniqueness)
DROP INDEX "ExerciseVideo_exerciseName_key";

-- CreateIndex (new compound uniqueness — one row per exercise+gender pair)
CREATE UNIQUE INDEX "ExerciseVideo_exerciseName_trainerGender_key" ON "ExerciseVideo"("exerciseName", "trainerGender");
