import { Text, Title } from "@mantine/core";

import { getSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await getSession();

  return (
    <div>
      <Title order={2}>Dashboard</Title>
      <Text c="dimmed">
        Welcome{session?.user?.name ? `, ${session.user.name}` : ""}. Placeholder for the
        month/agenda calendar views.
      </Text>
    </div>
  );
}
