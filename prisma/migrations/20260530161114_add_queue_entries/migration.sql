-- CreateEnum
CREATE TYPE "QueueEntryKind" AS ENUM ('USER', 'GUEST');

-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "QueueEntryKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signUpId" TEXT,
    "guestSignUpId" TEXT,

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QueueEntry_signUpId_key" ON "QueueEntry"("signUpId");

-- CreateIndex
CREATE UNIQUE INDEX "QueueEntry_guestSignUpId_key" ON "QueueEntry"("guestSignUpId");

-- CreateIndex
CREATE INDEX "QueueEntry_scheduleId_position_idx" ON "QueueEntry"("scheduleId", "position");

-- CreateIndex
CREATE INDEX "QueueEntry_scheduleId_kind_idx" ON "QueueEntry"("scheduleId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "QueueEntry_scheduleId_position_key" ON "QueueEntry"("scheduleId", "position");

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_signUpId_fkey" FOREIGN KEY ("signUpId") REFERENCES "SignUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_guestSignUpId_fkey" FOREIGN KEY ("guestSignUpId") REFERENCES "GuestSignUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
