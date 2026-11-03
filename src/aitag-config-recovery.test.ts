import {expect,it} from 'vitest';
import {normalizeAitagConfig} from './aitag';
it('keeps month options after normalizing a cached IPC/session configuration twice',()=>{
  const raw={asset_base_url:'https://cdn.example/',available_years:[2026],available_months:['2026-10','2026-09']};
  const once=normalizeAitagConfig(raw);
  expect(normalizeAitagConfig(once)).toEqual(once);
});
it('does not silently treat unrelated HTTP200 JSON as an empty monthly configuration',()=>{
  expect(()=>normalizeAitagConfig({message:'unavailable'})).toThrow();
});
