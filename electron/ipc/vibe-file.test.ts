import {it,expect,vi} from 'vitest';
import axios from 'axios';
import {prepareExtras,buildPayload,countCachedVibes} from './nai';
import {DEFAULT_PARAMS} from '../../src/types';
const model='nai-diffusion-4-5-full';
it('uses imported encodings verbatim, without image decoding or paid encode requests',async()=>{
 const spy=vi.spyOn(axios,'post').mockRejectedValue(new Error('Unexpected network'));
 try {
  const extras={vibeImages:[{base64:'',encodings:[{model,infoExtracted:.7,encoding:'AQIDBA=='}],infoExtracted:.7,strength:.31}],charCaptions:[],preciseReferences:[]};
  expect(countCachedVibes(extras,{...DEFAULT_PARAMS,model})).toBe(1);
  const prepared=await prepareExtras({...DEFAULT_PARAMS,model},extras);
  const payload=buildPayload({...DEFAULT_PARAMS,model},123,prepared);
  expect(payload.parameters.reference_image_multiple).toEqual(['AQIDBA==']);
  expect(payload.parameters.reference_strength_multiple).toEqual([.31]);
  expect(spy).not.toHaveBeenCalled();
  await expect(prepareExtras({...DEFAULT_PARAMS,model:'nai-diffusion-4-5-curated'},extras)).rejects.toThrow('no original image');
  await expect(prepareExtras({...DEFAULT_PARAMS,model:'nai-diffusion-5-full'},extras)).rejects.toThrow('Vibe');
  expect(spy).not.toHaveBeenCalled();
 } finally {spy.mockRestore();}
});
