# Change Log

All notable changes to the "Pest Tests Runner" extension will be documented in this file.

## [0.5.0] - 2026-10-14

### 🧪 Native VS Code testing

#### Added

- **Test Explorer and gutter icons** via the VS Code Testing API: projects, files, `describe` blocks, tests and dataset cases
- **Diff view** (expected vs actual) for failed comparisons, and failure messages shown inline on the failing line
- **Debug profile** (right-click → Debug Test) and the `Pest Tests Runner: Debug Test at Cursor` command
- **Stop button**: cancelling a run kills Pest and its child processes
- **Parent folders and monorepos**: the project root is detected from each test file; several projects run in parallel
- **Docker / Laravel Sail / WSL** through the new `command` setting (no shell, paths relative to the project root)
- Settings: `projectRoot`, `command`, `additionalArgs`, `env`, `disableXdebug`, `testFileGlob`
- "Pest" output channel logging the command, working directory and timings of each run

#### Fixed

- Runs failed when VS Code was opened on a parent folder of the project, even with `pestBinaryPath` set: Pest now runs from the project root
- Status icons stuck on "Running": top-level `it()` tests, datasets and tests sharing a name in different `describe` blocks never matched their result
- "Run Suite" wrote every result into the active file
- Tests that never report a result (fatal error, missing binary) are now marked as errored with the reason, instead of running forever
- Accents and other non-ASCII characters split across output chunks garbled test names
- `--filter` didn't escape regex characters: names with `(`, `.`, `@`, `#` ran the wrong tests or none
- `showTerminal` ran every test twice; debug mode passed quoted test names that matched nothing
- `"C:\\new"` in a test name was decoded as a newline; `||n` in Teamcity output was decoded as a newline
- Tests after a nested `describe` were left out when running the outer group

#### Performance

- One coalesced UI refresh per 100 ms instead of several per test event
- Test files are re-parsed 400 ms after typing stops, instead of on every keystroke
- PHP is started directly instead of through `cmd.exe` / `pest.bat` / bash
- `XDEBUG_MODE=off` for normal runs
- Several files run in a single Pest process

#### Removed

- `pestBinaryPath`: use `command` (e.g. `php vendor/bin/pest` or `C:\php\php.exe vendor/bin/pest`)
- `showTerminal`: output is in the Test Results panel
- `debugMode`: use the Debug profile
- `focusOutputOnRun`: the "Pest" output channel only holds diagnostics, open it when needed

## [0.2.0] - 2025-01-XX

### 🚀 Major Architecture Upgrade - Real-Time Streaming

#### Breaking Changes

- **Removed `fast-xml-parser` dependency** - no longer using JUnit XML format
- Requires Pest with `--teamcity` flag support (Pest 2.x+)

#### Added

- ✨ **Real-time streaming** with Teamcity format - see test results as they execute
  - Instant feedback during test runs (no waiting for XML generation)
  - Progress tracking - watch tests transition from Running → Passed/Failed
  - Live updates to CodeLens status and inline decorations
- 🎯 **AST parsing** with `php-parser` for reliable test detection
  - Handles complex test names (apostrophes, quotes, emojis, special characters)
  - Detects deeply nested describe blocks (3+ levels)
  - Supports string concatenation in test names (`test('prefix ' . 'suffix')`)
  - More robust than regex-based parsing
- 📊 **Detailed error messages** for failed tests
  - Full stack traces displayed in Output Channel
  - Formatted error details (escape sequences properly handled)
  - File and line number highlighting
- 🟡 **Skip reasons** displayed for skipped tests
  - Shows why a test was skipped
  - Clear visual indication with yellow circle emoji

#### Changed

- **Test execution** now uses `spawn` with stdout streaming instead of `exec` with XML batch processing
- **Command args** changed from `--log-junit` to `--teamcity`
- **Test detection** migrated from regex to AST parsing in `pestCodeLensProvider.ts`
- **Helper functions** `extractTestNamesFromFile()` and `extractTestNamesFromDescribe()` refactored to use AST

#### Performance

- ⚡ **Instant feedback** - results appear as tests run (vs waiting for completion)
- 🚀 **No XML overhead** - eliminates XML file generation and parsing delay
- 📈 **Better UX** - progressive disclosure of test results

#### Technical Details

- Added `src/teamcityParser.ts` (~130 lines) for parsing Teamcity format
- Added `src/phpAstParser.ts` (~160 lines) for AST-based test detection
- Refactored `executeTestCommand()` in `extension.ts` to use streaming
- Implemented `handleTeamcityEvent()` for real-time event processing
- Uses `Map<flowId, TeamcityResult>` cache for correlating events
- Removed all JUnit XML parsing code (~300+ lines)

## [0.1.6] - 2025-10-27

### 🎨 Visual Improvements & Rebranding

#### Changed

- **Rebranded** to "Pest Tests Runner" for better discoverability
- **New icon** with Pest official colors (#A4F287 lime green on #0E0E0E dark)
- **Enhanced description** with better readability and feature highlights
- **Updated README** with comprehensive documentation and visual examples
- **Minimum VS Code version** reduced to 1.59.0 (was 1.105.0) for broader compatibility

#### Added

- 🟡 **Better skipped indicator**: Yellow circle instead of small ⊘ symbol
- 📦 **Build improvements**: VSIX files now output to `/build` directory
- 📚 **Comprehensive keywords**: Better marketplace search (pest, php, testing, laravel, tdd, codelens)

## [0.1.5] - 2025-10-26

### ✨ Inline Results & Performance

#### Added

- **Colored inline results** at end of test lines with theme-aware colors
- **File-level status**: Run File CodeLens shows aggregated status
- **Auto-save before run**: Configurable option to save files before test execution
- **High-precision durations**: Shows 0.0023s instead of 0.00s for fast tests
- **Loading indicators**: All tests show spinning icon when running groups/files

#### Fixed

- **Test names with apostrophes**: Full support for quotes, backslashes, special characters
- **Skipped test detection**: Enhanced to check multiple XML formats
- **Windows compatibility**: Automatic shell detection (bash/cmd/PowerShell)

#### Improved

- **XML parsing**: Correct handling of Pest's "`Group` → `SubGroup` → it description" format
- **Debug mode**: Configurable verbose logging without cluttering output
- **Status synchronization**: Individual tests update when running groups

## [0.1.0] - 2025-10-26

### 🚀 Major Refactor - Standalone Edition

#### Added

- ✅ **Visual status indicators** for all tests:
  - ✓ Green check mark when test passes
  - ✗ Red X when test fails  
  - ⟳ Spinning icon while test is running
  - Status tracked for both individual tests and describe groups
- 🎯 **Real-time test result tracking**: Results persist and update CodeLens icons automatically
- 🔧 **Test Results Manager**: New centralized system for tracking test execution status
- 📊 **Better output parsing**: Captures Pest test results to determine pass/fail status

#### Changed

- 🔥 **BREAKING**: Removed all Better Pest integration - extension is now fully standalone
- 🎨 Updated CodeLens titles to show test status (e.g., "Passed", "Failed", "Running...")
- ⚡ Improved test execution with async/await pattern and output capture
- 🔧 Simplified configuration: Removed `useBetterPest` setting

#### Removed

- ❌ Better Pest extension dependency and integration
- ❌ Configuration option `pest-runner-icons.useBetterPest`

#### Technical Details

- Added `testResultsManager.ts` for centralized state management
- Modified `pestCodeLensProvider.ts` to display dynamic status icons
- Refactored `extension.ts` to use `exec` for capturing test output
- Added `--colors=never` flag to Pest commands for cleaner parsing

---

## [0.0.2] - 2025-10-26

### Fixed

- 🐛 Fixed describe "Run Group" executing wrong test
- 🐛 Fixed single test filter with incorrect `/` delimiters

---

## [0.0.1] - 2025-10-26

### Added

- Initial release
- CodeLens provider for Pest test files
- Visual run buttons for `test()`, `it()`, and `describe()` blocks
- "Run File" button at the top of test files
- Better Pest integration - automatically uses Better Pest extension when installed
- Configuration option to enable/disable CodeLens
- Configuration option to toggle Better Pest integration
- Fallback built-in test runner when Better Pest is not available
- Support for running individual tests, test groups, files, and full suite
- Example test files in the `examples/` directory

### Features

- Seamless integration with Better Pest's advanced features (SSH, Docker, etc.)
- Detects Pest test files automatically
- Works with Laravel Pest projects
- Clean, minimal UI with intuitive icons

### Technical

- Written in TypeScript
- Uses VS Code CodeLens API
- Compatible with Better Pest extension commands
- Activates only for PHP files in test directories
