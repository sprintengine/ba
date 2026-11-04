/**
 * The contract test's view of `backend/openapi.yaml`: its component schemas compiled with Ajv (JSON Schema 2020-12, as
 * OpenAPI 3.1 uses), made strict so that a property the spec does not declare fails, plus walkers that compare a
 * fixture with a schema property by property.
 *
 * Strictness: every object schema without its own `additionalProperties` gets `unevaluatedProperties: false`. A schema
 * that composes others (`allOf: [{ $ref: PublicBusiness }, { …more properties }]`) gets it once, at the composing level,
 * and its parts are left open; `unevaluatedProperties` sees the properties every part declares.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020";
import { parse } from "yaml";

type Schema = { [key: string]: unknown };

// Vitest runs from frontend/ (jsdom gives modules an http import.meta.url, so resolve from the working directory).
const SPEC_PATH = resolvePath(process.cwd(), "../backend/openapi.yaml");
const REF_PREFIX = "#/components/schemas/";
const SPEC_ID = "https://bookanything.test/openapi.json";

function loadSchemas(): Record<string, Schema> {
  const spec = parse(readFileSync(SPEC_PATH, "utf8")) as {
    components?: { schemas?: Record<string, Schema> };
  };
  const schemas = spec.components?.schemas;
  if (!schemas) throw new Error(`No components.schemas in ${SPEC_PATH}`);
  return schemas;
}

const isObject = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const openName = (name: string) => `${name}__open`;

function isObjectSchema(schema: Schema): boolean {
  const type = schema.type;
  return (
    type === "object" ||
    (Array.isArray(type) && type.includes("object")) ||
    isObject(schema.properties) ||
    Array.isArray(schema.allOf)
  );
}

const ANNOTATIONS = new Set(["example", "examples", "description"]);
const SCHEMA_MAPS = new Set(["properties", "patternProperties", "$defs"]);

/** One keyword of a schema, strictified. [closesHere]: the schema closes the whole, so its composed parts stay open. */
function strictifyKeyword(key: string, value: unknown, open: boolean, closesHere: boolean): unknown {
  if (key === "$ref" && typeof value === "string" && value.startsWith(REF_PREFIX)) {
    const name = value.slice(REF_PREFIX.length);
    return `${SPEC_ID}#/$defs/${open ? openName(name) : name}`;
  }
  if (key === "allOf" || ((key === "oneOf" || key === "anyOf") && closesHere)) {
    return (value as unknown[]).map((part) => strictify(part, true));
  }
  if (SCHEMA_MAPS.has(key)) {
    return Object.fromEntries(Object.entries(value as Schema).map(([k, v]) => [k, strictify(v)]));
  }
  return ANNOTATIONS.has(key) ? value : strictify(value);
}

/** A copy of [schema] with refs pointing into our `$defs`, strict unless [open] (a part of a composition). */
function strictify(schema: unknown, open = false): unknown {
  if (Array.isArray(schema)) return schema.map((item) => strictify(item));
  if (!isObject(schema)) return schema;
  const closesHere = isObjectSchema(schema);
  const out: Schema = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, strictifyKeyword(key, value, open, closesHere)]),
  );
  const hasOwnRule = "additionalProperties" in schema || "unevaluatedProperties" in schema;
  if (closesHere && !open && !hasOwnRule) out.unevaluatedProperties = false;
  return out;
}

export type Contract = {
  /** The spec's component schema names. */
  names: string[];
  /** Validation problems of [value] against component [name], one readable line each ("Booking/customer/email: …"). */
  problems(name: string, value: unknown): string[];
  /** Spec properties (dotted paths) absent from [value]: the fixture, and so the frontend type, lacks them. */
  missingProperties(name: string, value: unknown): string[];
  /** Properties the spec allows to be null that are present and not null in [value]. */
  nonNullNullables(name: string, value: unknown): string[];
  /** Properties present in [value] that the spec does not require (null ones excepted: they test nullability). */
  presentOptionals(name: string, value: unknown): string[];
  /** The `enum` of component [name]. */
  enumOf(name: string): unknown[];
};

function describeError(name: string, error: ErrorObject): string {
  const at = `${name}${error.instancePath}`;
  const params = error.params as Record<string, unknown>;
  const detail =
    "unevaluatedProperty" in params
      ? `'${String(params.unevaluatedProperty)}' is not in the spec`
      : "missingProperty" in params
        ? `'${String(params.missingProperty)}' is required by the spec`
        : (error.message ?? error.keyword);
  return `${at}: ${detail}`;
}

export function loadContract(): Contract {
  const raw = loadSchemas();
  const defs: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(raw)) {
    defs[name] = strictify(schema);
    defs[openName(name)] = strictify(schema, true);
  }
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  ajv.addFormat("date", /^\d{4}-\d{2}-\d{2}$/);
  ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/);
  ajv.addFormat("email", /^[^@\s]+@[^@\s]+$/);
  ajv.addFormat("binary", true);
  ajv.addSchema({ $id: SPEC_ID, $defs: defs });

  const validators = new Map<string, ValidateFunction>();
  const validatorFor = (ref: string): ValidateFunction => {
    let validate = validators.get(ref);
    if (!validate) {
      validate = ajv.compile({ $ref: ref });
      validators.set(ref, validate);
    }
    return validate;
  };
  const schemaRef = (name: string) => {
    if (!(name in raw)) throw new Error(`No schema "${name}" in backend/openapi.yaml`);
    return `${SPEC_ID}#/$defs/${name}`;
  };

  /** Resolves `$ref`s and composition into the object schemas that apply to [value]. */
  const resolve = (schema: unknown, value: unknown): Schema[] => {
    if (!isObject(schema)) return [];
    if (typeof schema.$ref === "string") {
      const name = schema.$ref.slice(REF_PREFIX.length);
      return resolve(raw[name], value);
    }
    const parts: Schema[] = [schema];
    if (Array.isArray(schema.allOf)) for (const part of schema.allOf) parts.push(...resolve(part, value));
    for (const key of ["oneOf", "anyOf"] as const) {
      const branches = schema[key];
      if (!Array.isArray(branches)) continue;
      const matching = branches.find((branch) => branchMatches(branch, value));
      if (matching) parts.push(...resolve(matching, value));
    }
    return parts;
  };

  const branchValidators = new WeakMap<Schema, ValidateFunction>();
  const branchMatches = (branch: unknown, value: unknown): boolean => {
    if (!isObject(branch)) return false;
    let validate = branchValidators.get(branch);
    if (!validate) {
      validate = ajv.compile(strictify(branch, true) as Schema);
      branchValidators.set(branch, validate);
    }
    return validate(value);
  };

  const allowsNull = (schema: unknown): boolean => {
    if (!isObject(schema)) return false;
    if (typeof schema.$ref === "string") return allowsNull(raw[schema.$ref.slice(REF_PREFIX.length)]);
    const type = schema.type;
    if (type === "null" || (Array.isArray(type) && type.includes("null"))) return true;
    for (const key of ["oneOf", "anyOf"] as const) {
      const branches = schema[key];
      if (Array.isArray(branches) && branches.some(allowsNull)) return true;
    }
    return Array.isArray(schema.allOf) && schema.allOf.every(allowsNull);
  };

  type Visited = {
    path: string;
    property: string;
    schema: unknown;
    present: boolean;
    required: boolean;
    value: unknown;
  };
  type Visit = (visited: Visited) => void;

  /** Walks [value] against [schema] calling [visit] for every declared property of every object on the way. */
  const walk = (schema: unknown, value: unknown, path: string, visit: Visit): void => {
    const parts = resolve(schema, value);
    if (Array.isArray(value)) {
      const items = parts.map((part) => part.items).find((items) => items !== undefined);
      value.forEach((item, index) => walk(items, item, `${path}[${index}]`, visit));
      return;
    }
    if (!isObject(value)) return;
    const required = new Set(
      parts.flatMap((part) => (Array.isArray(part.required) ? (part.required as string[]) : [])),
    );
    for (const part of parts) {
      if (isObject(part.properties)) {
        for (const [property, propertySchema] of Object.entries(part.properties)) {
          const present = property in value;
          visit({
            path,
            property,
            schema: propertySchema,
            present,
            required: required.has(property),
            value: value[property],
          });
          if (present) walk(propertySchema, value[property], `${path}.${property}`, visit);
        }
      }
      if (isObject(part.additionalProperties)) {
        const declared = new Set(
          parts.flatMap((p) => (isObject(p.properties) ? Object.keys(p.properties) : [])),
        );
        for (const [key, item] of Object.entries(value)) {
          if (!declared.has(key)) walk(part.additionalProperties, item, `${path}.${key}`, visit);
        }
      }
    }
  };

  const collect = (name: string, value: unknown, pick: (visited: Visited) => boolean) => {
    const found: string[] = [];
    walk({ $ref: `${REF_PREFIX}${name}` }, value, name, (args) => {
      if (pick(args)) found.push(`${args.path}.${args.property}`);
    });
    return found;
  };

  return {
    names: Object.keys(raw),
    problems(name, value) {
      const validate = validatorFor(schemaRef(name));
      if (validate(value)) return [];
      return (validate.errors ?? []).map((error) => describeError(name, error));
    },
    missingProperties: (name, value) => collect(name, value, ({ present }) => !present),
    nonNullNullables: (name, value) =>
      collect(name, value, ({ present, schema, value: v }) => present && v !== null && allowsNull(schema)),
    presentOptionals: (name, value) =>
      collect(name, value, ({ present, required, value: v }) => present && !required && v !== null),
    enumOf(name) {
      schemaRef(name);
      const schema = raw[name];
      if (!schema || !Array.isArray(schema.enum)) throw new Error(`Schema "${name}" is not an enum`);
      return schema.enum as unknown[];
    },
  };
}
