let browserSnapshot: File | null = null;

export async function saveMetadataSnapshot(file: File): Promise<void> {
  if (typeof window !== "undefined" && window.naiDesktop?.saveMetadataSnapshot) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    const result = await window.naiDesktop.saveMetadataSnapshot({
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      base64: btoa(binary),
    });
    if (result.ok) return;
  }
  browserSnapshot = new File([file], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export async function loadMetadataSnapshot(): Promise<File | null> {
  if (typeof window !== "undefined" && window.naiDesktop?.loadMetadataSnapshot) {
    const result = await window.naiDesktop.loadMetadataSnapshot();
    if (result.ok && result.snapshot) {
      const binary = atob(result.snapshot.base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return new File([bytes], result.snapshot.name || "metadata-image.png", {
        type: result.snapshot.type,
        lastModified: result.snapshot.lastModified,
      });
    }
  }
  return browserSnapshot
    ? new File([browserSnapshot], browserSnapshot.name, {
        type: browserSnapshot.type,
        lastModified: browserSnapshot.lastModified,
      })
    : null;
}
