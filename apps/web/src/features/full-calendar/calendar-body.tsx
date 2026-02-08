"use client";

import { isSameDay, parseISO } from "date-fns";
import { motion } from "framer-motion";
import { fadeIn, transition } from "@/features/full-calendar/animations";
import { useCalendar } from "@/features/full-calendar/contexts/calendar-context";
import { AgendaEvents } from "@/features/full-calendar/views/agenda-view/agenda-events";
import { CalendarMonthView } from "@/features/full-calendar/views/month-view/calendar-month-view";
import { CalendarDayView } from "@/features/full-calendar/views/week-and-day-view/calendar-day-view";
import { CalendarWeekView } from "@/features/full-calendar/views/week-and-day-view/calendar-week-view";
import { CalendarYearView } from "@/features/full-calendar/views/year-view/calendar-year-view";

export function CalendarBody() {
  const { view, events } = useCalendar();

  const singleDayEvents = events.filter((event) => {
    const startDate = parseISO(event.startDate);
    const endDate = parseISO(event.endDate);
    return isSameDay(startDate, endDate);
  });

  const multiDayEvents = events.filter((event) => {
    const startDate = parseISO(event.startDate);
    const endDate = parseISO(event.endDate);
    return !isSameDay(startDate, endDate);
  });

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden">
      <motion.div
        key={view}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={fadeIn}
        transition={transition}
        className="h-full min-h-0"
      >
        {view === "month" && (
          <CalendarMonthView
            singleDayEvents={singleDayEvents}
            multiDayEvents={multiDayEvents}
          />
        )}
        {view === "week" && (
          <CalendarWeekView
            singleDayEvents={singleDayEvents}
            multiDayEvents={multiDayEvents}
          />
        )}
        {view === "day" && (
          <CalendarDayView
            singleDayEvents={singleDayEvents}
            multiDayEvents={multiDayEvents}
          />
        )}
        {view === "year" && (
          <CalendarYearView
            singleDayEvents={singleDayEvents}
            multiDayEvents={multiDayEvents}
          />
        )}
        {view === "agenda" && (
          <motion.div
            key="agenda"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={fadeIn}
            transition={transition}
          >
            <AgendaEvents />
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
