import { PageContainer } from "@/components/PageContainer";
import { PageTransition } from "@/components/PageTransition";

import { EventHistorySkeleton } from "./[eventId]/EventHistorySkeleton";

export default function EventHistoryLoading() {
  return (
    <PageTransition>
      <PageContainer>
        <EventHistorySkeleton />
      </PageContainer>
    </PageTransition>
  );
}
