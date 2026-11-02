"use client";

import { type CSSProperties, type ReactNode, useState } from "react";

import { PageContainer } from "@/components/PageContainer";
import { SettingsTabs } from "./SettingsTabs";

/**
 * Settings shell: the sticky tab strip and the page column live in one
 * measured wrapper. `SettingsTabs` reports its desktop stick height, published
 * as `--c2-settings-tabs-height` so a list page's sticky search/action bar can
 * dock directly beneath the tabs (`SettingsListChrome`).
 */
export function SettingsShell({ children }: { children: ReactNode }) {
  const [tabsHeight, setTabsHeight] = useState(0);
  return (
    <div
      className="settings-page-pad"
      style={{ "--c2-settings-tabs-height": `${tabsHeight}px` } as CSSProperties}
    >
      <SettingsTabs onHeightChange={setTabsHeight} />
      <PageContainer>{children}</PageContainer>
    </div>
  );
}
