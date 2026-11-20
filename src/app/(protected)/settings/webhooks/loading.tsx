import { CrudTabSkeleton } from "@/components/SettingsTableSkeleton";

export default function WebhooksLoading() {
  return (
    <CrudTabSkeleton label="Loading webhooks" columns={[2, 4, 1]} rows={3} addWidth={140} />
  );
}
