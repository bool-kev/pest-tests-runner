# Pest Runner Icons

Add convenient CodeLens icons to run Pest tests directly from your PHP test files in VS Code.

## Features

- **CodeLens Icons**: Visual run buttons appear above each test, describe block, and at the file level
- **Better Pest Integration**: Automatically uses [Better Pest](https://marketplace.visualstudio.com/items?itemName=m1guelpf.better-pest) extension if installed
- **Flexible Execution**: Run individual tests, test groups, entire files, or the full test suite
- **Keyboard Shortcuts**: Compatible with Better Pest keyboard shortcuts when using integration mode

## Usage

### CodeLens Icons

When you open a Pest test file, you'll see clickable icons:

- **$(run-all) Run File** - At the top of the file to run all tests in the file
- **$(play) Run** - Next to each `test()` or `it()` call to run that specific test
- **$(run-all) Run Group** - Next to each `describe()` block to run all tests in that group

### Example

```php
<?php

// $(run-all) Run File appears here

describe('User authentication', function () { // $(run-all) Run Group
    test('user can login', function () { // $(play) Run
        // Test code...
    });
    
    it('requires valid credentials', function () { // $(play) Run
        // Test code...
    });
});

test('database connection works', function () { // $(play) Run
    // Test code...
});
```

## Configuration

Access settings via `File > Preferences > Settings` and search for "Pest Runner Icons":

- **`pest-runner-icons.enableCodeLens`** (default: `true`)  
  Enable or disable CodeLens icons

- **`pest-runner-icons.useBetterPest`** (default: `true`)  
  Use Better Pest extension commands when available. Falls back to built-in execution if Better Pest is not installed.

## Requirements

- PHP test files using [Pest](https://pestphp.com/)
- (Optional) [Better Pest](https://marketplace.visualstudio.com/items?itemName=m1guelpf.better-pest) extension for enhanced test running features

## Better Pest Integration

When Better Pest is installed and `useBetterPest` is enabled, this extension:

1. Leverages Better Pest's advanced features (SSH, Docker, custom configurations)
2. Uses Better Pest's task runner for better output formatting
3. Respects all Better Pest configuration settings
4. Provides visual CodeLens icons for Better Pest's keyboard shortcuts

If Better Pest is not installed, the extension falls back to a simple built-in test runner.

## Commands

The following commands are available in the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- **Pest Runner Icons: Run Test** - Run a specific test
- **Pest Runner Icons: Run Test File** - Run all tests in the current file
- **Pest Runner Icons: Run Test Suite** - Run the entire test suite

## Installation

1. Install from VS Code Marketplace (search for "Pest Runner Icons")
2. Or install manually:
   - Download the `.vsix` file
   - Run `code --install-extension pest-runner-icons-0.0.1.vsix`

## Known Issues

- CodeLens may not appear for tests with complex multiline declarations
- Only detects `test()`, `it()`, and `describe()` at the start of lines

## Contributing

Found a bug or have a feature request? Please open an issue on [GitHub](https://github.com/yourusername/pest-runner-icons).

## Release Notes

### 0.0.1

Initial release:

- CodeLens icons for Pest tests
- Better Pest integration
- Fallback built-in test runner
- Configuration options

## License

MIT
