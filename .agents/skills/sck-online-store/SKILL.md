```markdown
# sck-online-store Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches development patterns and conventions used in the `sck-online-store` repository, a Go-based online store backend. It covers file naming, import/export styles, commit message practices, and testing patterns. While no specific framework or automated workflows were detected, this guide documents the project's structure and provides suggested commands for common development tasks.

## Coding Conventions

### File Naming
- **Style:** kebab-case
- **Example:**  
  - `product-handler.go`
  - `order-service.go`

### Import Style
- **Style:** Alias imports are used for clarity or to avoid conflicts.
- **Example:**
  ```go
  import (
      db "github.com/example/database"
      util "github.com/example/utils"
  )
  ```

### Export Style
- **Style:** Mixed (both exported and unexported identifiers)
- **Example:**
  ```go
  // Exported function
  func CreateOrder() {}

  // Unexported helper
  func calculateTotal() {}
  ```

### Commit Message Patterns
- **Type:** Freeform, with optional prefixes `[Added]`, `[Edited]`
- **Average Length:** ~61 characters
- **Examples:**
  - `[Added] Implemented product listing endpoint`
  - `[Edited] Fixed bug in order calculation logic`

## Workflows

_No automated workflows detected in the repository. Below are suggested manual workflows based on common development activities._

### Add a New Feature
**Trigger:** When implementing a new feature or endpoint  
**Command:** `/add-feature`

1. Create a new file using kebab-case (e.g., `cart-handler.go`).
2. Write the feature code, using alias imports as needed.
3. Export functions that need to be accessed by other packages.
4. Write corresponding tests in a `*.test.*` file.
5. Commit with a message prefixed by `[Added]`, e.g., `[Added] Cart management endpoint`.

### Edit Existing Functionality
**Trigger:** When modifying or fixing existing code  
**Command:** `/edit-feature`

1. Locate the relevant file(s).
2. Make the necessary code changes.
3. Update or add tests if applicable.
4. Commit with a message prefixed by `[Edited]`, e.g., `[Edited] Improved product search logic`.

### Run Tests
**Trigger:** Before pushing changes or merging  
**Command:** `/run-tests`

1. Identify all `*.test.*` files.
2. Run tests using Go's testing tools:
   ```sh
   go test ./...
   ```
3. Ensure all tests pass before proceeding.

## Testing Patterns

- **File Pattern:** Tests are placed in files matching `*.test.*`
- **Framework:** Not explicitly detected; likely uses Go's built-in testing.
- **Example:**
  ```go
  // product-handler.test.go
  import "testing"

  func TestCreateProduct(t *testing.T) {
      // test logic here
  }
  ```

## Commands
| Command        | Purpose                                 |
|----------------|-----------------------------------------|
| /add-feature   | Scaffold and commit a new feature       |
| /edit-feature  | Update existing code and commit changes |
| /run-tests     | Run all tests in the codebase           |
```
