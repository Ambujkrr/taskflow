import { spawn } from "node:child_process";
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this script using npm run verify.");
for (const args of [
  ["run", "lint"],
  ["run", "typecheck"],
  ["test"],
  ["run", "build"],
  ["audit", "--omit=dev", "--audit-level=high"],
]) {
  console.log("\nChecking: npm " + args.join(" "));
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npm, ...args], {
      stdio: "inherit",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", resolve);
  });
  if (code !== 0) process.exit(typeof code === "number" ? code : 1);
}
console.log(
  "\nAll required local checks passed. Run browser smoke tests against the running app separately.",
);
