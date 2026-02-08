"use client";

import { format, parseISO } from "date-fns";
import { Calendar, Clock, Text, User } from "lucide-react";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/features/full-calendar/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/features/full-calendar/ui/dialog";
import { ScrollArea } from "@/features/full-calendar/ui/scroll-area";
import { useCalendar } from "@/features/full-calendar/contexts/calendar-context";
import { AddEditEventDialog } from "@/features/full-calendar/dialogs/add-edit-event-dialog";
import { formatTime } from "@/features/full-calendar/helpers";
import type { IEvent } from "@/features/full-calendar/interfaces";

interface IProps {
  event: IEvent;
  children: ReactNode;
}

export function EventDetailsDialog({ event, children }: IProps) {
  const startDate = parseISO(event.startDate);
  const endDate = parseISO(event.endDate);
  const { use24HourFormat, removeEvent, openEvent } = useCalendar();

  if (openEvent) {
    const onActivate = () => openEvent(event);
    if (isValidElement(children)) {
      const existingClick = (children.props as any)?.onClick as
        | ((e: any) => void)
        | undefined;
      const existingKeyDown = (children.props as any)?.onKeyDown as
        | ((e: any) => void)
        | undefined;

      return cloneElement(children as any, {
        onClick: (e: any) => {
          existingClick?.(e);
          if (e?.defaultPrevented) return;
          onActivate();
        },
        onKeyDown: (e: any) => {
          existingKeyDown?.(e);
          if (e?.defaultPrevented) return;
          if (e?.key === "Enter" || e?.key === " ") {
            e.preventDefault?.();
            onActivate();
          }
        },
      });
    }

    return (
      <span role="button" tabIndex={0} onClick={onActivate}>
        {children}
      </span>
    );
  }

  const deleteEvent = (eventId: string) => {
    try {
      removeEvent(eventId);
      toast.success("Event deleted successfully.");
    } catch {
      toast.error("Error deleting event.");
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{event.title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[80vh]">
          <div className="space-y-4 p-4">
            <div className="flex items-start gap-2">
              <User className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Responsible</p>
                <p className="text-sm text-muted-foreground">
                  {event.user.name}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Calendar className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Start Date</p>
                <p className="text-sm text-muted-foreground">
                  {format(startDate, "EEEE dd MMMM")}
                  <span className="mx-1">at</span>
                  {formatTime(parseISO(event.startDate), use24HourFormat)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Clock className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">End Date</p>
                <p className="text-sm text-muted-foreground">
                  {format(endDate, "EEEE dd MMMM")}
                  <span className="mx-1">at</span>
                  {formatTime(parseISO(event.endDate), use24HourFormat)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2">
              <Text className="mt-1 size-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Description</p>
                <p className="text-sm text-muted-foreground">
                  {event.description}
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
        <div className="flex justify-end gap-2">
          <AddEditEventDialog event={event}>
            <Button variant="outline">Edit</Button>
          </AddEditEventDialog>
          <Button
            variant="destructive"
            onClick={() => {
              deleteEvent(event.id);
            }}
          >
            Delete
          </Button>
        </div>
        <DialogClose />
      </DialogContent>
    </Dialog>
  );
}
