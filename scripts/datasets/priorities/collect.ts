import { writeFile } from 'node:fs/promises';
import { collectPriorities } from './index';
const result=await collectPriorities('.data/datasets/priorities');
await writeFile('research/datasets/priorities-status.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
