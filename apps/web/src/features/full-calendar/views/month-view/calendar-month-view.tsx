import { motion } from "framer-motion";
import { useMemo } from "react";
import {
	staggerContainer,
	transition,
} from "@/features/full-calendar/animations";
import { useCalendar } from "@/features/full-calendar/contexts/calendar-context";

import {
	calculateMonthEventPositions,
	getCalendarCells,
} from "@/features/full-calendar/helpers";

import type { IEvent } from "@/features/full-calendar/interfaces";
import { DayCell } from "@/features/full-calendar/views/month-view/day-cell";

interface IProps {
	singleDayEvents: IEvent[];
	multiDayEvents: IEvent[];
}

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarMonthView({ singleDayEvents, multiDayEvents }: IProps) {
	const { selectedDate } = useCalendar();

	const allEvents = [...multiDayEvents, ...singleDayEvents];

	const cells = useMemo(() => getCalendarCells(selectedDate), [selectedDate]);

	const eventPositions = useMemo(
		() =>
			calculateMonthEventPositions(
				multiDayEvents,
				singleDayEvents,
				selectedDate,
			),
		[multiDayEvents, singleDayEvents, selectedDate],
	);

	return (
		<motion.div
			initial="initial"
			animate="animate"
			variants={staggerContainer}
			className="h-full min-h-0"
		>
			<div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-background">
				<div className="grid shrink-0 grid-cols-7 divide-x border-b bg-[var(--surface)]">
					{WEEK_DAYS.map((day, index) => (
						<motion.div
							key={day}
							className="flex items-center justify-center py-2"
							initial={{ opacity: 0, y: -10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: index * 0.05, ...transition }}
						>
							<span className="text-xs font-medium text-t-quaternary">{day}</span>
						</motion.div>
					))}
				</div>

				{/* Fixed min row heights + scroll when the viewport is short (mobile/tablet). */}
				<div className="mc-scroll grid min-h-0 flex-1 grid-cols-7 auto-rows-[minmax(4.75rem,1fr)] overflow-auto sm:auto-rows-[minmax(6rem,1fr)] lg:auto-rows-[minmax(10rem,1fr)]">
					{cells.map((cell, index) => (
						<DayCell
							key={cell.date.toISOString()}
							cell={cell}
							events={allEvents}
							eventPositions={eventPositions}
							isFirstRow={index < 7}
						/>
					))}
				</div>
			</div>
		</motion.div>
	);
}
