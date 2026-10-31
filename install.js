const os = require("os");
const childProcess = require("child_process");
const path = require("path");
const fs = require("fs");
const process = require("process");

const isNpmBuildFromSourceSet = process.env.npm_config_build_from_source;
const platform = process.platform;
const arch = process.arch;
const DEFAULT_RIAG_SOURCE_DIR = path.resolve(__dirname, "../riagraph");

function resolveExistingPath(candidate) {
  if (!candidate) {
    return null;
  }
  const resolved = path.resolve(candidate);
  return fs.existsSync(resolved) ? resolved : null;
}

function getDefaultBuildDir(riagSourceDir) {
  return riagSourceDir ? path.join(riagSourceDir, "build", "release") : null;
}

function getDefaultPrecompiledLibPath(riagBuildDir) {
  if (!riagBuildDir) {
    return null;
  }
  const candidates = platform === "win32"
    ? [
        path.join(riagBuildDir, "src", "Release", "riag.lib"),
        path.join(riagBuildDir, "src", "riag.lib"),
        path.join(riagBuildDir, "src", "Release", "libriag.lib"),
        path.join(riagBuildDir, "src", "libriag.lib"),
      ]
    : [path.join(riagBuildDir, "src", "libriag.a")];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

// When the package was published with prebuilt binaries, each platform's
// binary lives in a dedicated optional sub-package.  npm may hoist it to the
// project root's node_modules or keep it nested; resolve() handles both.
const MAIN_PKG_NAME = require(path.join(__dirname, "package.json")).name;
const subPkgName = `${MAIN_PKG_NAME}-${platform}-${arch}`;

let subPkgBinaryPath = null;
try {
  // require.resolve finds the sub-package regardless of hoisting depth.
  const subPkgMain = require.resolve(`${subPkgName}/package.json`, { paths: [__dirname] });
  subPkgBinaryPath = path.join(path.dirname(subPkgMain), "riagjs.node");
  if (!fs.existsSync(subPkgBinaryPath)) subPkgBinaryPath = null;
} catch (e) {
  // Sub-package not installed (unsupported platform or missing optionalDep).
}

// Fall back to the legacy prebuilt/ directory layout for compatibility with
// tarballs built before the per-platform sub-package migration.
const legacyPrebuiltPath = path.join(
  __dirname,
  "prebuilt",
  `riagjs-${platform}-${arch}.node`
);

const prebuiltPath = subPkgBinaryPath
  ? subPkgBinaryPath
  : fs.existsSync(legacyPrebuiltPath)
  ? legacyPrebuiltPath
  : null;

// Check if building from source is forced
if (isNpmBuildFromSourceSet) {
  console.log(
    "The NPM_CONFIG_BUILD_FROM_SOURCE environment variable is set. Building from source."
  );
} else if (prebuiltPath) {
  console.log(`Prebuilt binary found at ${prebuiltPath}.`);
  console.log("Copying prebuilt binary to package directory...");
  fs.copyFileSync(prebuiltPath, path.join(__dirname, "riagjs.node"));
  console.log(
    `Copied ${prebuiltPath} -> ${path.join(__dirname, "riagjs.node")}.`
  );
  // When the package was built with prebuilt binaries, the JS files are
  // already present in the package root (copied by package.js at publish
  // time).  No further copying is needed.
  console.log("Done!");
  process.exit(0);
} else {
  console.log("Prebuilt binary is not available, building from source...");
}

const externalRiaGSourceDir = resolveExistingPath(
  process.env.RIAG_SOURCE_DIR || DEFAULT_RIAG_SOURCE_DIR
);
const externalRiaGBuildDir = resolveExistingPath(
  process.env.RIAG_BUILD_DIR || getDefaultBuildDir(externalRiaGSourceDir)
);
const externalPrecompiledLibPath = resolveExistingPath(
  process.env.RIAG_NODEJS_PRECOMPILED_LIB_PATH ||
    getDefaultPrecompiledLibPath(externalRiaGBuildDir)
);

// Get number of threads
const THREADS = os.cpus().length;
console.log(`Using ${THREADS} threads to build RiaG.`);

// Install dependencies
console.log("Installing dependencies...");
childProcess.execSync("npm install", {
  cwd: path.join(__dirname, "riag-source", "tools", "nodejs_api"),
  stdio: "inherit",
});

// Build the RiaG source code
console.log("Building RiaG source code...");
const env = { ...process.env };
if (externalRiaGSourceDir) {
  env.RIAG_SOURCE_DIR = externalRiaGSourceDir;
}
if (externalRiaGBuildDir) {
  env.RIAG_BUILD_DIR = externalRiaGBuildDir;
}

if (process.platform === "darwin") {
  const archflags = process.env["ARCHFLAGS"]
    ? process.env["ARCHFLAGS"] === "-arch arm64"
      ? "arm64"
      : process.env["ARCHFLAGS"] === "-arch x86_64"
        ? "x86_64"
        : null
    : null;
  if (archflags) {
    console.log(`The ARCHFLAGS is set to '${archflags}'.`);
    env["CMAKE_OSX_ARCHITECTURES"] = archflags;
  } else {
    console.log("The ARCHFLAGS is not set or is invalid and will be ignored.");
  }

  const deploymentTarget = process.env["MACOSX_DEPLOYMENT_TARGET"];
  if (deploymentTarget) {
    console.log(
      `The MACOSX_DEPLOYMENT_TARGET is set to '${deploymentTarget}'.`
    );
    env["CMAKE_OSX_DEPLOYMENT_TARGET"] = deploymentTarget;
  } else {
    console.log("The MACOSX_DEPLOYMENT_TARGET is not set and will be ignored.");
  }
}

if (process.platform === "win32") {
  // The `rc` package conflicts with the rc command (resource compiler) on
  // Windows. This causes the build to fail. This is a workaround which removes
  // all the environment variables added by npm.
  const pathEnv = process.env["Path"];
  const pathSplit = pathEnv.split(";").filter((path) => {
    const pathLower = path.toLowerCase();
    return !pathLower.includes("node_modules");
  });
  env["Path"] = pathSplit.join(";");
  console.log(
    "The PATH environment variable has been modified to remove any 'node_modules' directories."
  );

  for (let key in env) {
    const lowerKey = key.toLowerCase();
    if (
      (lowerKey.includes("node") || lowerKey.includes("npm")) &&
      lowerKey !== "riag_nodejs_precompiled_lib_path"
    ) {
      delete env[key];
    }
  }
  console.log(
    "Any environment variables containing 'node' or 'npm' have been removed."
  );
}

if (externalPrecompiledLibPath) {
  env.RIAG_NODEJS_PRECOMPILED_LIB_PATH = externalPrecompiledLibPath;
  env.EXTRA_CMAKE_FLAGS = [
    env.EXTRA_CMAKE_FLAGS,
    env.RIAG_SOURCE_DIR ? `-DRIAG_SOURCE_DIR=${env.RIAG_SOURCE_DIR}` : null,
    env.RIAG_BUILD_DIR ? `-DRIAG_BUILD_DIR=${env.RIAG_BUILD_DIR}` : null,
    "-DBUILD_RIAG=FALSE",
    "-DBUILD_SHELL=FALSE",
    "-DRIAG_NODEJS_USE_PRECOMPILED_LIB=TRUE",
    `-DRIAG_NODEJS_PRECOMPILED_LIB_PATH=${externalPrecompiledLibPath}`,
  ].filter(Boolean).join(" ");
  console.log(
    `Using precompiled libriag from '${externalPrecompiledLibPath}'.`
  );
}

childProcess.execSync("make nodejs NUM_THREADS=" + THREADS, {
  env,
  cwd: path.join(__dirname, "riag-source"),
  stdio: "inherit",
});

// Copy the built files to the package directory
const BUILT_DIR = path.join(
  __dirname,
  "riag-source",
  "tools",
  "nodejs_api",
  "build"
);
// Get all the js and node files
const files = fs.readdirSync(BUILT_DIR).filter((file) => {
  return file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".d.ts") || file.endsWith(".node");
});
console.log("Files to copy: ");
for (const file of files) {
  console.log("  " + file);
}
console.log("Copying built files to package directory...");
for (const file of files) {
  fs.copyFileSync(path.join(BUILT_DIR, file), path.join(__dirname, file));
}

// Clean up
console.log("Cleaning up...");
childProcess.execSync("npm run clean-all", {
  cwd: path.join(__dirname, "riag-source", "tools", "nodejs_api"),
});
childProcess.execSync("make clean", {
  cwd: path.join(__dirname, "riag-source"),
});
console.log("Done!");
