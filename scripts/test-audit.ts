import { scanUrl } from "../lib/audit/scanner";

const TEST_URLS = [
  "https://utahshuttersandblinds.com",
  "https://aspenblindsanddrapery.com",
  "https://utahvalleyshutter.com",
  "https://www.blindsbydesignutah.com",
];

async function main() {
  for (const url of TEST_URLS) {
    console.log("\n" + "=".repeat(74));
    console.log("SCANNING:", url);
    console.log("=".repeat(74));
    try {
      const report = await scanUrl(url);
      console.log(`Score: ${report.score}/100  —  ${report.grade}`);
      console.log(`Domain: ${report.domain}`);
      console.log(`Title: ${report.pageTitle}`);
      console.log("\nTop 3 issues:");
      for (const f of report.topThree) {
        console.log(`  [${f.severity.toUpperCase()}] ${f.title}`);
        console.log(`    ${f.detail}`);
      }
      console.log("\nQuick insights:");
      for (const q of report.quickInsights) {
        console.log(`  . ${q}`);
      }
      console.log("\nAll findings:");
      for (const f of report.findings) {
        const mark = f.severity === "pass" ? "PASS" : f.severity === "critical" ? "CRIT" : "WARN";
        console.log(`  ${mark}  ${f.score}/${f.maxPoints}  ${f.title}`);
      }
    } catch (err) {
      console.error("ERROR:", (err as Error).message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
