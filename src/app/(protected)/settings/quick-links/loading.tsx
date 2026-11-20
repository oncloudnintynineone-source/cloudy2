import { CrudTabSkeleton } from "@/components/SettingsTableSkeleton";

export default function QuickLinksLoading() {
  return (
    <CrudTabSkeleton
      label="Loading quick links"
      columns={[2, 4, 1, 2]}
      rows={3}
      addWidth={160}
    />
  );
}
