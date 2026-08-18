import { Paper, ScrollArea, Skeleton, Stack } from "@mantine/core";

const TYPE_COL_WIDTH = 80;
const ROW_HEIGHT = 56;

export default function OverviewLoading() {
  return (
    <Stack pb="xl" gap="sm">
      <Skeleton height={36} width="60%" />
      <Skeleton height={20} width="30%" style={{ alignSelf: "flex-end" }} />
      <Paper withBorder style={{ overflow: "hidden" }}>
        <ScrollArea style={{ height: "min(60vh, 520px)" }} type="auto">
            <div style={{ minWidth: "100%", width: "max-content" }}>
              <div style={{ display: "flex" }}>
                <div style={{ flex: "0 0 calc(1.5rem + 3rem)", height: 40 }} />
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    h={20}
                    m={10}
                    w={TYPE_COL_WIDTH - 24}
                    style={{ flex: `0 0 ${TYPE_COL_WIDTH}px`, alignSelf: "center" }}
                  />
                ))}
              </div>
              <div style={{ display: "flex" }}>
                <Skeleton
                  h={ROW_HEIGHT * 6}
                  style={{ flex: "0 0 1.5rem" }}
                  radius={0}
                />
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", borderTop: "1px solid var(--mantine-color-default-border)" }}>
                    <Skeleton h={ROW_HEIGHT} style={{ flex: "0 0 3rem" }} radius={0} />
                    {Array.from({ length: 4 }).map((_, j) => (
                      <Skeleton key={j} h={ROW_HEIGHT} style={{ flex: `0 0 ${TYPE_COL_WIDTH}px` }} radius={0} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
        </ScrollArea>
      </Paper>
    </Stack>
  );
}
