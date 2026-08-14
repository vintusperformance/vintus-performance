-- AlterTable
ALTER TABLE "WorkoutSession" ADD COLUMN     "completedExercises" JSONB;

-- CreateTable
CREATE TABLE "MacroCalculatorAddon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stripeSessionId" TEXT,
    "amountPaidCents" INTEGER NOT NULL DEFAULT 2300,
    "calories" INTEGER,
    "proteinGrams" INTEGER,
    "carbGrams" INTEGER,
    "fatGrams" INTEGER,
    "weightLbs" DOUBLE PRECISION,
    "heightInches" INTEGER,
    "age" INTEGER,
    "gender" TEXT,
    "activityLevel" TEXT,
    "goalDirection" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MacroCalculatorAddon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MacroCalculatorAddon_userId_key" ON "MacroCalculatorAddon"("userId");

-- AddForeignKey
ALTER TABLE "MacroCalculatorAddon" ADD CONSTRAINT "MacroCalculatorAddon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
