import { writeFile } from "node:fs/promises";
import {
  analyse,
  syntheticInputs,
} from "../../packages/analytics/src/index.js";
import { pilotSchema } from "../../packages/contracts/index.js";
const pilot = pilotSchema.parse(process.argv[2] ?? "camden_town");
const output = process.argv[3];
if (!output) throw new Error("Provide an output JSON path.");
const fixture = syntheticInputs(pilot);
await writeFile(
  output,
  JSON.stringify(
    {
      warning: "Invented demonstration. Not empirical evidence.",
      ...fixture,
      result: analyse(fixture.question, ...fixture.inputs),
    },
    null,
    2,
  ),
);
console.log("Saved fictional inputs and the reproducible descriptive result.");
