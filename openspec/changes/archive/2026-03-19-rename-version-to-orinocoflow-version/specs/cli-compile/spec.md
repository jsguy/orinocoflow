## MODIFIED Requirements

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
