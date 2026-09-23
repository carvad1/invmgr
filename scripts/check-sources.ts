import { readFileSync } from "node:fs";
import { parseAigenisBonds } from "../electron/research-source";
import {
  parseAigenis,
  parseFinstore,
  parseNbrb,
  download,
} from "../electron/sources";
for (const [name, parser, url] of [
  ["finstore", parseFinstore, "https://finstore.by/kupit-tokeny/"],
  ["aigenis", parseAigenis, "https://aigenis.by/"],
  ["aigenis-bonds", parseAigenisBonds, "https://aigenis.by/bonds/"],
] as const) {
  const html = process.argv.includes("--live")
    ? await download(url)
    : readFileSync(`.local/sources/${name}.html`, "utf8");
  const items = parser(html);
  console.log(name, items.length, JSON.stringify(items.slice(0, 2), null, 2));
  if (!items.length) process.exitCode = 1;
}
if (process.argv.includes("--live"))
  console.log(
    "nbrb",
    parseNbrb(
      await download("https://api.nbrb.by/exrates/rates?periodicity=0"),
    ),
  );
