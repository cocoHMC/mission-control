import { endOfWeek, formatDate, startOfWeek } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/features/full-calendar/ui/badge";
import { Button } from "@/features/full-calendar/ui/button";
import { buttonHover, transition } from "@/features/full-calendar/animations";
import { useCalendar } from "@/features/full-calendar/contexts/calendar-context";

import {
  getEventsCount,
  navigateDate,
  rangeText,
} from "@/features/full-calendar/helpers";

import type { IEvent } from "@/features/full-calendar/interfaces";
import type { TCalendarView } from "@/features/full-calendar/types";
import { cn } from "@/lib/utils";

interface IProps {
  view: TCalendarView;
  events: IEvent[];
  compact?: boolean;
}

const MotionButton = motion.create(Button);
const MotionBadge = motion.create(Badge);

export function DateNavigator({ view, events, compact }: IProps) {
  const { selectedDate, setSelectedDate } = useCalendar();

  const eventCount = useMemo(
    () => getEventsCount(events, selectedDate, view),
    [events, selectedDate, view],
  );

  const displayLabel = useMemo(() => {
    if (view === "month" || view === "agenda") {
      return formatDate(selectedDate, "MMM yyyy");
    }
    if (view === "year") {
      return formatDate(selectedDate, "yyyy");
    }
    if (view === "week") {
      const start = startOfWeek(selectedDate);
      const end = endOfWeek(selectedDate);
      const sameMonth =
        start.getMonth() === end.getMonth() &&
        start.getFullYear() === end.getFullYear();
      const sameYear = start.getFullYear() === end.getFullYear();

      if (sameMonth) {
        return `${formatDate(start, "MMM d")}–${formatDate(end, "d, yyyy")}`;
      }
      if (sameYear) {
        return `${formatDate(start, "MMM d")}–${formatDate(end, "MMM d, yyyy")}`;
      }
      return `${formatDate(start, "MMM d, yyyy")}–${formatDate(end, "MMM d, yyyy")}`;
    }
    return formatDate(selectedDate, "MMM d, yyyy");
  }, [selectedDate, view]);

  const handlePrevious = () =>
    setSelectedDate(navigateDate(selectedDate, view, "previous"));
  const handleNext = () =>
    setSelectedDate(navigateDate(selectedDate, view, "next"));

  return (
    <div className="flex min-w-0 items-center gap-2">
      <MotionButton
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handlePrevious}
        variants={buttonHover}
        whileHover="hover"
        whileTap="tap"
        aria-label="Previous"
      >
        <ChevronLeft className="h-4 w-4" />
      </MotionButton>

      <motion.div
        className="min-w-0"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        transition={transition}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2",
            compact ? "text-sm" : "text-base",
          )}
        >
          <div className="truncate font-semibold">{displayLabel}</div>
          {!compact ? (
            <AnimatePresence mode="wait">
              <MotionBadge
                key={eventCount}
                variant="secondary"
                className="h-6"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={transition}
              >
                {eventCount} {eventCount === 1 ? "event" : "events"}
              </MotionBadge>
            </AnimatePresence>
          ) : null}
        </div>
        <div className="sr-only">{rangeText(view, selectedDate)}</div>
      </motion.div>

      <MotionButton
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handleNext}
        variants={buttonHover}
        whileHover="hover"
        whileTap="tap"
        aria-label="Next"
      >
        <ChevronRight className="h-4 w-4" />
      </MotionButton>
    </div>
  );
}
