//src/app/(app)/ai-lab/scan/repo/page.tsx
import RepoScanner from "@/components/pages/aiLab/RepoScanner";

export const metadata = {
  title: "New Repo Audit | AI Lab",
};

export default function Page() {
  return (
    <div className="min-h-screen bg-background text-foreground p-3 lg:p-6 font-sans">
      <RepoScanner />
    </div>
  );
}
