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
} from "@/lib/settings/featureFlags";
import {
  motionStyleVars,
  resolveMotion,
  type MotionProfile,
} from "@/lib/motion/profile";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

/** A small replayable set of animations (badge pop, chip settle, pill entrance)
 *  that re-runs whenever the selected profile changes, so the cadence, easing and
 *  bounce are visible before saving. The wrapper carries the profile's `--c2-*`
 *  vars inline so the preview reflects the *unsaved* selection. `aria-hidden`:
 *  the preview is illustrative, not interactive. */
function MotionPreview({ value }: { value: MotionProfile }) {
  const vars = motionStyleVars(resolveMotion(value));
  return (
    <div className="c2-motion-preview" style={vars} key={value} aria-hidden>
      <span className="c2-motion-preview-badge c2-badge-tick">3</span>
      <span className="c2-motion-preview-chip c2-chip-settle">Settle</span>
      <span className="c2-motion-preview-pill c2-glass-surface">Reveal</span>
      <span className="c2-motion-preview-modal">
        <span className="c2-motion-preview-modal-bar" />
        <span className="c2-motion-preview-modal-line" />
      </span>
    </div>
  );
}

/** Feature-specific live preview; null for flags without one. The page/control
 *  rendering stays generic — a future flag adds its preview renderer here. */
function previewFor(key: FeatureFlagKey, value: string) {
  if (key === "motionProfile") {
    return <MotionPreview value={value as MotionProfile} />;
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
                  label: (def.optionLabels as Record<string, string>)[option],
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
