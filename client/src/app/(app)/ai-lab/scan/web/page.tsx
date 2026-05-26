//src/app/(app)/ai-lab/scan/web/page.tsx
import WebScanner from "@/components/pages/aiLab/WebScanner";

export const metadata = {
  title: "New Web Audit | AI Lab",
};

export default function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground p-3 lg:p-6 font-sans">
      <WebScanner />
    </div>
  );
}
