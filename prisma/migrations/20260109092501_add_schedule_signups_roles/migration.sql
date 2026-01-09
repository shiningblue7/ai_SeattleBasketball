-- AlterTable
ALTER TABLE "User" ADD COLUMN     "member" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roles" TEXT;

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "limit" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignUp" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SignUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignUp_scheduleId_position_idx" ON "SignUp"("scheduleId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SignUp_scheduleId_userId_key" ON "SignUp"("scheduleId", "userId");

-- AddForeignKey
ALTER TABLE "SignUp" ADD CONSTRAINT "SignUp_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignUp" ADD CONSTRAINT "SignUp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
