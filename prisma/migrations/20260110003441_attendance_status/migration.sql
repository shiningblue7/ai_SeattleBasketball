-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('FULL', 'LATE', 'LEAVE_EARLY', 'PARTIAL');

-- AlterTable
ALTER TABLE "SignUp" ADD COLUMN     "attendanceNote" TEXT,
ADD COLUMN     "attendanceStatus" "AttendanceStatus" NOT NULL DEFAULT 'FULL';
