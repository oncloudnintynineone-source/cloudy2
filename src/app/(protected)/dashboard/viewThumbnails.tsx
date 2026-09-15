import type { ReactNode } from "react";

import type { DashboardViewKind } from "@/lib/dashboardViews/views";

/**
 * Hand-drawn SVG wireframes for the dashboard view types, used as picker
 * thumbnails in the "Add view" dialog and the Manage views modal.
 *
 * Every thumbnail shares one 120×80 canvas that scales to its container.
 * Wireframe strokes ride `currentColor` (so the surrounding card controls the
 * tint — dimmed at rest, accent when selected) while event chips stay amber
 * (`--mantine-color-accent-4`) so the "events" read the same in every card.
 */

const ACCENT = "var(--mantine-color-accent-4)";
const NEUTRAL = "currentColor";

function Thumb({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 120 80"
      preserveAspectRatio="xMidYMid meet"
      role="presentation"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** The outer card + header band shared by every thumbnail. */
function Shell({ headerHeight = 10 }: { headerHeight?: number }) {
  const headerBottom = 6 + headerHeight;
  return (
    <>
      <rect
        x={6}
        y={6}
        width={108}
        height={68}
        rx={3}
        fill="none"
        stroke={NEUTRAL}
        strokeOpacity={0.55}
      />
      <rect
        x={6}
        y={6}
        width={108}
        height={headerHeight}
        rx={3}
        fill={NEUTRAL}
        fillOpacity={0.1}
      />
      <line
        x1={6}
        y1={headerBottom}
        x2={114}
        y2={headerBottom}
        stroke={NEUTRAL}
        strokeOpacity={0.55}
      />
    </>
  );
}

/** Month — a 7×5 calendar grid with a few event chips. */
function MonthThumb() {
  const columns = [1, 2, 3, 4, 5, 6].map((i) => 6 + (i * 108) / 7);
  const rows = [1, 2, 3, 4].map((i) => 17 + (i * 57) / 5);
  return (
    <Thumb>
      <Shell headerHeight={11} />
      {columns.map((x) => (
        <line key={`c${x}`} x1={x} y1={17} x2={x} y2={74} stroke={NEUTRAL} strokeOpacity={0.25} />
      ))}
      {rows.map((y) => (
        <line key={`r${y}`} x1={6} y1={y} x2={114} y2={y} stroke={NEUTRAL} strokeOpacity={0.25} />
      ))}
      <rect x={9} y={21} width={11} height={6} rx={1.5} fill={ACCENT} />
      <rect x={40} y={32} width={13} height={6} rx={1.5} fill={ACCENT} />
      <rect x={71} y={43} width={14} height={6} rx={1.5} fill={ACCENT} />
      <rect x={25} y={54} width={10} height={6} rx={1.5} fill={NEUTRAL} fillOpacity={0.22} />
    </Thumb>
  );
}

/** Week (H) — horizontal: 7 day columns behind a left time ruler. */
function WeekHThumb() {
  const colWidth = 96 / 7;
  const rowHeight = 58 / 5;
  const columns = [1, 2, 3, 4, 5, 6].map((i) => 18 + i * colWidth);
  const rows = [1, 2, 3, 4].map((i) => 16 + i * rowHeight);
  return (
    <Thumb>
      <Shell />
      <line x1={18} y1={6} x2={18} y2={74} stroke={NEUTRAL} strokeOpacity={0.55} />
      {columns.map((x) => (
        <line key={`c${x}`} x1={x} y1={16} x2={x} y2={74} stroke={NEUTRAL} strokeOpacity={0.25} />
      ))}
      {rows.map((y) => (
        <line key={`r${y}`} x1={18} y1={y} x2={114} y2={y} stroke={NEUTRAL} strokeOpacity={0.18} />
      ))}
      <rect
        x={18 + 2 * colWidth + 1.5}
        y={16 + rowHeight}
        width={colWidth - 3}
        height={rowHeight * 2 - 3}
        rx={2}
        fill={ACCENT}
      />
      <rect
        x={18 + 5 * colWidth + 1.5}
        y={17}
        width={colWidth - 3}
        height={rowHeight - 3}
        rx={2}
        fill={NEUTRAL}
        fillOpacity={0.22}
      />
    </Thumb>
  );
}

/** Week (D) — the custom day-lane matrix with one highlighted day column. */
function WeekDThumb() {
  const colWidth = 108 / 7;
  const columns = [1, 2, 3, 4, 5, 6].map((i) => 6 + i * colWidth);
  const lanes = [1, 2, 3, 4, 5, 6, 7].map((i) => 16 + (i * 58) / 8);
  return (
    <Thumb>
      <Shell />
      <rect x={6 + 3 * colWidth} y={16} width={colWidth} height={58} fill={ACCENT} fillOpacity={0.16} />
      {columns.map((x) => (
        <line key={`c${x}`} x1={x} y1={16} x2={x} y2={74} stroke={NEUTRAL} strokeOpacity={0.25} />
      ))}
      {lanes.map((y) => (
        <line key={`l${y}`} x1={6} y1={y} x2={114} y2={y} stroke={NEUTRAL} strokeOpacity={0.15} />
      ))}
      <rect
        x={6 + 3 * colWidth + 1.5}
        y={22}
        width={colWidth - 3}
        height={15}
        rx={2}
        fill={ACCENT}
      />
      <rect
        x={6 + colWidth + 1.5}
        y={40}
        width={colWidth - 3}
        height={11}
        rx={2}
        fill={NEUTRAL}
        fillOpacity={0.22}
      />
      <rect
        x={6 + 5 * colWidth + 1.5}
        y={30}
        width={colWidth - 3}
        height={19}
        rx={2}
        fill={NEUTRAL}
        fillOpacity={0.22}
      />
    </Thumb>
  );
}

/** Week (Grid) — a denser two-axis matrix (heatmap-style) with amber cells. */
function WeekGridThumb() {
  const colWidth = 108 / 7;
  const rowHeight = 58 / 6;
  const columns = [1, 2, 3, 4, 5, 6].map((i) => 6 + i * colWidth);
  const rows = [1, 2, 3, 4, 5].map((i) => 16 + i * rowHeight);
  const cells: Array<[number, number]> = [
    [1, 1],
    [4, 0],
    [6, 2],
    [3, 3],
    [5, 4],
  ];
  return (
    <Thumb>
      <Shell />
      {columns.map((x) => (
        <line key={`c${x}`} x1={x} y1={16} x2={x} y2={74} stroke={NEUTRAL} strokeOpacity={0.25} />
      ))}
      {rows.map((y) => (
        <line key={`r${y}`} x1={6} y1={y} x2={114} y2={y} stroke={NEUTRAL} strokeOpacity={0.2} />
      ))}
      {cells.map(([col, row]) => (
        <rect
          key={`cell-${col}-${row}`}
          x={6 + col * colWidth + 2}
          y={16 + row * rowHeight + 1.5}
          width={colWidth - 4}
          height={rowHeight - 3}
          rx={1.5}
          fill={col % 2 === 0 ? ACCENT : NEUTRAL}
          fillOpacity={col % 2 === 0 ? 1 : 0.22}
        />
      ))}
    </Thumb>
  );
}

/** Day — one wide day column behind a left time ruler. */
function DayThumb() {
  const rowHeight = 58 / 5;
  const rows = [1, 2, 3, 4].map((i) => 16 + i * rowHeight);
  return (
    <Thumb>
      <Shell />
      <line x1={26} y1={6} x2={26} y2={74} stroke={NEUTRAL} strokeOpacity={0.55} />
      {rows.map((y) => (
        <line key={`r${y}`} x1={26} y1={y} x2={114} y2={y} stroke={NEUTRAL} strokeOpacity={0.18} />
      ))}
      <rect x={29} y={16 + rowHeight} width={82} height={rowHeight - 4} rx={2} fill={ACCENT} />
      <rect
        x={29}
        y={16 + rowHeight * 3 + 2}
        width={82}
        height={rowHeight - 6}
        rx={2}
        fill={NEUTRAL}
        fillOpacity={0.22}
      />
    </Thumb>
  );
}

/** Agenda — a stacked list of dated rows. */
function AgendaThumb() {
  const rowHeight = 58 / 5;
  const rows = [0, 1, 2, 3, 4].map((i) => 16 + i * rowHeight);
  return (
    <Thumb>
      <Shell />
      {rows.map((y, index) => {
        const highlighted = index === 1;
        return (
          <g key={`row-${y}`}>
            <rect
              x={10}
              y={y + 2}
              width={16}
              height={rowHeight - 5}
              rx={1.5}
              fill={highlighted ? ACCENT : NEUTRAL}
              fillOpacity={highlighted ? 1 : 0.18}
            />
            <rect
              x={31}
              y={y + rowHeight / 2 - 2.5}
              width={highlighted ? 66 : 74}
              height={5}
              rx={2.5}
              fill={highlighted ? ACCENT : NEUTRAL}
              fillOpacity={highlighted ? 1 : 0.22}
            />
            {index < rows.length - 1 && (
              <line
                x1={10}
                y1={y + rowHeight}
                x2={114}
                y2={y + rowHeight}
                stroke={NEUTRAL}
                strokeOpacity={0.15}
              />
            )}
          </g>
        );
      })}
    </Thumb>
  );
}

/** Month & Agenda — the split view: month grid left, agenda rows right. */
function DualThumb() {
  const divider = 62;
  const gridColumns = [1, 2].map((i) => 6 + (i * (divider - 6 - 4)) / 3);
  const gridRows = [1, 2].map((i) => 24 + (i * 50) / 3);
  const rowHeight = 58 / 5;
  return (
    <Thumb>
      <Shell />
      <line x1={divider} y1={6} x2={divider} y2={74} stroke={NEUTRAL} strokeOpacity={0.55} />
      {gridColumns.map((x) => (
        <line key={`c${x}`} x1={x} y1={22} x2={x} y2={74} stroke={NEUTRAL} strokeOpacity={0.22} />
      ))}
      {gridRows.map((y) => (
        <line key={`r${y}`} x1={6} y1={y} x2={divider} y2={y} stroke={NEUTRAL} strokeOpacity={0.22} />
      ))}
      <rect x={9} y={26} width={13} height={7} rx={1.5} fill={ACCENT} />
      <rect x={9} y={44} width={10} height={7} rx={1.5} fill={NEUTRAL} fillOpacity={0.22} />
      {[0, 1, 2, 3].map((i) => {
        const y = 16 + i * rowHeight;
        return (
          <g key={`a-${i}`}>
            <rect
              x={divider + 5}
              y={y + 3}
              width={9}
              height={rowHeight - 7}
              rx={1.5}
              fill={i === 0 ? ACCENT : NEUTRAL}
              fillOpacity={i === 0 ? 1 : 0.18}
            />
            <rect
              x={divider + 18}
              y={y + rowHeight / 2 - 2.5}
              width={i === 0 ? 28 : 32}
              height={5}
              rx={2.5}
              fill={i === 0 ? ACCENT : NEUTRAL}
              fillOpacity={i === 0 ? 1 : 0.22}
            />
          </g>
        );
      })}
    </Thumb>
  );
}

export const VIEW_THUMBNAILS: Record<DashboardViewKind, ReactNode> = {
  month: <MonthThumb />,
  week: <WeekHThumb />,
  weekv2: <WeekDThumb />,
  weekgrid: <WeekGridThumb />,
  schedule: <DayThumb />,
  agenda: <AgendaThumb />,
  dual: <DualThumb />,
};
