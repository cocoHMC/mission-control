"use client";

import type React from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

import { Button } from "@/features/full-calendar/ui/button";
import {
  slideFromLeft,
  slideFromRight,
  transition,
} from "@/features/full-calendar/animations";
import { useCalendar } from "@/features/full-calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@/features/full-calendar/dialogs/add-edit-event-dialog";
import { DateNavigator } from "@/features/full-calendar/header/date-navigator";
import FilterEvents from "@/features/full-calendar/header/filter";
import { TodayButton } from "@/features/full-calendar/header/today-button";
import { UserSelect } from "@/features/full-calendar/header/user-select";
import { Settings } from "@/features/full-calendar/settings/settings";
import { useMediaQuery } from "@/features/full-calendar/hooks";
import { cn } from "@/lib/utils";
import Views from "./view-tabs";

export function CalendarHeader({ extraActions }: { extraActions?: React.ReactNode }) {
  const { view, events, selectedDate } = useCalendar();
  // At ~1280px widths the header can become dense enough to overlap controls.
  // We keep a compact header until the layout has enough room.
  const showExpanded = useMediaQuery("(min-width: 1440px)");
  const compact = !showExpanded;

  return (
    <div
      className={cn(
        "border-b",
        "px-3 py-2 sm:px-4",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <motion.div
          className={cn("flex min-w-0 items-center", compact ? "gap-1.5" : "gap-2")}
          variants={slideFromLeft}
          initial="initial"
          animate="animate"
          transition={transition}
        >
          <TodayButton />
          <DateNavigator view={view} events={events} compact={compact} />
        </motion.div>

        {showExpanded ? (
          <div className="hidden min-w-0 flex-1 justify-center px-2 xl:flex">
            <Views />
          </div>
        ) : null}

        <motion.div
          className={cn("flex shrink-0 items-center", compact ? "gap-1.5" : "gap-2")}
          variants={slideFromRight}
          initial="initial"
          animate="animate"
          transition={transition}
        >
          {extraActions ? <div className="flex items-center gap-2">{extraActions}</div> : null}
          {showExpanded ? <UserSelect /> : null}
          <Settings />
          <FilterEvents />
          <AddEditEventDialog startDate={selectedDate}>
            <Button size={compact ? "icon" : "sm"} aria-label="New task">
              <Plus className="h-4 w-4" />
              {!compact ? "New task" : null}
            </Button>
          </AddEditEventDialog>
        </motion.div>
      </div>
    </div>
  );
}
