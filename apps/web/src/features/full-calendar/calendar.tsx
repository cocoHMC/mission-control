import React from "react";
import { CalendarBody } from "@/features/full-calendar/calendar-body";
import { CalendarProvider } from "@/features/full-calendar/contexts/calendar-context";
import { DndProvider } from "@/features/full-calendar/contexts/dnd-context";
import { CalendarHeader } from "@/features/full-calendar/header/calendar-header";
import { getEvents, getUsers } from "@/features/full-calendar/requests";

async function getCalendarData() {
  return {
    events: await getEvents(),
    users: await getUsers(),
  };
}

export async function Calendar() {
  const { events, users } = await getCalendarData();

  return (
    <CalendarProvider events={events} users={users} view="month">
      <DndProvider>
        <div className="w-full border rounded-xl">
          <CalendarHeader />
          <CalendarBody />
        </div>
      </DndProvider>
    </CalendarProvider>
  );
}
