import { Button } from "@mantine/core";
import { IconCalendarSearch } from "@tabler/icons-react";
import Link from "next/link";

import { ErrorState } from "@/components/ErrorState";

/** Branded 404. Renders inside the root layout, so providers are available. */
export default function NotFound() {
  return (
    <ErrorState
      icon={<IconCalendarSearch size={36} />}
      title="Page not found"
      description="The page you're looking for doesn't exist or may have moved."
      action={
        <Button mt="xs" component={Link} href="/dashboard">
          Go to Calendar
        </Button>
      }
    />
  );
}
