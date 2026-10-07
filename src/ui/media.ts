import { useEffect, useState } from 'react';

/** Handy-Layout (gleiche Grenze wie im CSS) */
export const MOBILE = '(max-width: 760px)';

/** true, solange die Media-Query zutrifft – für Ansichten, die am Handy anders aufgebaut sind */
export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatch(mq.matches);
    mq.addEventListener('change', onChange); onChange();
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return match;
}
