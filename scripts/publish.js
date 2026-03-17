#!/usr/bin/env node
/**
 * publish.js - AgenticKIT monorepo publish script
 *
 * Usage:
 *   node scripts/publish.js                    # dry run (default)
 *   node scripts/publish.js --publish           # publish to npm + git tag
 *   node scripts/publish.js --publish --no-git-tag  # publish without git tag
 *   node scripts/publish.js --tag beta          # publish with npm tag
 *   node scripts/publish.js --bump patch        # bump version (patch|minor|major)
 */

const {spawnSync} = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const PUBLISH_ORDER = [
  "utils",
  "core",
  "memory",
  "tools",
  "tools-builtin",
  "context",
  "agents",
  "kit",
];

// CLI args
const args = process.argv.slice(2);
const DRY_RUN    = !args.includes("--publish");
const NO_GIT_TAG = args.includes("--no-git-tag");
const TAG  = (() => { const i = args.indexOf("--tag");  return i >= 0 ? args[i + 1] : "latest"; })();
const BUMP = (() => { const i = args.indexOf("--bump"); return i >= 0 ? args[i + 1] : null; })();

// Helpers
function log(msg)  { console.log("\x1b[36m" + msg + "\x1b[0m"); }
function ok(msg)   { console.log("\x1b[32m" + msg + "\x1b[0m"); }
function warn(msg) { console.log("\x1b[33m" + msg + "\x1b[0m"); }
function fail(msg) { console.error("\x1b[31m" + msg + "\x1b[0m"); }

function run(cmd, cwd) {
  const result = spawnSync(cmd, {shell: true, cwd: cwd || ROOT, stdio: "inherit"});
  if (result.status !== 0) throw new Error("Command failed: " + cmd);
}

function pkgPath(name) { return path.join(ROOT, "packages", name); }

function readPkg(name) {
  return JSON.parse(fs.readFileSync(path.join(pkgPath(name), "package.json"), "utf8"));
}

function writePkg(name, pkg) {
  fs.writeFileSync(path.join(pkgPath(name), "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");
}

function bumpVersion(version, type) {
  const parts = version.split(".").map(Number);
  if (type === "major")      { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else if (type === "minor") { parts[1]++; parts[2] = 0; }
  else                       { parts[2]++; }
  return parts.join(".");
}

function isPublished(pkgName, version) {
  try {
    const r = spawnSync("npm", ["view", pkgName + "@" + version, "version"], {shell: true, encoding: "utf8"});
    return r.stdout.trim() === version;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function stepTypecheck() {
  log("\n[1/5] Running typecheck...");
  run("pnpm -r run typecheck");
  ok("  typecheck passed");
}

function stepBump() {
  if (!BUMP) return;
  log("\n[2/5] Bumping versions (" + BUMP + ")...");
  for (const name of PUBLISH_ORDER) {
    const pkg = readPkg(name);
    const oldVer = pkg.version;
    pkg.version = bumpVersion(oldVer, BUMP);
    for (const field of ["dependencies", "peerDependencies", "devDependencies"]) {
      if (!pkg[field]) continue;
      for (const dep of Object.keys(pkg[field])) {
        if (dep.startsWith("@agentickit/")) pkg[field][dep] = "^" + pkg.version;
      }
    }
    writePkg(name, pkg);
    ok("  " + pkg.name + ": " + oldVer + " -> " + pkg.version);
  }
}

function stepBuild() {
  log("\n[3/5] Building all packages...");
  run("pnpm -r run build");
  ok("  build complete");
}

function stepPublish() {
  log("\n[4/5] Publishing packages" + (DRY_RUN ? " (DRY RUN)" : "") + "...");
  const results = [];

  for (const name of PUBLISH_ORDER) {
    const pkg = readPkg(name);
    const pkgName = pkg.name;
    const version = pkg.version;

    if (pkg.private) {
      warn("  skip " + pkgName + " (private)");
      results.push({name: pkgName, status: "skipped", reason: "private"});
      continue;
    }

    if (!DRY_RUN && isPublished(pkgName, version)) {
      warn("  skip " + pkgName + "@" + version + " (already published)");
      results.push({name: pkgName, status: "skipped", reason: "already published"});
      continue;
    }

    if (!fs.existsSync(path.join(pkgPath(name), "dist"))) {
      fail("  FAIL " + pkgName + " - dist/ not found");
      results.push({name: pkgName, status: "failed", reason: "no dist"});
      continue;
    }

    const cmd = DRY_RUN
      ? "npm publish --dry-run --access public --tag " + TAG
      : "npm publish --access public --tag " + TAG;

    try {
      log("  publishing " + pkgName + "@" + version + "...");
      run(cmd, pkgPath(name));
      ok("  published " + pkgName + "@" + version);
      results.push({name: pkgName, version, status: "published"});
    } catch (e) {
      fail("  FAIL " + pkgName + ": " + e.message);
      results.push({name: pkgName, status: "failed", reason: e.message});
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(50));
  log("Publish summary" + (DRY_RUN ? " (DRY RUN)" : ""));
  console.log("=".repeat(50));
  for (const r of results) {
    const icon   = r.status === "published" ? "\x1b[32mOK\x1b[0m" : r.status === "skipped" ? "\x1b[33m--\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    const detail = r.version ? "@" + r.version : (r.reason ? "(" + r.reason + ")" : "");
    console.log("  [" + icon + "] " + r.name + " " + detail);
  }

  const failed = results.filter(r => r.status === "failed");
  if (failed.length > 0) {
    fail("\n" + failed.length + " package(s) failed to publish.");
    process.exit(1);
  }

  return results;
}

function stepGitTag(results) {
  if (DRY_RUN) {
    warn("\n[5/5] Git tag: skipped (dry-run)");
    return;
  }
  if (NO_GIT_TAG) {
    warn("\n[5/5] Git tag: skipped (--no-git-tag)");
    return;
  }

  const published = results.filter(r => r.status === "published");
  if (published.length === 0) {
    warn("\n[5/5] Git tag: nothing new published, skipping");
    return;
  }

  log("\n[5/5] Creating git tag...");
  const version = published[0].version;
  const tag = "v" + version;

  try {
    // Check if tag already exists
    const check = spawnSync("git", ["tag", "-l", tag], {cwd: ROOT, encoding: "utf8"});
    if (check.stdout.trim() === tag) {
      warn("  tag " + tag + " already exists, skipping");
      return;
    }

    // Commit version bumps if any
    if (BUMP) {
      run("git add packages/*/package.json");
      run("git commit -m \"chore: release " + tag + "\"");
      ok("  committed version bump");
    }

    // Create annotated tag
    run("git tag -a " + tag + " -m \"Release " + tag + "\"");
    ok("  created tag: " + tag);

    // Push tag to origin
    run("git push origin " + tag);
    ok("  pushed tag: " + tag);

    // Push version bump commit if bumped
    if (BUMP) {
      run("git push");
      ok("  pushed version bump commit");
    }
  } catch (e) {
    warn("  git tag failed (non-fatal): " + e.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log("\n" + "=".repeat(50));
  log("AgenticKIT publish script");
  console.log("  mode : " + (DRY_RUN ? "DRY RUN (use --publish to actually publish)" : "PUBLISH"));
  console.log("  tag  : " + TAG);
  console.log("  bump : " + (BUMP || "none"));
  console.log("  git  : " + (NO_GIT_TAG ? "disabled" : DRY_RUN ? "skipped (dry-run)" : "tag + push"));
  console.log("=".repeat(50));

  try {
    stepTypecheck();
    stepBump();
    stepBuild();
    const results = stepPublish();
    stepGitTag(results);
    ok("\nDone.");
  } catch (e) {
    fail("\nAborted: " + e.message);
    process.exit(1);
  }
}

main();
