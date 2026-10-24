// 엔진 입력 데이터를 내려받아 World를 만든다. 한 번만 내려받고 재사용한다.
import { World } from '@reborn/engine';

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

let pending: Promise<World> | null = null;

export function loadWorld(): Promise<World> {
  if (!pending) {
    const v = process.env.NEXT_PUBLIC_DATA_VERSION ?? 'dev';
    const get = (name: string) => fetch(`${BASE_PATH}/data/${name}?v=${v}`).then((r) => {
      if (!r.ok) throw new Error(`${name}: ${r.status}`);
      return r.json();
    });
    pending = Promise.all([get('countries.json'), get('lifetable-2023.json'), get('content.json'), get('calibration.json')])
      .then(([countries, lifetable, content, calibration]) => new World({ countries, lifetable, content, calibration }))
      .catch((e) => {
        pending = null;
        throw e;
      });
  }
  return pending;
}
