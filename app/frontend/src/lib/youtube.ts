export function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] || null;
    }

    if (
      hostname !== 'youtube.com' &&
      hostname !== 'www.youtube.com' &&
      hostname !== 'm.youtube.com'
    ) {
      return null;
    }

    const queryId = url.searchParams.get('v');
    if (queryId) return queryId;

    const [, pathId] = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?]+)/) ?? [];
    return pathId || null;
  } catch {
    return null;
  }
}
