-- AlterEnum
ALTER TYPE "PaidSessionType" ADD VALUE 'PC_WEEKLY_CALL';

-- AlterTable
ALTER TABLE "SessionBooking" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "SessionBooking_userId_idx" ON "SessionBooking"("userId");

-- AddForeignKey
ALTER TABLE "SessionBooking" ADD CONSTRAINT "SessionBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
