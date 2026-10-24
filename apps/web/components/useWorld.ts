'use client';
import type { World } from '@reborn/engine';
import { useEffect, useState } from 'react';
import { loadWorld } from '@/lib/world';

export function useWorld(): { world: World | null; error: string | null } {
  const [world, setWorld] = useState<World | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadWorld().then((w) => alive && setWorld(w)).catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, []);
  return { world, error };
}
