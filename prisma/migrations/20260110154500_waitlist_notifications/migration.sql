-- CreateTable
CREATE TABLE "WaitlistNotification" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,

    CONSTRAINT "WaitlistNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistNotification_userId_scheduleId_key" ON "WaitlistNotification"("userId", "scheduleId");

-- CreateIndex
CREATE INDEX "WaitlistNotification_scheduleId_idx" ON "WaitlistNotification"("scheduleId");

-- AddForeignKey
ALTER TABLE "WaitlistNotification" ADD CONSTRAINT "WaitlistNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistNotification" ADD CONSTRAINT "WaitlistNotification_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
