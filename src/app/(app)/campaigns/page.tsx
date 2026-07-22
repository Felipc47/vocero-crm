import { CampaignsClient } from "@/components/campaigns/campaigns-client";

export const dynamic = "force-dynamic";

export default function CampaignsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-surface px-4 py-3 md:px-[30px] md:py-[18px]">
        <h2 className="font-display text-[22px] font-bold">Envío masivo</h2>
      </header>
      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-[34px] md:py-[26px]">
        <div className="mx-auto max-w-[900px]">
          <CampaignsClient />
        </div>
      </div>
    </div>
  );
}
