//src/app/(app)/ai-lab/report/[engine]/[reportId]/page.tsx
import ReportDetails from "@/components/pages/aiLab/ReportDetails";

export const metadata = {
  title: "Audit Report | AI Lab",
};

export default async function Page({
  params,
}: {
  params: Promise<{ engine: string; reportId: string }>;
}) {
  const { engine, reportId } = await params;

  return (
    <div className="min-h-screen bg-background text-foreground p-3 lg:p-6 font-sans">
      <ReportDetails engine={engine} reportId={reportId} />
    </div>
  );
}
