import { useCallback, useEffect, useRef, useState } from 'react';
import { type AdminVideo, listAdminVideos, searchAdminVideos } from '../lib/api';

export function useAdminVideos(searchQuery?: string, enabled = true) {
  const [videos, setVideos] = useState<AdminVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-fetch ID so a stale response can't overwrite fresher results
  // when the user types faster than the network replies.
  const fetchIdRef = useRef(0);

  const load = useCallback(async () => {
    const myId = ++fetchIdRef.current;
    if (!enabled) {
      setLoading(false);
      setError(null);
      setVideos([]);
      return;
    }
    const trimmed = (searchQuery ?? '').trim();
    try {
      setLoading(true);
      setError(null);
      const data = trimmed ? await searchAdminVideos(trimmed) : await listAdminVideos();
      if (myId === fetchIdRef.current) setVideos(data.videos);
    } catch (e) {
      if (myId === fetchIdRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load videos');
      }
    } finally {
      if (myId === fetchIdRef.current) setLoading(false);
    }
  }, [searchQuery, enabled]);

  useEffect(() => {
    void load();
    return () => {
      fetchIdRef.current += 1;
    };
  }, [load]);

  return {
    videos,
    loading,
    error,
    refetch: load,
  };
}
