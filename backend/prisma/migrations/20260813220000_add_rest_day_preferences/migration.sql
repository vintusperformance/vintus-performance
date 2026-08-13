-- AlterTable
ALTER TABLE "AthleteProfile" ADD COLUMN     "restDayPreferences" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
