const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const THREADS = os.cpus().length;
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
  const candidates = process.platform === "win32"
    ? [
        path.join(riagBuildDir, "src", "Release", "riag.lib"),
        path.join(riagBuildDir, "src", "riag.lib"),
        path.join(riagBuildDir, "src", "Release", "libriag.lib"),
        path.join(riagBuildDir, "src", "libriag.lib"),
      ]
    : [path.join(riagBuildDir, "src", "libriag.a")];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function getDefaultExtraLinkLibs(riagBuildDir, precompiledLibPath) {
  if (!riagBuildDir || !precompiledLibPath) {
    return [];
  }

  const linkTxtCandidates = [
    path.join(riagBuildDir, "tools", "python_api", "CMakeFiles", "_riag.dir", "link.txt"),
    path.join(riagBuildDir, "src", "CMakeFiles", "riag_shared.dir", "link.txt"),
  ];
  const tokenPattern = /"[^"]+"|\S+/g;

  for (const linkTxtPath of linkTxtCandidates) {
    if (!fs.existsSync(linkTxtPath)) {
      continue;
    }
    const linkTxtDir = path.dirname(linkTxtPath);
    const linkBaseDir = linkTxtPath.includes(`${path.sep}tools${path.sep}python_api${path.sep}`)
      ? path.join(riagBuildDir, "tools", "python_api")
      : linkTxtPath.includes(`${path.sep}src${path.sep}CMakeFiles${path.sep}`)
        ? path.join(riagBuildDir, "src")
        : linkTxtDir;
    const tokens = fs.readFileSync(linkTxtPath, "utf8").match(tokenPattern) || [];
    const libs = [];
    let sawPrecompiledLib = false;
    const linkLineHasPrecompiledLib = tokens.some((rawToken) => {
      const token = rawToken.replace(/^"(.*)"$/, "$1");
      if (token.startsWith("-")) {
        return false;
      }
      const resolvedToken = fs.existsSync(path.resolve(linkBaseDir, token))
        ? path.resolve(linkBaseDir, token)
        : path.resolve(linkTxtDir, token);
      return resolvedToken === precompiledLibPath;
    });
    let outputPath = null;

    for (let i = 0; i < tokens.length; i++) {
      const rawToken = tokens[i];
      const token = rawToken.replace(/^"(.*)"$/, "$1");
      if (token === "-o") {
        const outputToken = tokens[++i]?.replace(/^"(.*)"$/, "$1");
        outputPath = outputToken ? path.resolve(linkBaseDir, outputToken) : null;
        continue;
      }
      if (token === "-install_name" || token === "-current_version" || token === "-compatibility_version") {
        i++;
        continue;
      }
      if (token.startsWith("@")) {
        continue;
      }

      const resolvedToken = token.startsWith("-")
        ? token
        : fs.existsSync(path.resolve(linkBaseDir, token))
          ? path.resolve(linkBaseDir, token)
          : path.resolve(linkTxtDir, token);

      if (!sawPrecompiledLib && linkLineHasPrecompiledLib) {
        if (resolvedToken === precompiledLibPath) {
          sawPrecompiledLib = true;
        }
        continue;
      }

      if (token.startsWith("-l")) {
        libs.push(token);
        continue;
      }
      if (!/\.(a|lib|dylib|so|tbd)$/.test(token)) {
        continue;
      }
      if (resolvedToken === precompiledLibPath || resolvedToken === outputPath) {
        continue;
      }
      libs.push(resolvedToken);
    }

    if (libs.length > 0) {
      return [...new Set(libs)];
    }
  }

  return [];
}

console.log(`Using ${THREADS} threads to build RiaG.`);

const env = { ...process.env };
const riagSourceDir = resolveExistingPath(env.RIAG_SOURCE_DIR || DEFAULT_RIAG_SOURCE_DIR);
const riagBuildDir = resolveExistingPath(env.RIAG_BUILD_DIR || getDefaultBuildDir(riagSourceDir));
const precompiledLibPath = resolveExistingPath(
  env.RIAG_NODEJS_PRECOMPILED_LIB_PATH || getDefaultPrecompiledLibPath(riagBuildDir)
);
const extraLinkLibs = getDefaultExtraLinkLibs(riagBuildDir, precompiledLibPath);

if (riagSourceDir) {
  env.RIAG_SOURCE_DIR = riagSourceDir;
}
if (riagBuildDir) {
  env.RIAG_BUILD_DIR = riagBuildDir;
}

const cmakeArgs = env.EXTRA_CMAKE_FLAGS
  ? env.EXTRA_CMAKE_FLAGS.trim().split(/\s+/).filter(Boolean)
  : [];
if (riagSourceDir) {
  cmakeArgs.push(`-DRIAG_SOURCE_DIR=${riagSourceDir}`);
}
if (riagBuildDir) {
  cmakeArgs.push(`-DRIAG_BUILD_DIR=${riagBuildDir}`);
}
if (precompiledLibPath) {
  cmakeArgs.push(
    "-DBUILD_RIAG=FALSE",
    "-DBUILD_SHELL=FALSE",
    "-DRIAG_NODEJS_USE_PRECOMPILED_LIB=TRUE",
    `-DRIAG_NODEJS_PRECOMPILED_LIB_PATH=${precompiledLibPath}`
  );
  console.log(`Using precompiled libriag from ${precompiledLibPath}.`);
}
if (extraLinkLibs.length > 0) {
  cmakeArgs.push(`-DRIAG_NODEJS_EXTRA_LINK_LIBS=${extraLinkLibs.join(";")}`);
}

execSync("npm run clean", { stdio: "inherit" });
execFileSync("cmake", ["-S", ".", "-B", "build", ...cmakeArgs], {
  cwd: __dirname,
  env,
  stdio: "inherit",
});
execFileSync("cmake", ["--build", "build", "-j", `${THREADS}`], {
  cwd: __dirname,
  env,
  stdio: "inherit",
});
