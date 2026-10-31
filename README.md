
# RiaGraph Node.js API

A high-performance graph database for knowledge-intensive applications. This Node.js wrapper enables interaction with the RiaGraph database via JavaScript or TypeScript using either **CommonJS** or **ES Modules**.

---

## 📦 Installation

```bash
npm install riag
```

---

## 🚀 Quick Start

### Example (ES Modules)

```js
// Import the RiaGraph module (ESM)
import { Database, Connection } from "riag";

const main = async () => {
  // Initialize database and connection
  const db = new Database("./test");
  const conn = new Connection(db);

  // Define schema
  await conn.query(`
    CREATE NODE TABLE User(name STRING, age INT64, PRIMARY KEY (name));
  `);
  await conn.query(`
    CREATE NODE TABLE City(name STRING, population INT64, PRIMARY KEY (name));
  `);
  await conn.query(`
    CREATE REL TABLE Follows(FROM User TO User, since INT64);
  `);
  await conn.query(`
    CREATE REL TABLE LivesIn(FROM User TO City);
  `);

  // Load data from CSV files
  await conn.query(`COPY User FROM "user.csv"`);
  await conn.query(`COPY City FROM "city.csv"`);
  await conn.query(`COPY Follows FROM "follows.csv"`);
  await conn.query(`COPY LivesIn FROM "lives-in.csv"`);

  // Run a query
  const result = await conn.query("MATCH (u:User) RETURN u.name, u.age;");

  // Fetch all results
  const rows = await result.getAll();

  // Output results
  for (const row of rows) {
    console.log(row);
  }
};

main().catch(console.error);
```
 ✅ The dataset used in this example can be found in the [official RiaGraph repository](https://github.com/cntSafety/RiaGraph/tree/master/dataset/demo-db/csv).

---

## 📚 API Overview

The `riag` package exposes the following primary classes:

* `Database` – Initializes a database from a file path.
* `Connection` – Executes queries on a connected database.
* `QueryResult` – Provides methods like `getAll()` to retrieve results.

Both CommonJS (`require`) and ES Modules (`import`) are fully supported.

---

## 🛠️ Local Development (for Contributors)

### Install Dev Dependencies

```bash
git submodule update --init --recursive
npm install --include=dev
```

### Build Project

```bash
npm run build
```

By default, the standalone build looks for a sibling RiaGraph checkout at
`../riagraph` via `RIAG_SOURCE_DIR`, and reuses the prebuilt static library from
`../riagraph/build/release`. Override that location like this:

```bash
RIAG_SOURCE_DIR=/path/to/riagraph npm run build
```

### Run Tests

```bash
npm test
```

---

## 📦 Packaging and Binary Distribution

We bundle all prebuilt binaries directly into the npm package, inspired by the approach used by [prebuildify](https://github.com/prebuild/prebuildify).

>  All prebuilt binaries are shipped inside the package that is published to npm, which means there's no need for a separate download step like you find in [`prebuild`](https://github.com/prebuild/prebuild). The irony of this approach is that it is faster to download all prebuilt binaries for every platform when they are bundled than it is to download a single prebuilt binary as an install script.

### Requirements (for building from source)

If a prebuilt binary is unavailable for your platform, the module will be built from source during installation. Ensure the following tools are installed:

* **CMake** (≥ 3.15)
* **Python 3**
* A **C++20-compatible compiler**

### Packaging Prebuilt Binaries

1. Place your binaries inside the `prebuilt` directory.
2. Name them using the format:

   ```
   riagjs-${platform}-${arch}.node
   ```
3. Run the packaging script:

```bash
node package
```

If no binaries are found, a source-only tarball will be generated.

---

## 🚀 Publishing

To publish the package to npm:

```bash
npm publish
```

Refer to the [npm documentation](https://docs.npmjs.com/cli/v9/commands/npm-publish) for full details on publishing and versioning.

---

## 🔗 Resources

* [RiaGraph GitHub](https://github.com/cntSafety/RiaGraph)
* [Issue Tracker](https://github.com/cntSafety/RiaGraph/issues)
