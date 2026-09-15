import type { ReactNode } from "react";
import {
  IconCalendarMonth,
  IconCalendarTime,
  IconCalendarUser,
  IconCalendarWeek,
  IconColumns2,
  IconLayoutGrid,
  IconListDetails,
} from "@tabler/icons-react";

import type { DashboardViewKind } from "@/lib/dashboardViews/views";

import { VIEW_THUMBNAILS } from "./viewThumbnails";

/** Per-kind chrome used by the tab strip and the tab-management dialogs. */
export const VIEW_TAB_META: Record<
  DashboardViewKind,
  { label: string; icon: ReactNode; thumbnail: ReactNode; nowrap?: boolean }
> = {
  month: {
    label: "Month",
    icon: <IconCalendarMonth size={16} />,
    thumbnail: VIEW_THUMBNAILS.month,
  },
  week: {
    label: "Week (H)",
    icon: <IconCalendarWeek size={16} />,
    thumbnail: VIEW_THUMBNAILS.week,
  },
  weekv2: {
    label: "Week (D)",
    icon: <IconLayoutGrid size={16} />,
    thumbnail: VIEW_THUMBNAILS.weekv2,
    nowrap: true,
  },
  weekgrid: {
    label: "Week (Grid)",
    icon: <IconCalendarTime size={16} />,
    thumbnail: VIEW_THUMBNAILS.weekgrid,
    nowrap: true,
  },
  schedule: {
    label: "Day",
    icon: <IconCalendarUser size={16} />,
    thumbnail: VIEW_THUMBNAILS.schedule,
  },
  agenda: {
    label: "Agenda",
    icon: <IconListDetails size={16} />,
    thumbnail: VIEW_THUMBNAILS.agenda,
  },
  dual: {
    label: "Month & Agenda",
    icon: <IconColumns2 size={16} />,
    thumbnail: VIEW_THUMBNAILS.dual,
    nowrap: true,
  },
};
