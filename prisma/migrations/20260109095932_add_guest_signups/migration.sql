-- CreateTable
CREATE TABLE "GuestSignUp" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GuestSignUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuestSignUp_scheduleId_position_idx" ON "GuestSignUp"("scheduleId", "position");

-- AddForeignKey
ALTER TABLE "GuestSignUp" ADD CONSTRAINT "GuestSignUp_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSignUp" ADD CONSTRAINT "GuestSignUp_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
