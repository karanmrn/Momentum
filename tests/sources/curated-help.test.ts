import {expect,it} from 'vitest';
import {getCamdenHelp,getCamdenDirectorySource} from '../../services/data/camden-help';
it('provides selected venues with source location and unconfirmed availability',()=>{
 const cards=getCamdenHelp();expect(cards).toHaveLength(5);
 for(const card of cards){expect(card.availability).toBe('unconfirmed');expect(card.checkedAt).toBeTruthy();expect(card.sourceLabel).toContain('Camden');}
 const venues=cards.filter(card=>card.kind==='venue');expect(venues).toHaveLength(4);
 expect(venues.every(card=>card.coordinates&&card.address)).toBe(true);
 expect(getCamdenDirectorySource().recordCountLabel).toBe('Selected help listings');
});
it('does not expose the internal dataset or claims of current access',()=>{
 expect(JSON.stringify(getCamdenHelp())).not.toContain('publicationAllowed');
 expect(getCamdenHelp().find(card=>card.id==='camden-ice-wharf')?.summary).toContain('under-18');
});
