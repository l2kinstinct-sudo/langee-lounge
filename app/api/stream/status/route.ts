import {NextResponse} from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public, view-only HLS endpoint. Never expose OBS's RTMP ingest port on the internet.
const HLS_PLAYLIST = 'https://stream.langeelounge.com/langee/index.m3u8';

export async function GET() {
  let live = false;
  try {
    const response = await fetch(HLS_PLAYLIST, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(4500),
    });
    if (response.ok) {
      const content = await response.text();
      live = content.startsWith('#EXTM3U');
    }
  } catch {
    // The home PC may be offline, or OBS may not be publishing right now.
  }
  return NextResponse.json({live}, {
    headers: {'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=5'},
  });
}
