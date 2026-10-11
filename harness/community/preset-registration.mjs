// Harness 0.1.7 replaced directory discovery with explicit preset declarations.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import yaml from 'js-yaml';
import {entryListSchema} from '@deepseek-ai/cordis-plugin-include';
export async function registerRoleplay(ctx, directory) {
  const metadata=yaml.load(await readFile(join(directory,'preset.yml'),'utf8'));
  const plugins=yaml.load(await readFile(join(directory,'agent.cordis.yml'),'utf8'),{schema:entryListSchema});
  if(!Array.isArray(plugins))throw Error('Roleplay composition must be an entry list');
  return ctx.agentPresets.register({id:'roleplay',name:metadata.name,description:metadata.description,order:metadata.order,plugins});
}
