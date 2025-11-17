# Pest Tests Runner 🐛✨

Run your Pest PHP tests directly from VS Code with **real-time streaming**, inline status indicators, and instant visual feedback.

## ✨ Features

### 🚀 Real-Time Test Execution (NEW)

- **Streaming results** - see tests pass/fail as they run (no waiting!)
- **Instant feedback** with Teamcity format streaming
- **Progress tracking** - watch your test suite execute in real-time

### 🎯 Smart Test Detection

- **AST parsing** with php-parser for reliable test detection
- Handles complex test names with apostrophes, quotes, emojis, special characters
- Detects deeply nested describe blocks (3+ levels)
- Supports string concatenation in test names

### 📊 Rich Test Results

- **Click-to-run CodeLens** on every test, describe group, and file
- **Colored status indicators**: ✅ Pass (green) | ❌ Fail (red) | 🟡 Skip (yellow) | ⏳ Running (blue)
- **Detailed error messages** with stack traces for failed tests
- **Skip reasons** displayed for skipped tests
- **Inline results** with precise execution time (0.0023s)

### 💪 Developer Experience

- **Auto-save** before test execution
- **Smart tracking** - results persist across sessions
- **Cross-platform** - Windows/Linux/Mac compatible

## Quick Start

1. Open a Pest test file in `tests/` directory
2. CodeLens buttons appear above tests: `▶ Run` / `✅ Passed` / `❌ Failed`
3. Click to run - results show instantly with execution time

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `pest-tests-runner.enableCodeLens` | `true` | Show CodeLens run buttons |
| `pest-tests-runner.showInlineResults` | `true` | Display colored status inline |
| `pest-tests-runner.autoSaveBeforeRun` | `true` | Auto-save before running |
| `pest-tests-runner.showTerminal` | `false` | Show terminal output |
| `pest-tests-runner.debugMode` | `false` | Enable debug logging |

## Requirements

- VS Code 1.59.0+
- PHP with Pest testing framework
- Test files in `tests/` directory

## Troubleshooting

**Tests not showing results?**

- Enable `pest-tests-runner.debugMode` and check Output panel
- Verify: `./vendor/bin/pest --version`

**CodeLens not appearing?**

- Ensure file is in `tests/` folder
- Check `pest-tests-runner.enableCodeLens` is enabled

**Windows issues?**
Set custom path: `"pest-tests-runner.pestBinaryPath": "php vendor/pestphp/pest/bin/pest"`

## Release Notes

### 0.2.0 (Latest) - Major Architecture Upgrade 🚀

**Breaking Changes:**

- Removed `fast-xml-parser` dependency
- Requires Pest with `--teamcity` flag support

**New Features:**

- ✨ **Real-time streaming** with Teamcity format - see results as tests run
- 🎯 **AST parsing** with php-parser for reliable test detection
- 📊 **Detailed error messages** with formatted stack traces
- 🟡 **Skip reasons** displayed for skipped tests
- ⚡ **Performance improvement** - instant feedback instead of waiting for XML

**Improvements:**

- Handles complex test names (apostrophes, quotes, emojis, special chars)
- Detects deeply nested describe blocks (3+ levels)
- Supports string concatenation in test names
- Better error handling and logging

### 0.1.6

- Rebranded to "Pest Tests Runner"
- Inline colored results with theme colors
- Better skipped indicator (🟡)
- File-level status tracking
- High-precision duration display
- Fixed test names with apostrophes/backslashes

## License

MIT © [dark SHADOW](https://github.com/bool-kev)
