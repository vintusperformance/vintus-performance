-- CreateTable
CREATE TABLE "NutritionSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planTier" "PlanTier" NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "renewalPromptedAt" TIMESTAMP(3),
    "renewalResponseAt" TIMESTAMP(3),
    "scheduledDeleteAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NutritionSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NutritionSubscription_userId_key" ON "NutritionSubscription"("userId");

-- AddForeignKey
ALTER TABLE "NutritionSubscription" ADD CONSTRAINT "NutritionSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
