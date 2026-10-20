import { normalizeObjectInfo } from "./object-info";
import type { ComfyApiPrompt } from "./api-prompt";

/** Synthetic schema fixture. These names are not claims that local files exist. */
export const rawCoreCatalog = {
  UNETLoader:{input:{required:{unet_name:[["model.safetensors","other.safetensors"]],weight_dtype:[["default","fp8_e4m3fn"]]}},input_order:{required:["unet_name","weight_dtype"]},output:["MODEL"],python_module:"nodes"},
  CLIPLoader:{input:{required:{clip_name:["COMBO",{options:["clip.safetensors"]}],type:[["stable_diffusion","moss_image","krea2"]]},optional:{device:[["default","cpu"]]}},input_order:{required:["clip_name","type"],optional:["device"]},output:["CLIP"],python_module:"nodes"},
  VAELoader:{input:{required:{vae_name:[["vae.safetensors"]]}},input_order:{required:["vae_name"]},output:["VAE"],python_module:"nodes"},
  CLIPTextEncode:{input:{required:{text:["STRING",{multiline:true}],clip:["CLIP",{}]}},input_order:{required:["text","clip"]},output:["CONDITIONING"],python_module:"nodes"},
  EmptyLatentImage:{input:{required:{width:["INT",{default:1024,min:16,max:16384,step:8}],height:["INT",{default:1024,min:16,max:16384,step:8}],batch_size:["INT",{default:1,min:1,max:4096}]}},input_order:{required:["width","height","batch_size"]},output:["LATENT"],python_module:"nodes"},
  KSampler:{input:{required:{model:["MODEL",{}],seed:["INT",{min:0,max:18446744073709551615,control_after_generate:true}],steps:["INT",{min:1,max:10000}],cfg:["FLOAT",{min:0,max:100}],sampler_name:[["euler","er_sde"]],scheduler:[["simple","normal"]],positive:["CONDITIONING",{}],negative:["CONDITIONING",{}],latent_image:["LATENT",{}],denoise:["FLOAT",{min:0,max:1}]}},input_order:{required:["model","seed","steps","cfg","sampler_name","scheduler","positive","negative","latent_image","denoise"]},output:["LATENT"],python_module:"nodes"},
  VAEDecode:{input:{required:{samples:["LATENT",{}],vae:["VAE",{}]}},input_order:{required:["samples","vae"]},output:["IMAGE"],python_module:"nodes"},
  SaveImage:{input:{required:{images:["IMAGE",{}],filename_prefix:["STRING",{default:"ComfyUI"}]}},input_order:{required:["images","filename_prefix"]},output:[],output_node:true,python_module:"nodes"},
  PrimitiveStringMultiline:{input:{required:{value:["STRING",{multiline:true}]}},input_order:{required:["value"]},output:["STRING"],python_module:"comfy_extras.nodes_primitive"},
  PrimitiveBoolean:{input:{required:{value:["BOOLEAN",{}]}},input_order:{required:["value"]},output:["BOOLEAN"],python_module:"comfy_extras.nodes_primitive"},
  PrimitiveInt:{input:{required:{value:["INT",{min:-9223372036854775807,max:9223372036854775807,control_after_generate:"fixed"}]}},input_order:{required:["value"]},output:["INT"],python_module:"comfy_extras.nodes_primitive"},
  ConditioningZeroOut:{input:{required:{conditioning:["CONDITIONING",{}]}},input_order:{required:["conditioning"]},output:["CONDITIONING"],python_module:"nodes"},
  ConditioningCombine:{input:{required:{conditioning_1:["CONDITIONING",{}],conditioning_2:["CONDITIONING",{}]}},input_order:{required:["conditioning_1","conditioning_2"]},output:["CONDITIONING"],python_module:"nodes"},
  ComfySwitchNode:{input:{required:{switch:["BOOLEAN",{}]},optional:{on_false:["COMFY_MATCHTYPE_V3",{}],on_true:["COMFY_MATCHTYPE_V3",{}]}},input_order:{required:["switch"],optional:["on_false","on_true"]},output:["COMFY_MATCHTYPE_V3"],python_module:"comfy_extras.nodes_logic"},
};
export const coreCatalog = normalizeObjectInfo(rawCoreCatalog);
export function corePrompt():ComfyApiPrompt { return {
  "1":{class_type:"UNETLoader",inputs:{unet_name:"model.safetensors",weight_dtype:"default"}},
  "2":{class_type:"CLIPLoader",inputs:{clip_name:"clip.safetensors",type:"stable_diffusion"}},
  "3":{class_type:"VAELoader",inputs:{vae_name:"vae.safetensors"}},
  "4":{class_type:"CLIPTextEncode",inputs:{text:"positive text",clip:["2",0]}},
  "5":{class_type:"CLIPTextEncode",inputs:{text:"negative text",clip:["2",0]}},
  "6":{class_type:"EmptyLatentImage",inputs:{width:1024,height:1024,batch_size:1}},
  "7":{class_type:"KSampler",inputs:{model:["1",0],seed:12345,steps:25,cfg:4,sampler_name:"euler",scheduler:"simple",positive:["4",0],negative:["5",0],latent_image:["6",0],denoise:1}},
  "8":{class_type:"VAEDecode",inputs:{samples:["7",0],vae:["3",0]}},
  "9":{class_type:"SaveImage",inputs:{images:["8",0],filename_prefix:"ComfyUI"}},
}; }
