import { addMinutes, format, set } from "date-fns";
import type { ReactNode } from "react";
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from "@/features/full-calendar/ui/responsive-modal";
import { cn } from "@/lib/utils";
import { useCalendar } from "@/features/full-calendar/contexts/calendar-context";
import { formatTime } from "@/features/full-calendar/helpers";
import type { IEvent } from "@/features/full-calendar/interfaces";
import { dayCellVariants } from "@/features/full-calendar/views/month-view/day-cell";
import { EventBullet } from "@/features/full-calendar/views/month-view/event-bullet";
import { EventDetailsDialog } from "@/features/full-calendar/dialogs/event-details-dialog";
import { Button } from "@/features/full-calendar/ui/button";
import { Plus } from "lucide-react";

interface EventListDialogProps {
  date: Date;
  events: IEvent[];
  maxVisibleEvents?: number;
  children?: ReactNode;
}

export function EventListDialog({
  date,
  events,
  maxVisibleEvents = 3,
  children,
}: EventListDialogProps) {
  const cellEvents = events;
  const hiddenEventsCount = Math.max(cellEvents.length - maxVisibleEvents, 0);
  const { badgeVariant, use24HourFormat, openEvent, openCreateEvent } =
    useCalendar();

  const defaultTrigger = (
    <span className="cursor-pointer">
      <span className="sm:hidden">+{hiddenEventsCount}</span>
      <span className="hidden sm:inline py-0.5 px-2 my-1 rounded-xl border">
        {hiddenEventsCount}
        <span className="mx-1">more...</span>
      </span>
    </span>
  );

  return (
    <Modal>
      <ModalTrigger asChild>{children || defaultTrigger}</ModalTrigger>
      <ModalContent className="sm:max-w-[425px]">
        <ModalHeader>
          <ModalTitle className="my-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <EventBullet color={cellEvents[0]?.color} className="" />
                <p className="truncate text-sm font-medium">
                  Events on {format(date, "EEEE, MMMM d, yyyy")}
                </p>
              </div>

              {openCreateEvent ? (
                <ModalClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const start = set(new Date(date), {
                        hours: 9,
                        minutes: 0,
                        seconds: 0,
                        milliseconds: 0,
                      });
                      const end = addMinutes(start, 30);
                      openCreateEvent({ startDate: start, endDate: end });
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add task
                  </Button>
                </ModalClose>
              ) : null}
            </div>
          </ModalTitle>
        </ModalHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {cellEvents.length > 0 ? (
            cellEvents.map((event) =>
              openEvent ? (
                <ModalClose key={event.id} asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md border p-2 text-left hover:bg-muted cursor-pointer",
                      {
                        [dayCellVariants({ color: event.color })]:
                          badgeVariant === "colored",
                      },
                    )}
                    onClick={() => openEvent(event)}
                  >
                    <EventBullet color={event.color} />
                    <div className="flex w-full items-center justify-between">
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-xs">
                        {formatTime(event.startDate, use24HourFormat)}
                      </p>
                    </div>
                  </button>
                </ModalClose>
              ) : (
                <EventDetailsDialog event={event} key={event.id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 p-2 border rounded-md hover:bg-muted cursor-pointer",
                      {
                        [dayCellVariants({ color: event.color })]:
                          badgeVariant === "colored",
                      },
                    )}
                  >
                    <EventBullet color={event.color} />
                    <div className="flex justify-between items-center w-full">
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="text-xs">
                        {formatTime(event.startDate, use24HourFormat)}
                      </p>
                    </div>
                  </div>
                </EventDetailsDialog>
              ),
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              No events for this date.
            </p>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
