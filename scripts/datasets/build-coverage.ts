import { readFile,writeFile,rename } from 'node:fs/promises';
import { buildDatasetCoverage } from '../../packages/datasets/src/project';
const read=async(name:string):Promise<unknown>=>{
 try{return JSON.parse(await readFile(`research/datasets/${name}-status.json`,'utf8'));}catch{return undefined;}
};
const [police,tfl,ons,priorities]=await Promise.all(['police','tfl','ons','priorities'].map(read));
const generatedAt=new Date().toISOString();
let output;
try { output=buildDatasetCoverage({police,tfl,ons,priorities},generatedAt); }
catch {
 // Do not retain acquired cards when an unexpected malformed collector result reaches the projection.
 output=buildDatasetCoverage({},generatedAt);
 process.exitCode=1;
}
const path='research/datasets/coverage.json';
await writeFile(`${path}.tmp`,JSON.stringify(output,null,2)+'\n');
await rename(`${path}.tmp`,path);
