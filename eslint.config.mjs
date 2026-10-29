import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  prettier,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "drizzle/**",
    ],
  },
  {
    // Standalone dialogs must render through MotionModal so a first-mount-open
    // overlay still plays its enter transition (see docs/motion.md §1.7).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/MotionModal.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@mantine/core",
              importNames: ["Modal"],
              message:
                "Render standalone modals through MotionModal; use raw Modal only for a compound Modal.Root guarded by useEnterTransitionReady.",
            },
          ],
        },
      ],
    },
  },
  {
    // The wizard is the one compound Modal.Root (it needs Overlay/Content/etc.).
    files: ["src/**/DashboardView.tsx"],
    rules: { "no-restricted-imports": "off" },
  },
];

export default eslintConfig;
