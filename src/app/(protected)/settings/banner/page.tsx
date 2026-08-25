import { normalizeBannerColor } from "@/lib/banner/banner";
import { getSettings } from "@/lib/settings/queries";
import { BannerForm } from "./BannerForm";

export default async function BannerPage() {
  const settings = await getSettings();
  return (
    <BannerForm
      initial={{
        enabled: settings.bannerEnabled,
        text: settings.bannerText,
        // Resolve unset/unknown to the default swatch so the form shows what
        // the banner actually renders.
        color: normalizeBannerColor(settings.bannerColor),
        height: settings.bannerHeight,
      }}
    />
  );
}
