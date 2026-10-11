'use strict';

// Minimal JSON Schema (draft-07 subset) validator: type, enum, const, required,
// properties, additionalProperties, patternProperties, items, minItems, maxItems,
// minimum, maximum, minLength, maxLength, pattern, oneOf, anyOf, $ref (#/definitions/..).

const path = require('path');
const { REFERENCES, readJson } = require('./util');

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

function typeMatches(v, t) {
  const actual = typeOf(v);
  if (Array.isArray(t)) return t.some((x) => typeMatches(v, x));
  if (t === 'number') return actual === 'number' || actual === 'integer';
  return actual === t;
}

function validate(value, schema, root = schema, at = '$', errors = []) {
  if (schema.$ref) {
    const name = schema.$ref.replace('#/definitions/', '');
    return validate(value, root.definitions[name], root, at, errors);
  }
  if (schema.type && !typeMatches(value, schema.type)) {
    errors.push({ path: at, message: `expected ${[].concat(schema.type).join('|')}, got ${typeOf(value)}` });
    return errors;
  }
  if (schema.const !== undefined && value !== schema.const) errors.push({ path: at, message: `must be ${JSON.stringify(schema.const)}` });
  if (schema.enum && !schema.enum.some((e) => e === value)) {
    errors.push({ path: at, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}` });
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ path: at, message: `must be >= ${schema.minimum}` });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ path: at, message: `must be <= ${schema.maximum}` });
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push({ path: at, message: `must be at least ${schema.minLength} chars` });
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push({ path: at, message: `must be at most ${schema.maxLength} chars` });
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push({ path: at, message: `must match ${schema.pattern}` });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push({ path: at, message: `needs at least ${schema.minItems} items` });
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push({ path: at, message: `allows at most ${schema.maxItems} items` });
    if (schema.items) value.forEach((v, i) => validate(v, schema.items, root, `${at}[${i}]`, errors));
  }
  if (typeOf(value) === 'object') {
    for (const req of schema.required || []) {
      if (!(req in value)) errors.push({ path: at, message: `missing required "${req}"` });
    }
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      const child = `${at}.${k}`;
      if (props[k]) {
        validate(v, props[k], root, child, errors);
        continue;
      }
      let matched = false;
      for (const [pat, sub] of Object.entries(schema.patternProperties || {})) {
        if (new RegExp(pat).test(k)) {
          matched = true;
          validate(v, sub, root, child, errors);
        }
      }
      if (matched) continue;
      if (schema.additionalProperties === false) errors.push({ path: child, message: 'unknown property' });
      else if (typeof schema.additionalProperties === 'object') validate(v, schema.additionalProperties, root, child, errors);
    }
  }
  if (schema.oneOf || schema.anyOf) {
    const options = schema.oneOf || schema.anyOf;
    const results = options.map((o) => validate(value, o, root, at, []));
    const ok = results.filter((r) => r.length === 0).length;
    if (schema.oneOf ? ok !== 1 : ok === 0) {
      const best = results.reduce((a, b) => (b.length < a.length ? b : a));
      if (ok === 0) errors.push(...best);
      else errors.push({ path: at, message: 'matches more than one allowed shape' });
    }
  }
  return errors;
}

function load(name) {
  return readJson(path.join(REFERENCES, 'schemas', `${name}.schema.json`));
}

module.exports = { validate, load };
