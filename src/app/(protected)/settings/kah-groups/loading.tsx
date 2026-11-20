import { CrudTabSkeleton } from "@/components/SettingsTableSkeleton";

export default function KahGroupsLoading() {
  return <CrudTabSkeleton label="Loading KAH groups" columns={[2, 2, 4]} rows={4} addWidth={140} />;
}
