"use client";

import { Button, Group, Paper, SegmentedControl, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import { useActivityRefresh } from "@/components/ActivityBar";
import { updateFeatureFlags, type SettingsActionResult } from "@/lib/settings/actions";
import {
  FEATURE_FLAGS,
  validateFeatureFlags,
  type FeatureFlagKey,
  type PinnedTickerIndicator,
} from "@/lib/settings/featureFlags";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

/** A static mock of the real header pill (same classes) that switches with the
 *  selected variant, so an admin sees exactly what the header will render
 *  before saving. `aria-hidden`: the preview is illustrative, not interactive. */
function TickerIndicatorPreview({ value }: { value: PinnedTickerIndicator }) {
  return (
    <div className="c2-pinned-ticker c2-pinned-ticker-preview" data-indicator={value} aria-hidden>
      {value === "classic" ? <span className="c2-pinned-ticker-count">2/3</span> : null}
      {value === "stacked" ? (
        <span className="c2-pinned-ticker-stacked">
          <span className="c2-pinned-ticker-stacked-count">2/3</span>
          <span className="c2-pinned-ticker-stacked-countdown">5d</span>
        </span>
      ) : null}
      {value !== "stacked" ? <span className="c2-pinned-ticker-countdown">5d</span> : null}
      <span className="c2-pinned-ticker-title">
        <span className="c2-pinned-ticker-line">Water parade</span>
      </span>
      {value === "segmented" ? (
        <span className="c2-pinned-ticker-progress" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={
                i === 1 ? "c2-pinned-ticker-progress-seg is-active" : "c2-pinned-ticker-progress-seg"
              }
            />
          ))}
        </span>
      ) : null}
      {value === "badge" ? <span className="c2-pinned-ticker-badge">3</span> : null}
    </div>
  );
}

/** Feature-specific live preview; null for flags without one. The page/control
 *  rendering stays generic — a future flag adds its preview renderer here. */
function previewFor(key: FeatureFlagKey, value: string) {
  if (key === "pinnedTickerIndicator") {
    return <TickerIndicatorPreview value={value as PinnedTickerIndicator} />;
  }
  return null;
}

interface FeatureFlagsFormProps {
  /** Resolved values for every registered flag (keys = settings columns). */
  initialValues: Record<FeatureFlagKey, string>;
}

export function FeatureFlagsForm({ initialValues }: FeatureFlagsFormProps) {
  const refreshAfterSave = useActivityRefresh("feature-flags:save");

  const form = useForm<Record<FeatureFlagKey, string>>({
    initialValues,
    validate: (values) => validateFeatureFlags(values),
    validateInputOnBlur: true,
  });

  const onSubmit = form.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateFeatureFlags(values);

      if (result.ok) {
        notifications.show({ color: "green", message: "Feature flags updated" });
        refreshAfterSave();
        return;
      }

      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  return (
    <Paper withBorder p="sm" className={CONTENT_ENTER_CLASS} maw={720}>
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          {FEATURE_FLAGS.map((def) => (
            <Stack key={def.key} gap={4}>
              <Text fw={500} size="sm">
                {def.label}
              </Text>
              <Text size="xs" c="dimmed">
                {def.description}
              </Text>
              <SegmentedControl
                data={def.options.map((option) => ({
                  value: option,
                  label: def.optionLabels[option],
                }))}
                {...form.getInputProps(def.key)}
              />
              {previewFor(def.key, form.values[def.key])}
            </Stack>
          ))}

          <Group justify="flex-end">
            <Button type="submit" loading={form.submitting} loaderProps={BUTTON_LOADER_PROPS}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}