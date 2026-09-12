import { areas, type PilotId } from '../packages/contracts';

export function entryArea(search: string): { areaId: PilotId; invalid: boolean } {
  const requested = new URLSearchParams(search).get('area');
  const area = areas.find((item) => item.id === requested);
  return { areaId: area?.id ?? areas[0].id, invalid: requested !== null && !area };
}

export const publicBrowse = typeof window !== 'undefined' &&
  (import.meta.env.PROD || new URLSearchParams(window.location.search).get('public') === '1') &&
  new URLSearchParams(window.location.search).get('demo') !== '1';

export function rememberArea(areaId: string) {
  if (!areas.some((area) => area.id === areaId)) return;
  const url = new URL(window.location.href);
  url.searchParams.set('area', areaId);
  window.history.replaceState(null, '', url);
}
