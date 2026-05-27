//src/lib/features/ai/downloadHelper.ts

export const triggerFileDownload = (blob: Blob, filename: string) => {
  // Create a temporary object URL for the blob
  const url = window.URL.createObjectURL(blob);

  // Create a hidden anchor tag
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);

  // Append to body, click it to trigger download, then clean up immediately
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);

  // Free up browser memory
  window.URL.revokeObjectURL(url);
};
