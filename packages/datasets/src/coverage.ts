import { z } from 'zod';
import { pilotSchema, type PilotId } from '../../contracts/index';
import snapshot from '../../../research/datasets/coverage.json';

const month=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const datasetCoverageSchema=z.object({
  id:z.string().min(1).max(100),title:z.string().min(1).max(150),pilotId:pilotSchema,
  sourceKind:z.enum(['historical_police','transport','official_statistics','civic','community']),
  status:z.enum(['acquired','partial','blocked','not_collected']),
  acquiredMonths:z.array(month).max(36),latestMonth:month.nullable(),fetchedAt:z.string().datetime().nullable(),
  sourceUrl:z.union([z.string().url().startsWith('https://'),z.literal('')]),
  geographyDescription:z.string().min(1).max(800),limitations:z.array(z.string().max(1000)).max(20),
  recordCount:z.null(),acquiredUnits:z.number().int().nonnegative().nullable(),unitLabel:z.string().max(100).nullable(),
}).strict().superRefine((row,ctx)=>{
  if(new Set(row.acquiredMonths).size!==row.acquiredMonths.length)ctx.addIssue({code:'custom',message:'Months must be unique.'});
  if(row.acquiredMonths.length&&row.latestMonth!==[...row.acquiredMonths].sort().at(-1))ctx.addIssue({code:'custom',message:'The latest month must match collected months.'});
  if(row.status==='acquired'&&(!row.fetchedAt||!row.sourceUrl||row.acquiredUnits===null||row.acquiredUnits<1))ctx.addIssue({code:'custom',message:'Acquired data needs source evidence.'});
  if(row.sourceKind==='historical_police'&&row.unitLabel!=='monthly source files')ctx.addIssue({code:'custom',message:'Police coverage measures files, not local crime totals.'});
  if(row.status==='not_collected'&&(row.acquiredUnits!==null||row.acquiredMonths.length))ctx.addIssue({code:'custom',message:'Missing data cannot claim acquired units.'});
});
export type DatasetCoverageRecord=z.infer<typeof datasetCoverageSchema>;
const schema=z.object({schemaVersion:z.literal('1.0'),generatedAt:z.string().datetime(),records:z.array(datasetCoverageSchema).max(60)}).strict();
export function parseDatasetCoverage(input:unknown):DatasetCoverageRecord[]{
  const parsed=schema.parse(input);
  const ids=new Set<string>();
  for(const row of parsed.records){const key=`${row.pilotId}:${row.id}`;if(ids.has(key))throw new Error('Duplicate dataset coverage.');ids.add(key);}
  return parsed.records;
}
/** Public acquisition metadata only. This is a dated snapshot, not a current operational feed. */
export function getDatasetCoverage(pilotId:PilotId):DatasetCoverageRecord[]{
  pilotSchema.parse(pilotId);
  return parseDatasetCoverage(snapshot).filter(row=>row.pilotId===pilotId);
}
