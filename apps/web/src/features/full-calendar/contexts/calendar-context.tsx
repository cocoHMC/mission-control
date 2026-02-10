"use client";

import type React from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { useLocalStorage } from "@/features/full-calendar/hooks";
import type { IEvent, IUser } from "@/features/full-calendar/interfaces";
import type { TCalendarView, TEventColor } from "@/features/full-calendar/types";

interface ICalendarContext {
  selectedDate: Date;
  view: TCalendarView;
  setView: (view: TCalendarView) => void;
  openEvent?: (event: IEvent) => void;
  openCreateEvent?: (opts: { startDate: Date; endDate: Date }) => void;
  agendaModeGroupBy: "date" | "color";
  setAgendaModeGroupBy: (groupBy: "date" | "color") => void;
  use24HourFormat: boolean;
  toggleTimeFormat: () => void;
  setSelectedDate: (date: Date | undefined) => void;
  selectedUserId: IUser["id"] | "all";
  setSelectedUserId: (userId: IUser["id"] | "all") => void;
  badgeVariant: "dot" | "colored";
  setBadgeVariant: (variant: "dot" | "colored") => void;
  selectedColors: TEventColor[];
  filterEventsBySelectedColors: (colors: TEventColor) => void;
  filterEventsBySelectedUser: (userId: IUser["id"] | "all") => void;
  users: IUser[];
  events: IEvent[];
  addEvent: (event: Omit<IEvent, "id">) => Promise<void>;
  updateEvent: (event: IEvent) => void;
  removeEvent: (eventId: IEvent["id"]) => void;
  clearFilter: () => void;
}

interface CalendarSettings {
  badgeVariant: "dot" | "colored";
  view: TCalendarView;
  use24HourFormat: boolean;
  agendaModeGroupBy: "date" | "color";
}

const DEFAULT_SETTINGS: CalendarSettings = {
  badgeVariant: "colored",
  view: "day",
  use24HourFormat: true,
  agendaModeGroupBy: "date",
};

const CalendarContext = createContext({} as ICalendarContext);

export function CalendarProvider({
  children,
  users,
  events,
  badge = "colored",
  view = "day",
  onAddEvent,
  onUpdateEvent,
  onRemoveEvent,
  onOpenEvent,
  onOpenCreateEvent,
}: {
  children: React.ReactNode;
  users: IUser[];
  events: IEvent[];
  view?: TCalendarView;
  badge?: "dot" | "colored";
  onAddEvent?: (event: Omit<IEvent, "id">) => Promise<void> | void;
  onUpdateEvent?: (event: IEvent) => Promise<void> | void;
  onRemoveEvent?: (eventId: IEvent["id"]) => Promise<void> | void;
  onOpenEvent?: (event: IEvent) => void;
  onOpenCreateEvent?: (opts: { startDate: Date; endDate: Date }) => void;
}) {
  // Keep the default settings object referentially stable; the localStorage hook
  // depends on stable snapshots to avoid render loops.
  const defaultSettings = useMemo(
    () => ({
      ...DEFAULT_SETTINGS,
      badgeVariant: badge,
      view: view,
    }),
    [badge, view],
  );

  const [settings, setSettings] = useLocalStorage<CalendarSettings>(
    "calendar-settings",
    defaultSettings,
  );

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState<IUser["id"] | "all">(
    "all",
  );
  const [selectedColors, setSelectedColors] = useState<TEventColor[]>([]);

  const setBadgeVariant = (variant: "dot" | "colored") => {
    setSettings({
      ...settings,
      badgeVariant: variant,
    });
  };

  const setView = (newView: TCalendarView) => {
    setSettings({
      ...settings,
      view: newView,
    });
  };

  const toggleTimeFormat = () => {
    setSettings({
      ...settings,
      use24HourFormat: !settings.use24HourFormat,
    });
  };

  const setAgendaModeGroupBy = (groupBy: "date" | "color") => {
    setSettings({
      ...settings,
      agendaModeGroupBy: groupBy,
    });
  };

  const filterEventsBySelectedColors = (color: TEventColor) => {
    const isColorSelected = selectedColors.includes(color);
    const newColors = isColorSelected
      ? selectedColors.filter((c) => c !== color)
      : [...selectedColors, color];
    setSelectedColors(newColors);
  };

  const filterEventsBySelectedUser = (userId: IUser["id"] | "all") => {
    setSelectedUserId(userId);
  };

  const handleSelectDate = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
  };

  const filteredEvents = useMemo(() => {
    const list = Array.isArray(events) ? events : [];

    const byUser =
      selectedUserId === "all"
        ? list
        : list.filter(
            (event) =>
              event.user.id === selectedUserId ||
              (Array.isArray(event.assigneeIds) &&
                event.assigneeIds.includes(selectedUserId)),
          );

    if (!selectedColors.length) return byUser;
    return byUser.filter((event) => selectedColors.includes(event.color));
  }, [events, selectedColors, selectedUserId]);

  const addEvent = async (event: Omit<IEvent, "id">) => {
    await onAddEvent?.(event);
  };

  const updateEvent = (event: IEvent) => {
    const updated = {
      ...event,
      startDate: new Date(event.startDate).toISOString(),
      endDate: new Date(event.endDate).toISOString(),
    };
    const res = onUpdateEvent?.(updated);
    if (res && typeof (res as any).catch === "function") {
      (res as Promise<void>).catch(() => {});
    }
  };

  const removeEvent = (eventId: IEvent["id"]) => {
    const res = onRemoveEvent?.(eventId);
    if (res && typeof (res as any).catch === "function") {
      (res as Promise<void>).catch(() => {});
    }
  };

  const clearFilter = () => {
    setSelectedColors([]);
    setSelectedUserId("all");
  };

  const value: ICalendarContext = {
    selectedDate,
    setSelectedDate: handleSelectDate,
    selectedUserId,
    setSelectedUserId,
    badgeVariant: settings.badgeVariant,
    setBadgeVariant,
    users,
    selectedColors,
    filterEventsBySelectedColors,
    filterEventsBySelectedUser,
    events: filteredEvents,
    view: settings.view,
    use24HourFormat: settings.use24HourFormat,
    toggleTimeFormat,
    setView,
    openEvent: onOpenEvent,
    openCreateEvent: onOpenCreateEvent,
    agendaModeGroupBy: settings.agendaModeGroupBy,
    setAgendaModeGroupBy,
    addEvent,
    updateEvent,
    removeEvent,
    clearFilter,
  };

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar(): ICalendarContext {
  const context = useContext(CalendarContext);
  if (!context)
    throw new Error("useCalendar must be used within a CalendarProvider.");
  return context;
}
