import { useEffect, useState } from 'react';
import { localRuntimeApi, type LocalInfo } from '../api/local-runtime.api';

export function useLocalServerInfo() {
  const [info, setInfo] = useState<LocalInfo | null>(null);

  useEffect(() => {
    if (typeof fetch !== 'function') return;
    let active = true;
    void localRuntimeApi.info().then((value) => {
      if (active) setInfo(value);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  return info;
}
