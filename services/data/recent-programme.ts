import type {SourceCard} from '../../packages/contracts/index';

/** Dated announcement. This does not assert current staff availability. */
export function getCroydonProgrammeSource(): SourceCard {
 return {
  id:'croydon-school-support-2026-09',
  title:'September school-travel support',
  summary:'On 9 September, the council reported youth support at West Croydon station during September\'s first two weeks. This announcement does not confirm staff are present now.',
  url:'https://news.croydon.gov.uk/back-to-school-keeping-our-young-people-safe/',
  status:'available',sourceKind:'council_directory',synthetic:false,
  publishedAt:'2026-09-09T13:58:20.000Z',fetchedAt:'2026-09-12T12:55:50.904Z',
  checkedAt:'2026-09-12T12:55:50.904Z',attribution:'Croydon Council',
  scope:'Dated programme announcement covering West Croydon station and other Croydon locations. No live deployment feed.',
 };
}
