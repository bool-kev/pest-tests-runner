# Change Log

All notable changes to the "pest-runner-icons" extension will be documented in this file.

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
