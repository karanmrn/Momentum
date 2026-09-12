import { expect,it } from 'vitest';
import { priorityEvidence } from '../../scripts/datasets/priorities/index';
const url='https://data.police.uk/api/metropolitan/E05013655/priorities';
const time='2026-09-12T12:00:00Z';
it('preserves source-stated issue/action links without community or causal confirmation',()=>{
 const result=priorityEvidence('camden_town',url,time,[{issue:'Synthetic issue',action:'Synthetic planned patrol', 'issue-date':'2026-09-01T00:00:00','action-date':'2026-09-02T00:00:00'}],true);
 expect(result.nodes).toHaveLength(2);expect(result.edges).toHaveLength(1);
 expect(result.nodes[0]).toMatchObject({independentCommunityReport:false,publicationAllowed:false});
 expect(result.nodes[1]).toMatchObject({completionVerified:false});
 expect(result.edges[0]).toMatchObject({causalClaim:false,independentCorroboration:false,relation:'SOURCE_STATES_RESPONSE_TO'});
});
it('does not invent an action for an empty source field',()=>{
 const result=priorityEvidence('camden_town',url,time,[{issue:'Synthetic issue',action:'','issue-date':null,'action-date':null}],true);
 expect(result.synthetic).toBe(true);expect(result.nodes[0].timePrecision).toBe('unknown');expect(result.nodes).toHaveLength(1);expect(result.edges).toHaveLength(0);
});
it('rejects an unrelated source host and malformed rows',()=>{
 expect(()=>priorityEvidence('camden_town','https://evil.example/data',time,[])).toThrow();
 expect(()=>priorityEvidence('camden_town',url,time,[{issue:'x'}])).toThrow();
});
