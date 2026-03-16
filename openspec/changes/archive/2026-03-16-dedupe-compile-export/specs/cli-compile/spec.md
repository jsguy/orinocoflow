## MODIFIED Requirements

### Requirement: Programmatic transformation function
The system SHALL export `compileFile` and `transformYamlToWorkflow` exclusively from the `"orinocoflow/compile"` sub-path. These functions SHALL NOT be re-exported from the main `"orinocoflow"` entry point.

#### Scenario: Import from sub-path succeeds
- **WHEN** a consumer runs `import { compileFile } from "orinocoflow/compile"`
- **THEN** `compileFile` is a callable function

#### Scenario: Import from main entry is undefined
- **WHEN** a consumer runs `import { compileFile } from "orinocoflow"`
- **THEN** `compileFile` is not present in the module exports
