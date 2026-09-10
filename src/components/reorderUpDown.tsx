import { ActionIcon, Group, Tooltip } from "@mantine/core";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";

/** Touch-friendly row action size (px). Apple/Android guidance is ~44px;
 *  40px keeps rows from ballooning while staying well above the old 22px
 *  `size="sm"` targets. Icons are sized relative to the hit area. */
export const ROW_ACTION_SIZE = 40;
export const ROW_ACTION_ICON_SIZE = 20;
/** Gap between the list's card rows (was `4`, which cramped touch rows). */
export const ROW_CARD_GAP = "sm" as const;

interface ReorderUpDownProps {
  /** Subject used in the buttons' accessible names, e.g. a row label. */
  name: string;
  upDisabled: boolean;
  downDisabled: boolean;
  onUp: () => void;
  onDown: () => void;
}

/** The app's standard "move earlier / move later" chevron pair for touch:
 *  two `variant="default"` 40px `ActionIcon`s in `Tooltip`s. Used by every
 *  manageable list row (dashboard views, event-type groups, departments,
 *  quick links, title-recipe segments) so the recipe can't drift. */
export function ReorderUpDown({ name, upDisabled, downDisabled, onUp, onDown }: ReorderUpDownProps) {
  return (
    <Group wrap="nowrap" gap={4} onClick={(event) => event.stopPropagation()}>
      <Tooltip label="Move up" position="top">
        <ActionIcon
          variant="default"
          size={ROW_ACTION_SIZE}
          aria-label={`Move ${name} up`}
          disabled={upDisabled}
          onClick={onUp}
        >
          <IconChevronUp size={ROW_ACTION_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Move down" position="top">
        <ActionIcon
          variant="default"
          size={ROW_ACTION_SIZE}
          aria-label={`Move ${name} down`}
          disabled={downDisabled}
          onClick={onDown}
        >
          <IconChevronDown size={ROW_ACTION_ICON_SIZE} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
