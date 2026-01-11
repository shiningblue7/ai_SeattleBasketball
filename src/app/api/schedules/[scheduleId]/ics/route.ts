import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";

function formatIcsUtc(dt: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    dt.getUTCFullYear() +
    pad(dt.getUTCMonth() + 1) +
    pad(dt.getUTCDate()) +
    "T" +
    pad(dt.getUTCHours()) +
    pad(dt.getUTCMinutes()) +
    pad(dt.getUTCSeconds()) +
    "Z"
  );
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scheduleId } = await params;

  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    select: { id: true, title: true, date: true },
  });

  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const start = schedule.date;
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const uid = `${schedule.id}@seattlebasketball`;
  const dtstamp = formatIcsUtc(new Date());
  const dtstart = formatIcsUtc(start);
  const dtend = formatIcsUtc(end);

  const summary = escapeIcsText(schedule.title);
  const description = escapeIcsText("Seattle Basketball");

  const ics =
    "BEGIN:VCALENDAR\r\n" +
    "VERSION:2.0\r\n" +
    "PRODID:-//SeattleBasketball//Schedule//EN\r\n" +
    "CALSCALE:GREGORIAN\r\n" +
    "METHOD:PUBLISH\r\n" +
    "BEGIN:VEVENT\r\n" +
    `UID:${uid}\r\n` +
    `DTSTAMP:${dtstamp}\r\n` +
    `DTSTART:${dtstart}\r\n` +
    `DTEND:${dtend}\r\n` +
    `SUMMARY:${summary}\r\n` +
    `DESCRIPTION:${description}\r\n` +
    "END:VEVENT\r\n" +
    "END:VCALENDAR\r\n";

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename=seattle-basketball-${schedule.id}.ics`,
      "cache-control": "no-store",
    },
  });
}
