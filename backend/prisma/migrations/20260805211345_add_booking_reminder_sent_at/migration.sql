-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SessionBooking" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
