"use client";

import { Box } from "@mantine/core";

import { PageHeader } from "@/components/PageHeader";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { KAH_RANGE_MONTHS, kahRangeLabel, type KahRangeMonths } from "@/lib/kah/range";

/**
 * The KAH Status pinned chrome: the title, window subtitle and the Look-ahead
 * control in one `c2-glass-surface` block stuck under the app header (the shared
 * report-head recipe used by Double Booking and My Events). Split out of the
 * page view so the view itself stays state + composition.
 */
export function KahStatusHead({
  windowLabel,
  rangeMonths,
  onRangeChange,
  disabled,
}: {
  windowLabel: string;
  rangeMonths: KahRangeMonths;
  onRangeChange: (months: KahRangeMonths) => void;
  disabled: boolean;
}) {
  return (
    <Box
      className="c2-glass-surface"
      style={{
        position: "sticky",
        top: "var(--app-shell-header-offset)",
        zIndex: 9,
        borderBottom: "1px solid var(--mantine-color-default-border)",
        marginInline: "calc(-1 * var(--app-shell-padding))",
        marginTop: "calc(-1 * var(--app-shell-padding))",
        paddingInline: "var(--app-shell-padding)",
        paddingTop: "var(--mantine-spacing-md)",
        paddingBottom: "var(--mantine-spacing-md)",
      }}
    >
      <div className="c2-report-head">
        <div className="c2-report-title">
          <PageHeader title="KAH Status" subtitle={windowLabel} />
        </div>
        <div className="c2-report-controls">
          <div className="c2-report-range">
            <TimeRangeSelect
              label="Look ahead"
              values={KAH_RANGE_MONTHS}
              labelFor={kahRangeLabel}
              months={rangeMonths}
              onSelect={onRangeChange}
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </Box>
  );
}
