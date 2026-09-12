import {describe,it,expect} from 'vitest';
import {normalize,query,anchors} from '../../scripts/datasets/osm/collect';
const node={type:'node',id:123,version:2,timestamp:'2026-09-01T00:00:00Z',lat:51.5,lon:-0.1,user:'discarded',uid:1,tags:{amenity:'library',name:'Synthetic library',phone:'discarded',description:'discarded'}};
const source=(elements:unknown[])=>({osm3s:{timestamp_osm_base:'2026-09-12T00:00:00Z'},elements});
describe('OSM map context',()=>{
 it('retains provenance and filters unnecessary metadata',()=>{const result=normalize(source([node]));expect(result.records[0]).toMatchObject({id:123,version:2,timestamp:node.timestamp,live:false,helpSchemeMembership:'not_established'});expect(result.records[0].tags).toEqual({amenity:'library',name:'Synthetic library'});expect(result.records[0]).not.toHaveProperty('user');expect(result.records[0]).not.toHaveProperty('uid');});
 it('rejects partial responses, duplicates and private or unrelated amenities',()=>{expect(()=>normalize({...source([node]),remark:'timeout'})).toThrow();expect(()=>normalize(source([node,node]))).toThrow();expect(()=>normalize(source([{...node,tags:{amenity:'pub'}}]))).toThrow();expect(()=>normalize(source([{...node,tags:{amenity:'library',access:'private'}}]))).toThrow();});
 it('labels way centers and rejects missing coordinates',()=>{const result=normalize(source([{...node,type:'way',center:{lat:51.5,lon:-0.1}}]));expect(result.records[0].coordinateMeaning).toBe('bounding_box_center');expect(()=>normalize(source([{...node,type:'way'}]))).toThrow();});
 it('restricts requests to named one-mile circles and categories',()=>{expect(query(anchors[0])).toContain('around:1609.344,51.4683,-0.3618');expect(query(anchors[0])).not.toContain('pub');expect(()=>query({...anchors[0],lat:0})).toThrow();});
});
