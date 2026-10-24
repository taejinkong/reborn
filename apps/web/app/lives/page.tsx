import type { Metadata } from 'next';
import { Lives } from '@/components/Lives';

export const metadata: Metadata = { title: '전생 기록', robots: { index: false } };

export default function Page() {
  return <Lives />;
}
