import { runScenario, scenarioPack } from "./index.js";

const ids = process.argv[2]
  ? [process.argv[2]]
  : scenarioPack.scenarios.map((scenario) => scenario.id);
const results = ids.map((id) => {
  const { state: _state, ...transcript } = runScenario(id);
  return transcript;
});
const counts = {
  authors: scenarioPack.authors.length,
  scenarios: scenarioPack.scenarios.length,
  private: scenarioPack.scenarios.filter(
    (scenario) => scenario.publication === "private_only",
  ).length,
  reviewable: scenarioPack.scenarios.filter(
    (scenario) => scenario.publication === "reviewable",
  ).length,
};
process.stdout.write(
  `${JSON.stringify({ synthetic: true, origin: "original_fiction", counts, results }, null, 2)}\n`,
);
