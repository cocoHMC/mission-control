"use client";

import { cva } from "class-variance-authority";
import { isToday, startOfDay, isSunday, isSameMonth } from "date-fns";
import { motion } from "framer-motion";
import { useMemo, useCallback } from "react";

import { cn } from "@/lib/utils";
import { transition } from "@/features/full-calendar/animations";
import { EventListDialog } from "@/features/full-calendar/dialogs/events-list-dialog";
import { DroppableArea } from "@/features/full-calendar/dnd/droppable-area";
import { getMonthCellEvents } from "@/features/full-calendar/helpers";
import { useMediaQuery } from "@/features/full-calendar/hooks";
import type { ICalendarCell, IEvent } from "@/features/full-calendar/interfaces";
import { EventBullet } from "@/features/full-calendar/views/month-view/event-bullet";
import { MonthEventBadge } from "@/features/full-calendar/views/month-view/month-event-badge";
import { Button } from "@/features/full-calendar/ui/button";
import { Plus } from "lucide-react";
import { AddEditEventDialog } from "@/features/full-calendar/dialogs/add-edit-event-dialog";

interface IProps {
  cell: ICalendarCell;
  events: IEvent[];
  eventPositions: Record<string, number>;
  isFirstRow?: boolean;
}

export const dayCellVariants = cva("text-white", {
  variants: {
    color: {
      blue: "bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-400 ",
      green:
        "bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-400",
      red: "bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-400",
      yellow:
        "bg-yellow-600 dark:bg-yellow-500 hover:bg-yellow-700 dark:hover:bg-yellow-400",
      purple:
        "bg-purple-600 dark:bg-purple-500 hover:bg-purple-700 dark:hover:bg-purple-400",
      orange:
        "bg-orange-600 dark:bg-orange-500 hover:bg-orange-700 dark:hover:bg-orange-400",
      gray: "bg-gray-600 dark:bg-gray-500 hover:bg-gray-700 dark:hover:bg-gray-400",
    },
  },
  defaultVariants: {
    color: "blue",
  },
});

const MAX_VISIBLE_EVENTS = 3;

export function DayCell({ cell, events, eventPositions, isFirstRow }: IProps) {
  const { day, currentMonth, date } = cell;
  // Align with Tailwind's `md` breakpoint (>= 768px).
  const isMobile = useMediaQuery("(max-width: 767px)");

  // Memoize cellEvents and currentCellMonth for performance
  const { cellEvents, currentCellMonth } = useMemo(() => {
    const cellEvents = getMonthCellEvents(date, events, eventPositions);
    const currentCellMonth = startOfDay(
      new Date(date.getFullYear(), date.getMonth(), 1),
    );
    return { cellEvents, currentCellMonth };
  }, [date, events, eventPositions]);

  // Memoize event rendering for each position with animation
  const renderEventAtPosition = useCallback(
    (position: number) => {
      const event = cellEvents.find((e) => e.position === position);
      if (!event) {
        return (
          <motion.div
            key={`empty-${position}`}
            className="lg:flex-1"
            initial={false}
            animate={false}
          />
        );
      }
      const showBullet = isSameMonth(
        new Date(event.startDate),
        currentCellMonth,
      );

      return (
        <motion.div
          key={`event-${event.id}-${position}`}
          className="md:flex-1"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: position * 0.1, ...transition }}
        >
          {showBullet && (
            <EventBullet className="md:hidden" color={event.color} />
          )}
          <MonthEventBadge
            className="hidden md:flex"
            event={event}
            cellDate={startOfDay(date)}
          />
        </motion.div>
      );
    },
    [cellEvents, currentCellMonth, date],
  );

  const showMoreCount = cellEvents.length - MAX_VISIBLE_EVENTS;

  const showMobileMore = isMobile && currentMonth && showMoreCount > 0;
  const showDesktopMore = !isMobile && currentMonth && showMoreCount > 0;

  const cellContent = useMemo(
    () => (
      <motion.div
        className={cn(
          "group flex h-full md:min-h-40 flex-col gap-1 border-l border-t",
          isSunday(date) && "border-l-0",
          isFirstRow && "border-t-0",
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={transition}
      >
        <DroppableArea date={date} className="relative w-full h-full py-2">
          <div className="flex items-start justify-between gap-2 px-1 lg:px-2">
            <motion.span
              className={cn(
                "h-6 text-xs font-semibold",
                !currentMonth && "opacity-20",
                isToday(date) &&
                  "flex w-6 translate-x-1 items-center justify-center rounded-full bg-primary px-0 font-bold text-primary-foreground",
              )}
            >
              {day}
            </motion.span>

            {/* Always allow creating another task on this day (even if there are already events). */}
            <AddEditEventDialog startDate={date}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  "h-7 w-7 rounded-full transition-opacity",
                  !currentMonth
                    ? "pointer-events-none opacity-0"
                    : isMobile
                      ? "opacity-100"
                      : "opacity-70 hover:opacity-100 group-hover:opacity-100 focus-visible:opacity-100",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                aria-label="Add task"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </AddEditEventDialog>
          </div>

          <motion.div
            className={cn(
              "flex h-fit gap-1 px-2 mt-1 md:h-[94px] md:flex-col md:gap-2 md:px-0",
              !currentMonth && "opacity-50",
            )}
          >
            {cellEvents.length === 0 && !isMobile ? (
              <div className="w-full h-full flex justify-center items-center group">
                <AddEditEventDialog startDate={date}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "border transition-opacity duration-200",
                      "opacity-0 pointer-events-none",
                      "group-hover:opacity-100 group-hover:pointer-events-auto",
                    )}
                  >
                    <Plus className="h-4 w-4" />
                    <span className="max-sm:hidden">Add Event</span>
                  </Button>
                </AddEditEventDialog>
              </div>
            ) : (
              [0, 1, 2].map(renderEventAtPosition)
            )}
          </motion.div>

          {/* On busy days, keep an "Add" affordance on hover so users can add more work quickly. */}
          {!isMobile && currentMonth && cellEvents.length > 0 ? (
            <div className="absolute bottom-2 left-2">
              <AddEditEventDialog startDate={date}>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-7 rounded-full border border-border bg-background/80 px-2 text-xs font-semibold",
                    "opacity-0 pointer-events-none shadow-xs backdrop-blur transition-opacity duration-150",
                    "group-hover:opacity-100 focus-visible:opacity-100",
                    "group-hover:pointer-events-auto focus-visible:pointer-events-auto",
                  )}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Add task"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="ml-1">Add</span>
                </Button>
              </AddEditEventDialog>
            </div>
          ) : null}

          {showMobileMore && (
            <div className="flex justify-end items-end mx-2">
              <span className="text-[0.6rem] font-semibold text-accent-foreground">
                +{showMoreCount}
              </span>
            </div>
          )}

          {showDesktopMore && (
            <motion.div
              className={cn(
                "h-4.5 px-1.5 my-2 text-end text-xs font-semibold text-muted-foreground",
                !currentMonth && "opacity-50",
              )}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, ...transition }}
            >
              <EventListDialog date={date} events={cellEvents} />
            </motion.div>
          )}
        </DroppableArea>
      </motion.div>
    ),
    [
      date,
      day,
      currentMonth,
      cellEvents,
      showMobileMore,
      showDesktopMore,
      showMoreCount,
      renderEventAtPosition,
      isMobile,
      isFirstRow,
    ],
  );

  if (isMobile && currentMonth) {
    return (
      <EventListDialog date={date} events={cellEvents}>
        {cellContent}
      </EventListDialog>
    );
  }

  return cellContent;
}
