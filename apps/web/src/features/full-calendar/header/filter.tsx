import { CheckIcon, Filter, RefreshCcw } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/features/full-calendar/ui/dropdown-menu";
import { Button } from "@/features/full-calendar/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/features/full-calendar/ui/avatar";
import { useCalendar } from "@/features/full-calendar/contexts/calendar-context";
import { useMediaQuery } from "@/features/full-calendar/hooks";
import { cn } from "@/lib/utils";
import type { TEventColor } from "@/features/full-calendar/types";
import type { TCalendarView } from "@/features/full-calendar/types";

export default function FilterEvents() {
	const {
		view,
		setView,
		users,
		selectedUserId,
		filterEventsBySelectedUser,
		selectedColors,
		filterEventsBySelectedColors,
		clearFilter,
	} = useCalendar();
	// Collapse view + agent controls into this menu to preserve header height and prevent overlap.
	// Keep in sync with CalendarHeader's "showExpanded" breakpoint.
	const isCompact = useMediaQuery("(max-width: 1439px)");

	const anyActive = selectedColors.length > 0 || selectedUserId !== "all";

	const colors: TEventColor[] = [
		"blue",
		"green",
		"red",
		"yellow",
		"purple",
		"orange",
	];

	const colorDotClass: Record<TEventColor, string> = {
		blue: "bg-blue-600 dark:bg-blue-700",
		green: "bg-green-600 dark:bg-green-700",
		red: "bg-red-600 dark:bg-red-700",
		yellow: "bg-yellow-600 dark:bg-yellow-700",
		purple: "bg-purple-600 dark:bg-purple-700",
		orange: "bg-orange-600 dark:bg-orange-700",
	};

	const viewOptions: Array<{ value: TCalendarView; label: string }> = [
		{ value: "agenda", label: "Agenda" },
		{ value: "day", label: "Day" },
		{ value: "week", label: "Week" },
		{ value: "month", label: "Month" },
		{ value: "year", label: "Year" },
	];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					className="relative"
					aria-label="Filters"
				>
					<Filter className="h-4 w-4" />
					{anyActive ? (
						<span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
					) : null}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className={cn(isCompact ? "w-[min(92vw,320px)] p-2" : "w-[150px]")}
			>
				{isCompact ? (
					<>
						<DropdownMenuLabel className="text-xs text-muted-foreground">
							View
						</DropdownMenuLabel>
						<DropdownMenuRadioGroup
							value={view}
							onValueChange={(value) => setView(value as TCalendarView)}
						>
							{viewOptions.map((opt) => (
								<DropdownMenuRadioItem
									key={opt.value}
									value={opt.value}
									className="justify-between"
								>
									<span>{opt.label}</span>
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>

						<DropdownMenuSeparator className="my-2" />

						<DropdownMenuLabel className="text-xs text-muted-foreground">
							Agents
						</DropdownMenuLabel>
						<DropdownMenuRadioGroup
							value={selectedUserId}
							onValueChange={(value) =>
								filterEventsBySelectedUser(value as any)
							}
						>
							<DropdownMenuRadioItem value="all">
								All agents
							</DropdownMenuRadioItem>
							{users.map((u) => (
								<DropdownMenuRadioItem key={u.id} value={u.id}>
									<div className="flex min-w-0 items-center gap-2">
										<Avatar className="size-5">
											<AvatarImage
												src={u.picturePath ?? undefined}
												alt={u.name}
											/>
											<AvatarFallback className="text-[10px]">
												{u.name?.[0] ?? "A"}
											</AvatarFallback>
										</Avatar>
										<span className="truncate">{u.name}</span>
									</div>
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>

						<DropdownMenuSeparator className="my-2" />

						<DropdownMenuLabel className="text-xs text-muted-foreground">
							Status colors
						</DropdownMenuLabel>
					</>
				) : null}

				{colors.map((color) => (
					<DropdownMenuItem
						key={color}
						className="flex items-center gap-2 cursor-pointer"
						onClick={(e) => {
							e.preventDefault();
							filterEventsBySelectedColors(color);
						}}
					>
						<div
							className={cn("size-3.5 rounded-full", colorDotClass[color])}
						/>
						<span className="capitalize flex justify-center items-center gap-2">
							{color}
							<span>
								{selectedColors.includes(color) && (
									<span className="text-blue-500">
										<CheckIcon className="size-4" />
									</span>
								)}
							</span>
						</span>
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator className="my-2" />
				<DropdownMenuItem
					disabled={!anyActive}
					className="flex gap-2 cursor-pointer"
					onClick={(e) => {
						e.preventDefault();
						clearFilter();
					}}
				>
					<RefreshCcw className="size-3.5" />
					Clear filters
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
