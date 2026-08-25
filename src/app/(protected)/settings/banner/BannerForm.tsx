"use client";

import { useRouter } from "next/navigation";
import { Button, Group, Paper, Stack, Switch, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";

import {
  BANNER_COLORS,
  BANNER_HEIGHT_PRESETS,
  BANNER_TEXT_MAX_LENGTH,
  bannerColorOption,
  normalizeBannerColor,
  normalizeBannerHeight,
  validateBannerForm,
  type BannerFormValues,
} from "@/lib/banner/banner";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { updateBanner, type SettingsActionResult } from "@/lib/settings/actions";
import { BUTTON_LOADER_PROPS } from "@/lib/theme";
import { showValidationFailure } from "@/lib/ui/validationFeedback";

interface BannerFormProps {
  initial: { enabled: boolean; text: string; color: string; height: number };
}

/** One live preview strip at the banner's real (chosen) height and fill. */
function BannerPreview({ values }: { values: BannerFormValues }) {
  const option = bannerColorOption(normalizeBannerColor(values.color));
  const height = normalizeBannerHeight(values.height);
  const text = values.text.trim();
  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingInline: "var(--mantine-spacing-md)",
        textAlign: "center",
        borderRadius: "var(--mantine-radius-md)",
        background: `var(--mantine-color-${option.key}-filled)`,
        color:
          option.textColor === "dark"
            ? "var(--mantine-color-black)"
            : "var(--mantine-color-white)",
        fontSize: "var(--mantine-font-size-sm)",
        fontWeight: 500,
        overflow: "hidden",
        opacity: values.enabled ? undefined : 0.55,
      }}
    >
      <span style={{ width: "100%", overflowWrap: "break-word" }}>
        {text || "Banner text appears here"}
      </span>
    </div>
  );
}

export function BannerForm({ initial }: BannerFormProps) {
  const router = useRouter();

  const form = useForm<BannerFormValues>({
    initialValues: { ...initial, height: normalizeBannerHeight(initial.height) },
    validate: (values) => validateBannerForm(values),
    validateInputOnBlur: true,
  });

  const onSubmit = form.onSubmit(
    async (values) => {
      const result: SettingsActionResult = await updateBanner(values);

      if (result.ok) {
        notifications.show({
          color: "green",
          message: values.enabled ? "Banner updated" : "Banner disabled",
        });
        router.refresh();
        return;
      }

      if (result.field === "bannerText") {
        form.setFieldError("bannerText", result.error);
      }
      notifications.show({ color: "red", message: result.error });
    },
    (errors) => showValidationFailure(errors, (field) => form.getInputNode(field)),
  );

  return (
    <Paper withBorder p="sm" className={CONTENT_ENTER_CLASS} maw={720}>
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          <Switch
            label="Enable banner"
            description="Shown above the app header for everyone. When off it takes no space; the text and color are kept."
            {...form.getInputProps("enabled", { type: "checkbox" })}
          />

          <TextInput
            label="Text"
            required={form.values.enabled}
            placeholder="Water parade at 0800"
            maxLength={BANNER_TEXT_MAX_LENGTH}
            description="Wraps to fit the chosen height above the header; text that doesn't fit is clipped."
            {...form.getInputProps("text")}
          />

          {/* Swatch buttons (not inputs), same no-keyboard rationale as the
              quick-link color picker: tapping never raises the mobile keyboard. */}
          <Stack gap={4}>
            <Text fw={500} size="sm">
              Background color
            </Text>
            <Group gap={10} wrap="wrap">
              {BANNER_COLORS.map((option) => {
                const selected = form.values.color === option.key;
                return (
                  <UnstyledButton
                    key={option.key}
                    aria-pressed={selected}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => form.setFieldValue("color", option.key)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: "50%",
                      background: `var(--mantine-color-${option.key}-filled)`,
                      outline: selected
                        ? "3px solid var(--mantine-primary-color-filled)"
                        : "none",
                      outlineOffset: 2,
                    }}
                  />
                );
              })}
            </Group>
          </Stack>

          {/* Height presets as tappable buttons (not inputs), so tapping never
              raises the mobile keyboard. */}
          <Stack gap={4}>
            <Text fw={500} size="sm">
              Height
            </Text>
            <Group gap={8} wrap="wrap">
              {BANNER_HEIGHT_PRESETS.map((preset) => {
                const selected = form.values.height === preset.px;
                return (
                  <UnstyledButton
                    key={preset.px}
                    aria-pressed={selected}
                    onClick={() => form.setFieldValue("height", preset.px)}
                    style={{
                      paddingInline: "var(--mantine-spacing-md)",
                      paddingBlock: 6,
                      borderRadius: "var(--mantine-radius-md)",
                      border: "1px solid var(--mantine-color-default-border)",
                      background: selected
                        ? "var(--mantine-primary-color-filled)"
                        : "var(--mantine-color-body)",
                      color: selected
                        ? "var(--mantine-primary-color-filled-text)"
                        : "var(--mantine-color-text)",
                      fontSize: "var(--mantine-font-size-sm)",
                      fontWeight: selected ? 600 : 500,
                    }}
                  >
                    {preset.label} ({preset.px}px)
                  </UnstyledButton>
                );
              })}
            </Group>
          </Stack>

          <Stack gap={4}>
            <Text fw={500} size="sm">
              Preview
            </Text>
            <BannerPreview values={form.values} />
          </Stack>

          <Group justify="flex-end">
            <Button
              type="submit"
              loading={form.submitting}
              loaderProps={BUTTON_LOADER_PROPS}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  );
}
