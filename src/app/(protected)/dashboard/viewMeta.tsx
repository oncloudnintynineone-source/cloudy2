import type { ReactNode } from "react";
import {
  IconCalendarMonth,
  IconCalendarUser,
  IconCalendarWeek,
  IconColumns2,
  IconLayoutGrid,
  IconListDetails,
} from "@tabler/icons-react";

import type { DashboardViewKind } from "@/lib/dashboardViews/views";

/** Per-kind chrome used by the tab strip and the tab-management dialogs. */
export const VIEW_TAB_META: Record<
  DashboardViewKind,
  { label: string; icon: ReactNode; nowrap?: boolean }
> = {
  month: { label: "Month", icon: <IconCalendarMonth size={16} /> },
  week: { label: "Week (H)", icon: <IconCalendarWeek size={16} /> },
  weekv2: { label: "Week (D)", icon: <IconLayoutGrid size={16} />, nowrap: true },
  schedule: { label: "Day", icon: <IconCalendarUser size={16} /> },
  agenda: { label: "Agenda", icon: <IconListDetails size={16} /> },
  dual: { label: "Month & Agenda", icon: <IconColumns2 size={16} />, nowrap: true },
};
