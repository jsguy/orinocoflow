## ADDED Requirements

### Requirement: NodeSpec schema type
The system SHALL provide a `NodeSpec` type and `NodeSpecSchema` Zod schema that describes the contract for a workflow node type, including its description, config fields, state inputs, and state outputs. All fields except `node_type` SHALL be optional.

#### Scenario: Minimal valid node spec
- **WHEN** a node spec object contains only `node_type`
- **THEN** `parseNodeSpec()` SHALL parse it successfully

#### Scenario: Full node spec with all fields
- **WHEN** a node spec object contains `node_type`, `description`, `config`, `inputs`, and `outputs`
- **THEN** `parseNodeSpec()` SHALL parse it successfully and return a typed `NodeSpec` object

#### Scenario: Invalid node spec missing node_type
- **WHEN** a node spec object is missing `node_type`
- **THEN** `parseNodeSpec()` SHALL throw a Zod validation error

### Requirement: Config field schema
Each entry in `config` SHALL be keyed by field name and MAY include `type` (string), `required` (boolean), and `description` (string).

#### Scenario: Config field with all properties
- **WHEN** a config entry has `type`, `required`, and `description`
- **THEN** `parseNodeSpec()` SHALL accept it and preserve all properties

#### Scenario: Config field with no properties
- **WHEN** a config entry is an empty object `{}`
- **THEN** `parseNodeSpec()` SHALL accept it

### Requirement: Input and output field schema
`inputs` and `outputs` SHALL each be arrays of objects with `name` (required string) and optional `type` (string) and `description` (string).

#### Scenario: Output with name only
- **WHEN** an output entry has only `name`
- **THEN** `parseNodeSpec()` SHALL accept it

#### Scenario: Output with all fields
- **WHEN** an output entry has `name`, `type`, and `description`
- **THEN** `parseNodeSpec()` SHALL accept it and preserve all properties

### Requirement: parseNodeSpec function
The system SHALL export a `parseNodeSpec(raw: unknown): NodeSpec` function that validates and parses an unknown value against `NodeSpecSchema`, parallel to the existing `parse()` function for workflows.

#### Scenario: Valid raw object parses successfully
- **WHEN** `parseNodeSpec()` is called with a valid raw object
- **THEN** it SHALL return a typed `NodeSpec`

#### Scenario: Invalid input throws
- **WHEN** `parseNodeSpec()` is called with an invalid object
- **THEN** it SHALL throw a Zod error describing the validation failure

### Requirement: Public API export
`NodeSpec` and `parseNodeSpec` SHALL be exported from the package's public entry point so consumers can use them without importing from internal paths.

#### Scenario: Import from package root
- **WHEN** a consumer imports `{ NodeSpec, parseNodeSpec }` from `orinocoflow`
- **THEN** both SHALL be available and correctly typed

### Requirement: Example node-spec files
The repository SHALL include example node-spec YAML files in `examples/node-specs/` covering node types used in the existing example workflows, demonstrating the format for users and LLM agents.

#### Scenario: Example files are valid
- **WHEN** each example YAML file in `examples/node-specs/` is passed to `parseNodeSpec()`
- **THEN** it SHALL parse without error
