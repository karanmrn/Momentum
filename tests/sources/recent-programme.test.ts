import {expect,it} from 'vitest';
import {getCroydonProgrammeSource} from '../../services/data/recent-programme';
it('preserves the announcement date without asserting live deployment',()=>{
 const card=getCroydonProgrammeSource();
 expect(card.publishedAt).toBe('2026-09-09T13:58:20.000Z');
 expect(card.publishedAt).not.toBe(card.fetchedAt);
 expect(card.summary).toContain('does not confirm staff are present now');
 expect(card.synthetic).toBe(false);
});
