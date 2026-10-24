import type { Metadata, Viewport } from 'next';
import { Noto_Sans_KR, Noto_Serif_KR } from 'next/font/google';
import Link from 'next/link';
import { RegisterSW } from '@/components/RegisterSW';
import './globals.css';

const sans = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-sans-kr', display: 'swap' });
const serif = Noto_Serif_KR({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-serif-kr', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Reborn · 다시 태어난다면', template: '%s · Reborn' },
  description: '지금 이 순간 태어나는 아기 중 한 명이 되어, 실제 통계 위에서 한 사람의 일생을 살아보는 인생 시뮬레이션.',
  manifest: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/manifest.webmanifest`,
  icons: { icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/icon.svg` },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f2ec' },
    { media: '(prefers-color-scheme: dark)', color: '#13151a' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-dvh">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 btn">본문으로 건너뛰기</a>
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="font-serif text-xl font-bold tracking-tight">
            Re<span className="text-accent">born</span>
          </Link>
          <nav aria-label="주 메뉴" className="flex gap-1 text-sm">
            <Link href="/c/" className="rounded-lg px-3 py-2 text-muted hover:text-ink">국가 통계</Link>
            <Link href="/lives/" className="rounded-lg px-3 py-2 text-muted hover:text-ink">전생 기록</Link>
          </nav>
        </header>
        <main id="main">{children}</main>
        <footer className="mx-auto mt-16 max-w-6xl px-4 pb-10 text-xs leading-relaxed text-faint">
          <p>
            통계: UN 세계인구전망 2024 · UN 국제이주자 통계 2024 · UN 세계결혼통계 2019 (CC BY 3.0 IGO), 세계은행 WDI (WHO·ILO·UNESCO 등, CC BY 4.0), UNHCR.
            자세한 출처와 추정 방법은 <Link href="/c/" className="underline hover:text-ink">국가 통계</Link>에 있습니다.
          </p>
          <p className="mt-2">죽음과 질병, 상실 같은 무거운 일도 통계대로 일어납니다. 장면은 그리지 않습니다. 15세 이상을 위한 시뮬레이션입니다.</p>
        </footer>
        <RegisterSW />
      </body>
    </html>
  );
}
