-- CreateEnum
CREATE TYPE "ScheduleEventType" AS ENUM ('SIGNUP_JOIN', 'SIGNUP_LEAVE', 'ADMIN_SIGNUP_JOIN', 'ADMIN_SIGNUP_LEAVE', 'GUEST_ADD', 'GUEST_REMOVE', 'SIGNUP_SWAP', 'AVAILABILITY_UPDATE', 'ADMIN_AVAILABILITY_UPDATE');

-- CreateTable
CREATE TABLE "ScheduleEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduleId" TEXT NOT NULL,
    "type" "ScheduleEventType" NOT NULL,
    "actorUserId" TEXT,
    "targetUserId" TEXT,
    "guestSignUpId" TEXT,
    "signUpId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ScheduleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduleEvent_scheduleId_createdAt_idx" ON "ScheduleEvent"("scheduleId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduleEvent_scheduleId_type_idx" ON "ScheduleEvent"("scheduleId", "type");

-- AddForeignKey
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
