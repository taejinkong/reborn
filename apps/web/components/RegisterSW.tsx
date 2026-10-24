'use client';
import { useEffect } from 'react';
import { BASE_PATH } from '@/lib/world';

/** 오프라인에서도 이어서 할 수 있도록 서비스 워커를 등록한다 (개발 모드 제외) */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(`${BASE_PATH}/sw.js`, { scope: `${BASE_PATH}/` }).catch(() => {});
  }, []);
  return null;
}
