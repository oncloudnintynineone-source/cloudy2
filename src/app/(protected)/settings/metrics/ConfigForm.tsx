"use client";

import "@mantine/dates/styles.css";

import {
  Button,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { TimeInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { useActivityRefresh } from "@/components/ActivityBar";
import { WEEKDAY_ABBREVIATIONS } from "@/lib/events/datetime";
import {
  METRICS_RETENTION_MAX,
  METRICS_RETENTION_MIN,
} from "@/lib/metrics/config";
import { saveMetricsSettings } from "./actions";
import { validateMetricsForm, type MetricsFormValues } from "@/lib/metrics/validate";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 7];

/**
 * Ledger configuration. Two things here are load-bearing rather than
 * cosmetic, and the copy says so: the caps are what every budget bar is
 * measured against (change the Neon plan, change these), and the calibration
 * ratio is the one place the app's egress estimate is anchored to Neon's own
 * figure.
 */
export function ConfigForm({ initial }: { initial: MetricsFormValues }) {
  const refreshAfterSave = useActivityRefresh("metrics:config-save");

  const form = useForm<MetricsFormValues>({
    initialValues: initial,
    validate: (values) => validateMetricsForm(values),
    validateInputOnBlur: true,
  });

  const onSubmit = form.onSubmit(
    async (values) => {
      const result = await saveMetricsSettings(values);
      if (result.ok) {
        notifications.show({ color: "green", message: "Resource usage settings saved" });
        refreshAfterSave();
        return;
      }
      if (result.field) {
        form.setFieldError(result.field, result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  return (
    <form onSubmit={onSubmit}>
      <Stack gap="md">
        <Switch
          label="Collect resource usage"
          description="Turns the ledger on or off. While off, nothing is counted and nothing is written — the page keeps showing the history it has."
          {...form.getInputProps("enabled", { type: "checkbox" })}
        />

        <Divider label="Snapshot schedule" labelPosition="left" />

        <TimeInput
          label="Snapshot time (Singapore time)"
          description="The earliest time of day the ledger may close a day: the first app activity at or after this time closes the previous day. There is no external scheduler, so pick a time the app is actually open — a day nobody is online for closes on the next visit rather than being skipped."
          {...form.getInputProps("snapshotTime")}
        />

        <Checkbox.Group
          label="Snapshot days"
          description="Daily keeps a month of history for a few dozen rows a day."
          value={form.values.snapshotDays.map(String)}
          onChange={(values) => form.setFieldValue("snapshotDays", values.map(Number))}
          error={form.errors.snapshotDays}
        >
          <Group gap="md" mt={6}>
            {WEEKDAY_VALUES.map((day, index) => (
              <Checkbox key={day} value={String(day)} label={WEEKDAY_ABBREVIATIONS[index]} />
            ))}
          </Group>
        </Checkbox.Group>

        <Divider label="Neon allowances" labelPosition="left" />

        <Text size="xs" c="dimmed">
          These are the ceilings every bar on this page is measured against. They are stored, not
          hard-coded: move to a paid Neon plan and updating these three numbers is the whole
          migration.
        </Text>

        <NumberInput
          label="Compute (active hours per month)"
          description="Neon bills wall-clock time the endpoint is awake, including the 5-minute idle tail after each burst."
          min={1}
          max={100_000}
          decimalScale={1}
          {...form.getInputProps("capComputeHours")}
        />

        <NumberInput
          label="Egress (GiB per month)"
          description="Public network transfer. The free allowance is 5 GiB."
          min={0.1}
          max={1024}
          step={0.5}
          decimalScale={2}
          suffix=" GiB"
          {...form.getInputProps("capEgressGiB")}
        />

        <NumberInput
          label="Storage (MiB)"
          description="Total database size. The free allowance is 512 MiB."
          min={1}
          max={1_048_576}
          step={64}
          decimalScale={0}
          suffix=" MiB"
          {...form.getInputProps("capStorageMiB")}
        />

        <Divider label="Calibration & retention" labelPosition="left" />

        <NumberInput
          label="Egress calibration ratio"
          description="Multiply the app's own byte accounting by this to reach Neon's figure. Read the month's real egress from Neon Console → Billing → Usage, divide it by the estimate shown on the budget bar, and enter the result. 1 means uncalibrated."
          min={0.05}
          max={100}
          step={0.05}
          decimalScale={2}
          suffix="×"
          {...form.getInputProps("calibration")}
        />

        <NumberInput
          label="Keep daily rows for"
          description="Daily rows are tiny; a year costs well under a megabyte."
          min={METRICS_RETENTION_MIN}
          max={METRICS_RETENTION_MAX}
          step={30}
          decimalScale={0}
          suffix=" days"
          {...form.getInputProps("retentionDays")}
        />

        <Group>
          <Button type="submit" loading={form.submitting} loaderProps={BUTTON_LOADER_PROPS}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
