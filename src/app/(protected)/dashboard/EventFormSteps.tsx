"use client";

import { Button, Group, Menu, Stack, Stepper, Text, UnstyledButton } from "@mantine/core";
import { IconCheck, IconChevronUp } from "@tabler/icons-react";

import { STEP_LABELS, STEP_SHORT_LABELS, type StepDef } from "./eventFormStepLogic";
import type { WizardStepIndicator } from "@/lib/settings/featureFlags";

interface EventFormStepsProps {
  steps: readonly StepDef[];
  /** 0-based index of the active step. */
  step: number;
  variant: WizardStepIndicator;
  /** >= 800px: the guided variant renders its own step list instead of a Stepper. */
  isDesktopWide: boolean;
  /**
   * Guided variant only: `vertical` turns the circles into a left rail beside
   * the wizard body (the wide tier's taller body makes a horizontal strip a
   * poor use of the width it sits in), so each row reads icon-then-name and
   * names the step in full. Ignored by the other variants.
   */
  orientation?: "horizontal" | "vertical";
  onJump: (index: number) => void;
}

const STEP_STRIP_GAP = 4;

/**
 * Bottom step strip for the create/edit wizard. The `wizardStepIndicator`
 * feature flag picks how the walk is named:
 * - `rail` (default): always-visible numbered name pills, wrapping as needed.
 * - `guided`: on wide desktops the circles gain their step names; on smaller
 *   screens the "Steps · N/M" button opens the full named list.
 * - `classic`: number-only circles with the current step named in the caption.
 *
 * The guided variant additionally flips to a vertical rail at the wide tier
 * (`orientation="vertical"`, see `.c2-wizard-guided-steps--vertical`).
 */
export function EventFormSteps({
  steps,
  step,
  variant,
  isDesktopWide,
  orientation = "horizontal",
  onJump,
}: EventFormStepsProps) {
  const current = steps[step];
  const position = `Step ${step + 1} of ${steps.length}`;

  if (variant === "rail") {
    return (
      <Stack gap={STEP_STRIP_GAP} className="c2-wizard-steps">
        <Group justify="space-between">
          <Text size="xs" className="c2-wizard-step-caption" fw={600}>
            Steps
          </Text>
          <Text size="xs" className="c2-wizard-step-caption">
            {position}
          </Text>
        </Group>
        <div className="c2-wizard-step-rail" role="group" aria-label="Event form steps">
          {steps.map((stepDef, index) => {
            const active = index === step;
            return (
              <UnstyledButton
                key={stepDef.id}
                type="button"
                className="c2-wizard-step-pill"
                data-active={active || undefined}
                data-completed={index < step || undefined}
                aria-label={`Step ${index + 1} of ${steps.length}: ${STEP_LABELS[stepDef.id]}`}
                aria-current={active ? "step" : undefined}
                onClick={() => onJump(index)}
              >
                <span className="c2-wizard-step-pill-num" aria-hidden>
                  {index + 1}
                </span>
                <span>{STEP_SHORT_LABELS[stepDef.id]}</span>
              </UnstyledButton>
            );
          })}
        </div>
      </Stack>
    );
  }

  if (variant === "guided" && isDesktopWide) {
    const vertical = orientation === "vertical";
    return (
      <Stack gap={STEP_STRIP_GAP} className="c2-wizard-steps">
        <Group className="c2-wizard-steps-head" justify="space-between">
          <Text size="sm" fw={600} style={{ lineHeight: 1.4 }}>
            {STEP_LABELS[current.id]}
          </Text>
          <Text size="xs" className="c2-wizard-step-caption">
            {position}
          </Text>
        </Group>
        <div
          className={`c2-wizard-guided-steps${vertical ? " c2-wizard-guided-steps--vertical" : ""}`}
          role="group"
          aria-label="Event form steps"
        >
          {steps.map((stepDef, index) => {
            const active = index === step;
            const completed = index < step;
            return (
              <UnstyledButton
                key={stepDef.id}
                type="button"
                className="c2-wizard-guided-step"
                data-active={active || undefined}
                data-completed={completed || undefined}
                aria-label={`Step ${index + 1} of ${steps.length}: ${STEP_LABELS[stepDef.id]}`}
                aria-current={active ? "step" : undefined}
                onClick={() => onJump(index)}
              >
                <span className="c2-wizard-guided-icon" aria-hidden>
                  {completed ? <IconCheck size={12} /> : index + 1}
                </span>
                {/* The rail has the width the horizontal strip never had, so it
                    names each step in full — the same string its aria-label uses. */}
                <span className="c2-wizard-guided-label">
                  {vertical ? STEP_LABELS[stepDef.id] : STEP_SHORT_LABELS[stepDef.id]}
                </span>
              </UnstyledButton>
            );
          })}
        </div>
      </Stack>
    );
  }

  return (
    <Stack gap={STEP_STRIP_GAP} className="c2-wizard-steps">
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text size="sm" fw={600} style={{ lineHeight: 1.4 }}>
          {STEP_LABELS[current.id]}
        </Text>
        {variant === "guided" && !isDesktopWide ? (
          <Menu position="top-end" width={230} shadow="md" withinPortal>
            <Menu.Target>
              <Button
                variant="subtle"
                color="gray"
                size="compact-sm"
                // Touch-target floor (docs/accessibility.md §1.9): the quiet
                // text stays, the hit row grows to 44px.
                styles={{ root: { minHeight: "2.75rem" } }}
                rightSection={<IconChevronUp size={14} />}
                aria-label="View all event form steps"
              >
                Steps · {step + 1}/{steps.length}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {steps.map((stepDef, index) => (
                <Menu.Item
                  key={stepDef.id}
                  leftSection={
                    <Text size="xs" className="c2-wizard-step-caption" w={14} ta="center">
                      {index + 1}
                    </Text>
                  }
                  rightSection={index === step ? <IconCheck size={14} /> : undefined}
                  aria-current={index === step ? "step" : undefined}
                  onClick={() => onJump(index)}
                >
                  {STEP_LABELS[stepDef.id]}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        ) : (
          <Text size="xs" className="c2-wizard-step-caption">
            {position}
          </Text>
        )}
      </Group>
      {variant === "guided" ? (
        /* Phone/tablet guided strip: icon-only circles (the header names the
           current step and the menu lists them all), each row a full 44px
           touch target (docs/accessibility.md §1.9) — the 24px circle is the
           glyph, not the target. The shared classes ride the same state
           styling and dark-scheme ramp as the wide rail. */
        <div
          className="c2-wizard-guided-steps c2-wizard-guided-steps--icons"
          role="group"
          aria-label="Event form steps"
        >
          {steps.map((stepDef, index) => {
            const active = index === step;
            const completed = index < step;
            return (
              <UnstyledButton
                key={stepDef.id}
                type="button"
                className="c2-wizard-guided-step"
                data-active={active || undefined}
                data-completed={completed || undefined}
                aria-label={`Step ${index + 1} of ${steps.length}: ${STEP_LABELS[stepDef.id]}`}
                aria-current={active ? "step" : undefined}
                onClick={() => onJump(index)}
              >
                <span className="c2-wizard-guided-icon" aria-hidden>
                  {completed ? <IconCheck size={12} /> : index + 1}
                </span>
              </UnstyledButton>
            );
          })}
        </div>
      ) : (
        <Stepper
          active={step}
          onStepClick={onJump}
          allowNextStepsSelect
          wrap={false}
          size="sm"
          iconSize={24}
          styles={{ separator: { marginInline: 6 } }}
        >
          {steps.map((stepDef) => (
            <Stepper.Step key={stepDef.id} aria-label={STEP_LABELS[stepDef.id]} />
          ))}
        </Stepper>
      )}
    </Stack>
  );
}
