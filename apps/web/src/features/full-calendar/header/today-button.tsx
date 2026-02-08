import { motion } from "framer-motion";
import { Calendar } from "lucide-react";
import { Button } from "@/features/full-calendar/ui/button";
import { buttonHover, transition } from "@/features/full-calendar/animations";
import { useCalendar } from "@/features/full-calendar/contexts/calendar-context";
import { useMediaQuery } from "@/features/full-calendar/hooks";

const MotionButton = motion.create(Button);

export function TodayButton() {
  const { setSelectedDate } = useCalendar();
  const iconOnly = useMediaQuery("(max-width: 640px)");

  const today = new Date();
  const handleClick = () => setSelectedDate(today);

  return (
    <MotionButton
      variant="outline"
      size={iconOnly ? "icon" : "sm"}
      className={iconOnly ? "h-8 w-8" : "h-8"}
      onClick={handleClick}
      variants={buttonHover}
      whileHover="hover"
      whileTap="tap"
      transition={transition}
      aria-label="Today"
    >
      <Calendar className="h-4 w-4" />
      {!iconOnly ? <span>Today</span> : null}
    </MotionButton>
  );
}
