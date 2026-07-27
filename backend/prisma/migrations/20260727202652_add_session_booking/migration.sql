-- CreateEnum
CREATE TYPE "PaidSessionType" AS ENUM ('THIRTY_MIN', 'SIXTY_MIN_1ON1', 'SIXTY_MIN_1ON2', 'SIXTY_MIN_GROUP');

-- CreateEnum
CREATE TYPE "SessionBookingStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELED');

-- CreateTable
CREATE TABLE "SessionBooking" (
    "id" TEXT NOT NULL,
    "sessionType" "PaidSessionType" NOT NULL,
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "totalAmountCents" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "meetingPreference" TEXT NOT NULL,
    "coachingContext" TEXT,
    "scheduledDate" TEXT NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "status" "SessionBookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "confirmationSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionBooking_pkey" PRIMARY KEY ("id")
);
