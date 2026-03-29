## ADDED Requirements

### Requirement: Parse and validate a YAML workflow file
The system SHALL parse a `.yaml` or `.yml` file using `yaml.parse()` and validate the result against the `WorkflowSchema` Zod validator, returning a typed `Workflow` object.

#### Scenario: Valid YAML file
- **WHEN** `compileFile("examples/odt-pipeline.yaml")` is called
- **THEN** it returns a `Workflow` object matching the JSON equivalent

#### Scenario: YAML with invalid schema
- **WHEN** the YAML is syntactically valid but missing required fields (e.g. no `graph_id`)
- **THEN** it throws a Zod `ZodError`

#### Scenario: YAML without orinocoflow_version field
- **WHEN** the YAML is syntactically valid and `orinocoflow_version` is absent
- **THEN** it returns a valid `Workflow` object (the field is optional)

#### Scenario: Malformed YAML syntax
- **WHEN** the file contains invalid YAML (e.g. bad indentation, unclosed string)
- **THEN** it throws a YAML parse error before Zod validation

### Requirement: Parse and validate a JSON workflow file
The system SHALL parse a `.json` file using `JSON.parse()` and validate the result against the `WorkflowSchema` Zod validator.

#### Scenario: Valid JSON file
- **WHEN** `compileFile("examples/odt-pipeline.json")` is called
- **THEN** it returns an identical `Workflow` to the YAML equivalent

#### Scenario: JSON with invalid schema
- **WHEN** the JSON is syntactically valid but fails Zod validation
- **THEN** it throws a Zod `ZodError`

### Requirement: Programmatic transformation function
The system SHALL export `compileFile` and `transformYamlToWorkflow` exclusively from the `"orinocoflow/compile"` sub-path. These functions SHALL NOT be re-exported from the main `"orinocoflow"` entry point.

#### Scenario: Import from sub-path succeeds
- **WHEN** a consumer runs `import { compileFile } from "orinocoflow/compile"`
- **THEN** `compileFile` is a callable function

#### Scenario: Import from main entry is undefined
- **WHEN** a consumer runs `import { compileFile } from "orinocoflow"`
- **THEN** `compileFile` is not present in the module exports

### Requirement: Unsupported file extension error
The system SHALL throw a descriptive error when given a file path with an extension other than `.yaml`, `.yml`, or `.json`.

#### Scenario: Unknown extension
- **WHEN** `compileFile("workflow.toml")` is called
- **THEN** it throws an error indicating the extension is unsupported

### Requirement: CLI compile command writes validated JSON
The `oflow compile <file>` command SHALL print validated workflow JSON to stdout. With `--output <file>`, it SHALL write to the specified file instead.

#### Scenario: Compile to stdout
- **WHEN** `oflow compile examples/odt-pipeline.yaml` is run
- **THEN** stdout contains valid JSON parseable as a `Workflow`

#### Scenario: Compile to file
- **WHEN** `oflow compile examples/odt-pipeline.yaml --output out.json` is run
- **THEN** `out.json` is written with the validated JSON

#### Scenario: Compile failure
- **WHEN** the input file has a schema error
- **THEN** the error is printed to stderr and the process exits with code 1
