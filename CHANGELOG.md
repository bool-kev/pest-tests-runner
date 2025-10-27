# Change Log

All notable changes to the "Pest Tests Runner" extension will be documented in this file.

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
