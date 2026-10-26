import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const specPath = fileURLToPath(new URL('../openapi.yaml', import.meta.url));
export const openapiSpec = YAML.parse(readFileSync(specPath, 'utf8'));
