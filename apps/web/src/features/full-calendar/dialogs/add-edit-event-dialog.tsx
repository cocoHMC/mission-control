import { zodResolver } from "@hookform/resolvers/zod";
import { addMinutes, set } from "date-fns";
import {
  cloneElement,
  isValidElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/features/full-calendar/ui/button";
import { DateTimePicker } from "@/features/full-calendar/ui/date-time-picker";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/features/full-calendar/ui/form";
import { Input } from "@/features/full-calendar/ui/input";
import {
  Modal,
  ModalClose,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTrigger,
} from "@/features/full-calendar/ui/responsive-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/features/full-calendar/ui/select";
import { Textarea } from "@/features/full-calendar/ui/textarea";
import { COLORS } from "@/features/full-calendar/constants";
import { useCalendar } from "@/features/full-calendar/contexts/calendar-context";
import { useDisclosure } from "@/features/full-calendar/hooks";
import type { IEvent } from "@/features/full-calendar/interfaces";
import { eventSchema, type TEventFormData } from "@/features/full-calendar/schemas";
import { cn } from "@/lib/utils";

interface IProps {
  children: ReactNode;
  startDate?: Date;
  startTime?: { hour: number; minute: number };
  event?: IEvent;
}

function computeInitialDates({
  isEditing,
  event,
  startDate,
  startTime,
}: {
  isEditing: boolean;
  event?: IEvent;
  startDate?: Date;
  startTime?: { hour: number; minute: number };
}) {
  if (!isEditing && !event) {
    if (!startDate) {
      const now = new Date();
      return { startDate: now, endDate: addMinutes(now, 30) };
    }
    const start = startTime
      ? set(new Date(startDate), {
          hours: startTime.hour,
          minutes: startTime.minute,
          seconds: 0,
          milliseconds: 0,
        })
      : set(new Date(startDate), { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
    const end = addMinutes(start, 30);
    return { startDate: start, endDate: end };
  }

  return {
    startDate: new Date(event!.startDate),
    endDate: new Date(event!.endDate),
  };
}

function TriggerBridge({
  children,
  onActivate,
}: {
  children: ReactNode;
  onActivate: () => void;
}) {
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

function AddEditEventDialogModal({
  children,
  startDate,
  startTime,
  event,
}: IProps) {
  const { isOpen, onClose, onToggle } = useDisclosure();
  const { addEvent, updateEvent, selectedUserId, users } = useCalendar();
  const isEditing = !!event;
  const [submitting, setSubmitting] = useState(false);

  const colorDotClass: Record<string, string> = {
    blue: "bg-blue-600 dark:bg-blue-700",
    green: "bg-green-600 dark:bg-green-700",
    red: "bg-red-600 dark:bg-red-700",
    yellow: "bg-yellow-600 dark:bg-yellow-700",
    purple: "bg-purple-600 dark:bg-purple-700",
    orange: "bg-orange-600 dark:bg-orange-700",
    gray: "bg-gray-600 dark:bg-gray-700",
  };

  const initialDates = useMemo(() => {
    return computeInitialDates({ isEditing, event, startDate, startTime });
  }, [event, isEditing, startDate, startTime]);

  const form = useForm<TEventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: event?.title ?? "",
      description: event?.description ?? "",
      startDate: initialDates.startDate,
      endDate: initialDates.endDate,
      color: event?.color ?? "blue",
    },
  });

  useEffect(() => {
    form.reset({
      title: event?.title ?? "",
      description: event?.description ?? "",
      startDate: initialDates.startDate,
      endDate: initialDates.endDate,
      color: event?.color ?? "blue",
    });
  }, [event, initialDates, form]);

  const onSubmit = async (values: TEventFormData) => {
    try {
      setSubmitting(true);
      const startIso = values.startDate.toISOString();
      const endIso = values.endDate.toISOString();

      if (isEditing && event) {
        const updated: IEvent = {
          ...event,
          title: values.title,
          description: values.description,
          startDate: startIso,
          endDate: endIso,
          color: values.color,
        };

        updateEvent(updated);
        toast.success("Event updated successfully");
        onClose();
        form.reset();
        return;
      }

      const assignedUser =
        selectedUserId !== "all"
          ? users.find((u) => u.id === selectedUserId) || null
          : null;

      await addEvent({
        title: values.title,
        description: values.description,
        startDate: startIso,
        endDate: endIso,
        color: values.color,
        user:
          assignedUser || {
            id: "unassigned",
            name: "Unassigned",
            picturePath: null,
          },
        assigneeIds: assignedUser ? [assignedUser.id] : [],
      });

      toast.success("Event created successfully");
      onClose();
      form.reset();
    } catch (error) {
      console.error(`Error ${isEditing ? "editing" : "adding"} event:`, error);
      toast.error(`Failed to ${isEditing ? "edit" : "add"} event`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onOpenChange={onToggle} modal={false}>
      <ModalTrigger asChild>{children}</ModalTrigger>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>{isEditing ? "Edit Event" : "Add New Event"}</ModalTitle>
          <ModalDescription>
            {isEditing
              ? "Modify your existing event."
              : "Create a new event for your calendar."}
          </ModalDescription>
        </ModalHeader>

        <Form {...form}>
          <form
            id="event-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid gap-4 py-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel htmlFor="title" className="required">
                    Title
                  </FormLabel>
                  <FormControl>
                    <Input
                      id="title"
                      placeholder="Enter a title"
                      {...field}
                      className={fieldState.invalid ? "border-red-500" : ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="startDate"
              render={({ field }) => (
                <DateTimePicker form={form} field={field} />
              )}
            />
            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <DateTimePicker form={form} field={field} />
              )}
            />
            <FormField
              control={form.control}
              name="color"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel className="required">Variant</FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        className={`w-full ${
                          fieldState.invalid ? "border-red-500" : ""
                        }`}
                      >
                        <SelectValue placeholder="Select a variant" />
                      </SelectTrigger>
                      <SelectContent>
                        {COLORS.map((color) => (
                          <SelectItem value={color} key={color}>
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  "size-3.5 rounded-full",
                                  colorDotClass[color] ?? colorDotClass.blue,
                                )}
                              />
                              {color}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel className="required">Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Enter a description"
                      className={fieldState.invalid ? "border-red-500" : ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <ModalFooter className="flex justify-end gap-2">
          <ModalClose asChild>
            <Button type="button" variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </ModalClose>
          <Button form="event-form" type="submit" disabled={submitting}>
            {submitting
              ? isEditing
                ? "Saving…"
                : "Creating…"
              : isEditing
                ? "Save Changes"
                : "Create Event"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function AddEditEventDialog({
  children,
  startDate,
  startTime,
  event,
}: IProps) {
  const { openCreateEvent, openEvent } = useCalendar();
  const isEditing = Boolean(event);

  if (openEvent && isEditing && event) {
    return <TriggerBridge onActivate={() => openEvent(event)}>{children}</TriggerBridge>;
  }

  if (openCreateEvent && !isEditing) {
    const { startDate: start, endDate: end } = computeInitialDates({
      isEditing: false,
      event,
      startDate,
      startTime,
    });
    return (
      <TriggerBridge onActivate={() => openCreateEvent({ startDate: start, endDate: end })}>
        {children}
      </TriggerBridge>
    );
  }

  return (
    <AddEditEventDialogModal
      startDate={startDate}
      startTime={startTime}
      event={event}
    >
      {children}
    </AddEditEventDialogModal>
  );
}
