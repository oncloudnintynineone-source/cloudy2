import { Badge, Tooltip } from "@mantine/core";

interface AcronymBadgeProps {
  acronym: string;
  meaning?: string;
}

/** Renders an acronym with an optional tooltip of its meaning. */
export function AcronymBadge({ acronym, meaning }: AcronymBadgeProps) {
  const badge = (
    <Badge variant="light" color="accent" size="sm">
      {acronym}
    </Badge>
  );

  if (!meaning) {
    return badge;
  }

  return <Tooltip label={meaning}>{badge}</Tooltip>;
}
