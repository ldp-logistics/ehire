const fs = require("fs");
const path = "DepartmentService.ts";
let s = fs.readFileSync(path, "utf8");
// Match line with either ASCII or Unicode apostrophe in "system's"
const oldRegex = /\s+\/\/ Only our system['\u2019]s active employees are updated \(our DB is source of truth for active vs terminated\)\s*\r?\n\s+const ourActive = await this\.employeeRepo\.listActiveIdAndEmail\(\);/;
const newBlock = `    for (const [ftId, name] of collectedShifts) {
      try {
        const result = await this.orgRepo.upsertWorkShift(ftId, name);
        if (result.created) stats.workShifts.created++;
        else stats.workShifts.updated++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ source: "workShifts", id: parseInt(ftId, 10), error: msg });
      }
    }
    for (const [ftId, name] of collectedJobCategories) {
      try {
        const result = await this.orgRepo.upsertJobCategory(ftId, name);
        if (result.created) stats.jobCategories.created++;
        else stats.jobCategories.updated++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ source: "jobCategories", id: parseInt(ftId, 10), error: msg });
      }
    }

    // Only our system's active employees are updated (our DB is source of truth for active vs terminated)
    const ourActive = await this.employeeRepo.listActiveIdAndEmail();`;
if (oldRegex.test(s)) {
  s = s.replace(oldRegex, newBlock);
  fs.writeFileSync(path, s);
  console.log("Replaced OK");
} else {
  console.log("Pattern not found");
  const idx = s.indexOf("const ourActive = await this.employeeRepo.listActiveIdAndEmail()");
  if (idx >= 0) {
    const start = Math.max(0, idx - 120);
    console.log("Context:", JSON.stringify(s.slice(start, idx + 80)));
  }
}
