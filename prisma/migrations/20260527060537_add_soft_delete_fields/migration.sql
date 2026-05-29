-- AlterTable
ALTER TABLE "GuestSignUp" ADD COLUMN     "removedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SignUp" ADD COLUMN     "withdrawnAt" TIMESTAMP(3);
