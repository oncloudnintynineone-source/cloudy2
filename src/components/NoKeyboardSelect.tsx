"use client";

import {
  MultiSelect,
  Select,
  type MultiSelectProps,
  type Primitive,
  type SelectProps,
} from "@mantine/core";
import { useState } from "react";

type DropdownProps<Value extends Primitive> = Pick<
  SelectProps<Value>,
  "dropdownOpened" | "searchable" | "onDropdownOpen" | "onDropdownClose"
>;

function useDropdownOpened(props: DropdownProps<Primitive>) {
  const [internalOpened, setInternalOpened] = useState(false);
  return {
    opened: props.dropdownOpened ?? internalOpened,
    onDropdownOpen: () => {
      setInternalOpened(true);
      props.onDropdownOpen?.();
    },
    onDropdownClose: () => {
      setInternalOpened(false);
      props.onDropdownClose?.();
    },
  };
}

type NoKeyboardAttributes = SelectProps["attributes"] | MultiSelectProps["attributes"];

// Mantine's `readOnly` prop on Select/MultiSelect disables the whole dropdown,
// so it cannot be used to suppress the mobile keyboard. A native `readOnly`
// attribute on the target input instead: Mantine v9's styles-API
// `attributes.input` lands directly on the DOM input without touching
// Select's internals. While the dropdown is closed the input stays read-only,
// so tapping it on mobile opens the list without raising the virtual
// keyboard; opening the dropdown lifts the attribute, so the user can tap
// the field again and type to filter.
function withDeferredReadOnly(
  attributes: NoKeyboardAttributes | undefined,
  searchable: boolean | undefined,
  opened: boolean,
): NoKeyboardAttributes | undefined {
  if (!searchable) return attributes;
  return {
    ...attributes,
    input: { readOnly: !opened, ...attributes?.input },
  } as NoKeyboardAttributes;
}

/**
 * Select without mobile keyboard pop-up: the target input stays read-only
 * while the dropdown is closed (tap opens the list, no keyboard) and becomes
 * editable while it is open (tap the field to type and filter).
 */
export function NoKeyboardSelect<Value extends Primitive = string>(props: SelectProps<Value>) {
  const dropdown = useDropdownOpened(props);
  return (
    <Select
      {...props}
      onDropdownOpen={dropdown.onDropdownOpen}
      onDropdownClose={dropdown.onDropdownClose}
      attributes={withDeferredReadOnly(props.attributes, props.searchable, dropdown.opened)}
    />
  );
}

/**
 * MultiSelect without mobile keyboard pop-up — same behavior as
 * NoKeyboardSelect for searchable multi-selects.
 */
export function NoKeyboardMultiSelect<Value extends Primitive = string>(
  props: MultiSelectProps<Value>,
) {
  const dropdown = useDropdownOpened(props);
  return (
    <MultiSelect
      {...props}
      onDropdownOpen={dropdown.onDropdownOpen}
      onDropdownClose={dropdown.onDropdownClose}
      attributes={withDeferredReadOnly(props.attributes, props.searchable, dropdown.opened)}
    />
  );
}
