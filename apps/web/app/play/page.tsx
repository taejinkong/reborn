import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Game } from '@/components/Game';

export const metadata: Metadata = { title: '한 번의 삶', robots: { index: false } };

export default function Page() {
  return (
    <Suspense fallback={<div className="grid min-h-[50vh] place-items-center text-muted">불러오는 중…</div>}>
      <Game />
    </Suspense>
  );
}
