// src/app/(app)/computer/[postId]/page.tsx

import ProjectDetails from "@/components/pages/posts/projects/ProjectDetails";

export default async function Page({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  // Await the promise to extract the ID safely
  const { postId } = await params;

  return (
    <div>
      <ProjectDetails postId={postId} />
    </div>
  );
}
