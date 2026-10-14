# Pest Tests Runner 🐛✨

Run your Pest PHP tests from VS Code's **Test Explorer**, the **gutter** and **CodeLens**, with real-time results, a diff view for failed assertions, and support for monorepos, Docker, Laravel Sail and WSL.

## ✨ Features

### 🧪 Native VS Code testing

- **Test Explorer** with every project, file, `describe` block, test and dataset case
- **Gutter icons** to run or debug a test, and see its status
- **Failure messages inline** on the failing line, with a **diff view** (expected vs actual) for `toBe` / `toEqual` assertions
- **Stop** button, run history, "re-run failed tests", and Pest output in the **Test Results** panel
- **Debug profile**: right-click a test → *Debug Test* (Xdebug + PHP Debug extension)

### 🚀 Real-time and fast

- Results stream in while Pest runs (Teamcity format)
- PHP is started directly, without `cmd.exe` / `pest.bat` / bash wrappers
- Xdebug is turned off for normal runs (`XDEBUG_MODE=off`): it slows every test down
- Running several files starts PHP (and Laravel) only once
- Starting a new run on a project cancels the one in progress

### 🎯 Reliable test detection

- AST parsing with `php-parser`: nested `describe` blocks, `it()` / `test()`, datasets, `->todo()`, string concatenation, apostrophes, accents and emojis
- Each test is identified by its full Pest description (`` `Users` → it can register ``), so two tests with the same name in different `describe` blocks never mix up their status
- Precise `--filter`: names with `(`, `.`, `@`, `#`, `::` or `/` run exactly the test you clicked

### 📁 Any project layout

- Open the Laravel project itself, **a parent folder**, or a **monorepo**: the project root (where `vendor/` lives) is found from each test file, and Pest runs from there
- Several projects in one window get one Test Explorer node each, and run in parallel

### 👀 CodeLens (optional)

`▶ Run` / `✅ Passed (0.012s)` / `❌ Failed` / `⏳ Running` above each test, `describe` block and file.

## Quick start

1. Open a folder containing a Pest project (Pest 2, 3 or 4).
2. Open the **Testing** view, or a test file: run tests from the gutter, the Test Explorer or the CodeLens.
3. Failed assertions show up inline; click the message to open the diff.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `pest-tests-runner.projectRoot` | `""` | Pest project folder. Empty = detected from each test file. Supports `${workspaceFolder}` and relative paths |
| `pest-tests-runner.command` | `""` | Full command to start Pest (see below). Empty = `php vendor/pestphp/pest/bin/pest` |
| `pest-tests-runner.additionalArgs` | `[]` | Extra Pest arguments, e.g. `["--parallel"]` |
| `pest-tests-runner.env` | `{}` | Extra environment variables for Pest |
| `pest-tests-runner.disableXdebug` | `true` | Set `XDEBUG_MODE=off` for normal runs (local PHP only) |
| `pest-tests-runner.testFileGlob` | `{**/tests/**/*.php,**/Tests/**/*.php,**/*Test.php}` | Files scanned for tests (`vendor` and `node_modules` are ignored) |
| `pest-tests-runner.enableCodeLens` | `true` | Show the CodeLens |
| `pest-tests-runner.autoSaveBeforeRun` | `true` | Save the test files before running them |

Removed in 0.5.0: `pestBinaryPath` and `phpBinary` (use `command`), `showTerminal` (output is in Test Results), `debugMode` (use the Debug profile), `focusOutputOnRun` (open Output → Pest when needed).

### Docker, Laravel Sail and WSL

The command runs **from the project root, without a shell**, and test files are passed **relative to the project root**, so no path mapping is needed as long as the container's working directory is the project root.

```jsonc
// Laravel Sail / Docker Compose
"pest-tests-runner.command": "docker compose exec -T laravel.test php vendor/bin/pest"

// Sail script (Linux / macOS)
"pest-tests-runner.command": "./vendor/bin/sail pest"

// PHP installed in WSL, project on Windows
"pest-tests-runner.command": "wsl php vendor/bin/pest"

// A specific PHP on Windows (Laragon, Herd...): the project's Pest script is added automatically
"pest-tests-runner.command": "C:\\laragon\\bin\\php\\php-8.3.16-Win32-vs16-x64\\php.exe"
```

For Docker, WSL and Sail, give the full command including the Pest script: the extension only adds it when the command starts with PHP itself.

When VS Code itself runs inside WSL or a Dev Container (Remote extensions), no configuration is needed.

## Troubleshooting

Open **Output → Pest**: each run logs the exact command, its working directory and its timings.

- **"Pest was not found"**: run `composer install`, or set `pest-tests-runner.projectRoot` when the project can't be detected.
- **A test shows an error "Pest did not report a result"**: its name is built at runtime (variables, interpolation), so it can only run as part of its file.
- **Windows, `php` is a `.bat` shim (Herd, Scoop)**: it works through a shell fallback, but putting the full path of the real `php.exe` in `command` is faster and safer.
- **Debugging**: install the *PHP Debug* extension and Xdebug. Debugging through Docker/WSL needs your own launch configuration with path mappings.

## Development

```bash
npm install
npm test                 # unit + integration tests in a VS Code instance
```

End-to-end tests run the real controller against real Pest projects. They are skipped unless `PEST_E2E_PROJECTS` lists project roots (separated by `;`), each with a copy of `src/test/fixtures/FormatTest.php` in `tests/Unit/`.

## License

MIT © [dark SHADOW](https://github.com/bool-kev)
