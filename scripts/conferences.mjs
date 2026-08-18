import { readFile, writeFile } from "node:fs/promises";
import { parse } from "yaml";

const root = new URL("../", import.meta.url);
const registryPath = new URL("conferences.yaml", root);
const generatedPath = new URL("data/conferences.json", root);

export async function readConferenceRegistry() {
  const registry = parse(await readFile(registryPath, "utf8"));
  return {
    schema_version: registry.schema_version,
    policy: registry.policy,
    generated_from: "conferences.yaml",
    conferences: registry.conferences,
  };
}

export async function writeConferenceData() {
  const registry = await readConferenceRegistry();
  await writeFile(generatedPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return registry;
}
