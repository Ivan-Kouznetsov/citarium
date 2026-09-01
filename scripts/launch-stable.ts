import { spawn } from "child_process";
import os from "os";
import fs from "fs";
import path from "path";

const platform = os.platform();
const arch = os.arch();

const osName = platform === "darwin" ? "macos" : platform === "win32" ? "win" : "linux";
let targetDir = path.resolve(process.cwd(), "build", `stable-${osName}-${arch}`);

if (!fs.existsSync(targetDir)) {
  const buildDir = path.resolve(process.cwd(), "build");
  if (fs.existsSync(buildDir)) {
    const matching = fs.readdirSync(buildDir).find((d) => d.startsWith("stable-"));
    if (matching) {
      targetDir = path.resolve(buildDir, matching);
    }
  }
}

if (platform === "darwin") {
  const appPath = path.join(targetDir, "Citarium.app");
  if (fs.existsSync(appPath)) {
    console.log(`🚀 Launching Citarium (${appPath})...`);
    const child = spawn("open", [appPath], { stdio: "inherit", detached: true });
    child.unref();
  } else {
    console.error(`❌ Could not find ${appPath}. Make sure to build first.`);
    process.exit(1);
  }
} else if (platform === "win32") {
  const exePath = path.join(targetDir, "Citarium.exe");
  if (fs.existsSync(exePath)) {
    console.log(`🚀 Launching Citarium (${exePath})...`);
    const child = spawn("cmd", ["/c", "start", "", exePath], { stdio: "inherit", detached: true });
    child.unref();
  } else {
    console.error(`❌ Could not find ${exePath}. Make sure to build first.`);
    process.exit(1);
  }
} else {
  const binPath = path.join(targetDir, "Citarium");
  if (fs.existsSync(binPath)) {
    console.log(`🚀 Launching Citarium (${binPath})...`);
    const child = spawn(binPath, [], { stdio: "inherit", detached: true });
    child.unref();
  } else {
    console.error(`❌ Could not find ${binPath}. Make sure to build first.`);
    process.exit(1);
  }
}
