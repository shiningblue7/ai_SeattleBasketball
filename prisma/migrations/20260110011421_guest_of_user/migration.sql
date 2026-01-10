-- AlterTable
ALTER TABLE "GuestSignUp" ADD COLUMN     "guestOfUserId" TEXT;

-- CreateIndex
CREATE INDEX "GuestSignUp_scheduleId_guestOfUserId_idx" ON "GuestSignUp"("scheduleId", "guestOfUserId");

-- AddForeignKey
ALTER TABLE "GuestSignUp" ADD CONSTRAINT "GuestSignUp_guestOfUserId_fkey" FOREIGN KEY ("guestOfUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
