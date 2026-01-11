import { ScheduleEventType, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function createScheduleEvent(input: {
  scheduleId: string;
  type: ScheduleEventType;
  actorUserId?: string | null;
  targetUserId?: string | null;
  guestSignUpId?: string | null;
  signUpId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}) {
  const {
    scheduleId,
    type,
    actorUserId = null,
    targetUserId = null,
    guestSignUpId = null,
    signUpId = null,
    metadata,
  } = input;

  return prisma.scheduleEvent.create({
    data: {
      scheduleId,
      type,
      actorUserId,
      targetUserId,
      guestSignUpId,
      signUpId,
      ...(metadata == null ? {} : { metadata }),
    },
    select: { id: true },
  });
}
