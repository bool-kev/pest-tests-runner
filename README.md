# Pest Tests Runner 🐛✨

Run your Pest PHP tests directly from VS Code with inline status indicators and instant visual feedback.

## Features

- **Click-to-run CodeLens** on every test, describe group, and file
- **Colored status indicators**: ✅ Pass (green) | ❌ Fail (red) | 🟡 Skip (yellow) | ⏳ Running (blue)
- **Inline results** displayed at end of test lines
- **Smart tracking** - results persist across sessions
- **Auto-save** before test execution
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

### 0.1.6

- Rebranded to "Pest Tests Runner"
- Inline colored results with theme colors
- Better skipped indicator (🟡)
- File-level status tracking
- High-precision duration display
- Fixed test names with apostrophes/backslashes

## License

MIT © [dark SHADOW](https://github.com/bool-kev)
