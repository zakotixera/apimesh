import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { AnySchema, ErrorObject } from 'ajv';
import { readJson } from './fsx';
import type { ProjectPaths } from './paths';

export interface SchemaValidators {
  definition(value: unknown): string[];
  example(value: unknown): string[];
  glossary(value: unknown): string[];
  collection(value: unknown): string[];
}

/** Format an AJV instance path and validation message. */
function errorText(err: ErrorObject): string {
  const where = err.instancePath || '/';
  return `${where}: ${err.message ?? 'validation failed'}`;
}

function compile(schema: unknown): (value: unknown) => string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema as AnySchema);
  return (value: unknown): string[] => {
    if (validate(value)) return [];
    return (validate.errors ?? []).map(errorText);
  };
}

/** Load draft 2020-12 schemas with format validation. */
export function loadSchemas(paths: ProjectPaths): SchemaValidators {
  const definition = compile(readJson(paths.schema + '/definition.schema.json'));
  const example = compile(readJson(paths.schema + '/example.schema.json'));
  const glossary = compile(readJson(paths.schema + '/glossary.schema.json'));
  const collection = compile(readJson(paths.schema + '/collection.schema.json'));
  return { definition, example, glossary, collection };
}
