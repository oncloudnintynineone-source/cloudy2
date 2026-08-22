import { Box } from "@mantine/core";

/**
 * Centered max-width wrapper for list-style pages (settings tabs, contacts,
 * parade state). Full-width below lg; capped and centered at lg+ where a
 * single column would stretch too far. The dashboard's calendar views stay
 * full-bleed and must not be wrapped.
 */
export function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <Box component="div" className="page-container">
      {children}
    </Box>
  );
}
