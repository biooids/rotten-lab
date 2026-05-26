//src/app/(app)/ai-lab/page.tsx
import AiDashboard from "@/components/pages/aiLab/AiDashboard";

export const metadata = {
  title: "AI Lab Dashboard | AppSec Pipeline",
  description: "View static code analysis and web vulnerability scan history.",
};

export default function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground p-3 lg:p-6 font-sans">
      <AiDashboard />
    </div>
  );
}
