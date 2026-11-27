"use client";

import { Box } from "@mantine/core";

import { PageHeader } from "@/components/PageHeader";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { KAH_RANGE_MONTHS, kahRangeLabel, type KahRangeMonths } from "@/lib/kah/range";

/**
 * The KAH Status pinned chrome: the title, window subtitle and the Look-ahead
 * control in one `c2-glass-surface` block stuck under the app header (the shared
 * report-head recipe used by Double Booking and My Events). The title block and
 * the pill share one row on phones — a stacked title / full-width pill column
 * cost ~140px of permanently pinned chrome (`.c2-report-chrome` /
 * `.c2-report-head` in `globals.css`) — and the row splits title-left /
 * control-right at the 40em band. Split out of the page view so the view itself
 * stays state + composition.
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
    <Box className="c2-glass-surface c2-report-chrome">
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
