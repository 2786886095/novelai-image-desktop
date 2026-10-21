/** Presentation-only allow-list verified against pinned upstream source.
 * It does not imply local installation, execution or model compatibility. */
export interface ComfyNodeDisplayEntry {classType:string;titleKey:string;aliases:readonly string[];inputs:Readonly<Record<string,string>>;source:string}
export const COMFY_NODE_DISPLAY_SOURCES:Readonly<Record<string,string>>={
  "core/nodes.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/nodes.py",
  "core/comfy_extras/nodes_flux.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_flux.py",
  "core/comfy_extras/nodes_clip_sdxl.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_clip_sdxl.py",
  "core/comfy_extras/nodes_sd3.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_sd3.py",
  "core/comfy_extras/nodes_model_advanced.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_model_advanced.py",
  "core/comfy_extras/nodes_custom_sampler.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_custom_sampler.py",
  "core/comfy_extras/nodes_qwen.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_qwen.py",
  "core/comfy_extras/nodes_zimage.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_zimage.py",
  "core/comfy_extras/nodes_chroma_radiance.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_chroma_radiance.py",
  "core/comfy_extras/nodes_hidream.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_hidream.py",
  "core/comfy_extras/nodes_hidream_o1.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_hidream_o1.py",
  "core/comfy_extras/nodes_hunyuan.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_hunyuan.py",
  "core/comfy_extras/nodes_lumina2.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_lumina2.py",
  "core/comfy_extras/nodes_pixart.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_pixart.py",
  "core/comfy_extras/nodes_moss_image.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_moss_image.py",
  "core/comfy_extras/nodes_model_patch.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_model_patch.py",
  "core/comfy_extras/nodes_upscale_model.py": "https://raw.githubusercontent.com/Comfy-Org/ComfyUI/7a28332047b6af638dc6c7f72ef3481a718769fd/comfy_extras/nodes_upscale_model.py",
  "gguf/nodes.py": "https://raw.githubusercontent.com/city96/ComfyUI-GGUF/6ea2651e7df66d7585f6ffee804b20e92fb38b8a/nodes.py",
  "kj/nodes/nodes.py": "https://raw.githubusercontent.com/kijai/ComfyUI-KJNodes/f4bae1f9960e5d643573a2ecf7abd56453a21821/nodes/nodes.py",
  "kj/nodes/image_nodes.py": "https://raw.githubusercontent.com/kijai/ComfyUI-KJNodes/f4bae1f9960e5d643573a2ecf7abd56453a21821/nodes/image_nodes.py",
  "kj/nodes/model_optimization_nodes.py": "https://raw.githubusercontent.com/kijai/ComfyUI-KJNodes/f4bae1f9960e5d643573a2ecf7abd56453a21821/nodes/model_optimization_nodes.py",
  "ipadapter/IPAdapterPlus.py": "https://raw.githubusercontent.com/cubiq/ComfyUI_IPAdapter_plus/a0f451a5113cf9becb0847b92884cb10cbdec0ef/IPAdapterPlus.py",
  "impact/modules/impact/impact_pack.py": "https://raw.githubusercontent.com/ltdrdata/ComfyUI-Impact-Pack/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/impact_pack.py",
  "impact/modules/impact/pipe.py": "https://raw.githubusercontent.com/ltdrdata/ComfyUI-Impact-Pack/429d0159ad429e64d2b3916e6e7be9c22d025c3c/modules/impact/pipe.py",
  "ultimate/usdu_nodes.py": "https://raw.githubusercontent.com/ssitu/ComfyUI_UltimateSDUpscale/a5547db9e1d07d3318bb21e9e9c474f4c1e9c8df/usdu_nodes.py"
};
export const COMFY_NODE_DISPLAY_CATALOG:readonly ComfyNodeDisplayEntry[]=[
  {
    "classType": "CLIPTextEncode",
    "titleKey": "文本编码",
    "aliases": [
      "CLIP Text Encode (Prompt)",
      "Positive prompt",
      "Negative prompt"
    ],
    "inputs": {
      "text": "提示词"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "ConditioningCombine",
    "titleKey": "合并条件",
    "aliases": [
      "Conditioning (Combine)"
    ],
    "inputs": {},
    "source": "core/nodes.py"
  },
  {
    "classType": "ConditioningSetArea",
    "titleKey": "设置条件区域",
    "aliases": [
      "Conditioning (Set Area)"
    ],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "x": "水平位置",
      "y": "垂直位置",
      "strength": "强度"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "ConditioningSetMask",
    "titleKey": "设置条件蒙版",
    "aliases": [
      "Conditioning (Set Mask)"
    ],
    "inputs": {
      "strength": "强度",
      "set_cond_area": "条件区域方式"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "ConditioningZeroOut",
    "titleKey": "清零条件",
    "aliases": [
      "Conditioning Zero Out",
      "Zeroed negative (Krea 2)"
    ],
    "inputs": {},
    "source": "core/nodes.py"
  },
  {
    "classType": "VAEDecode",
    "titleKey": "VAE 解码",
    "aliases": [
      "VAE Decode"
    ],
    "inputs": {},
    "source": "core/nodes.py"
  },
  {
    "classType": "VAEDecodeTiled",
    "titleKey": "分块 VAE 解码",
    "aliases": [
      "VAE Decode (Tiled)"
    ],
    "inputs": {
      "tile_size": "分块尺寸",
      "overlap": "分块重叠",
      "temporal_size": "时间分块尺寸",
      "temporal_overlap": "时间分块重叠"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "VAEEncode",
    "titleKey": "VAE 编码",
    "aliases": [
      "VAE Encode"
    ],
    "inputs": {},
    "source": "core/nodes.py"
  },
  {
    "classType": "VAEEncodeTiled",
    "titleKey": "分块 VAE 编码",
    "aliases": [
      "VAE Encode (Tiled)"
    ],
    "inputs": {
      "tile_size": "分块尺寸",
      "overlap": "分块重叠",
      "temporal_size": "时间分块尺寸",
      "temporal_overlap": "时间分块重叠"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "VAEEncodeForInpaint",
    "titleKey": "重绘 VAE 编码",
    "aliases": [
      "VAE Encode (for Inpainting)"
    ],
    "inputs": {
      "grow_mask_by": "蒙版扩张量"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "CheckpointLoader",
    "titleKey": "检查点加载器",
    "aliases": [
      "Load Checkpoint With Config (DEPRECATED)"
    ],
    "inputs": {
      "ckpt_name": "检查点文件"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "CheckpointLoaderSimple",
    "titleKey": "简易检查点加载器",
    "aliases": [
      "Load Checkpoint"
    ],
    "inputs": {
      "ckpt_name": "检查点文件"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "LoraLoader",
    "titleKey": "LoRA 加载器",
    "aliases": [
      "Load LoRA (Model and CLIP)"
    ],
    "inputs": {
      "lora_name": "LoRA 文件",
      "strength_model": "模型强度",
      "strength_clip": "文本编码器强度"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "LoraLoaderModelOnly",
    "titleKey": "仅模型 LoRA 加载器",
    "aliases": [
      "Load LoRA"
    ],
    "inputs": {
      "lora_name": "LoRA 文件",
      "strength_model": "模型强度"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "VAELoader",
    "titleKey": "VAE 加载器",
    "aliases": [
      "Load VAE",
      "VAE"
    ],
    "inputs": {
      "vae_name": "VAE 文件"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "ControlNetLoader",
    "titleKey": "ControlNet 加载器",
    "aliases": [
      "Load ControlNet Model"
    ],
    "inputs": {
      "control_net_name": "ControlNet 文件"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "ControlNetApplyAdvanced",
    "titleKey": "应用 ControlNet（高级）",
    "aliases": [
      "Apply ControlNet"
    ],
    "inputs": {
      "strength": "强度",
      "start_percent": "起始比例",
      "end_percent": "结束比例"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "UNETLoader",
    "titleKey": "扩散模型",
    "aliases": [
      "Load Diffusion Model",
      "Diffusion model"
    ],
    "inputs": {
      "unet_name": "模型文件",
      "weight_dtype": "权重数据类型"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "CLIPLoader",
    "titleKey": "文本编码器",
    "aliases": [
      "Load CLIP",
      "Text encoder",
      "Text encoder (match model family)"
    ],
    "inputs": {
      "clip_name": "文本编码器文件",
      "type": "类型",
      "device": "运行设备"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "DualCLIPLoader",
    "titleKey": "双文本编码器加载器",
    "aliases": [
      "Load CLIP (Dual)"
    ],
    "inputs": {
      "clip_name1": "文本编码器文件 1",
      "clip_name2": "文本编码器文件 2",
      "type": "类型",
      "device": "运行设备"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "EmptyLatentImage",
    "titleKey": "空潜空间图像",
    "aliases": [
      "Empty Latent Image"
    ],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "batch_size": "批量数"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "LatentUpscale",
    "titleKey": "调整潜空间尺寸",
    "aliases": [
      "Upscale Latent"
    ],
    "inputs": {
      "upscale_method": "缩放方法",
      "width": "宽度",
      "height": "高度",
      "crop": "裁剪"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "LatentUpscaleBy",
    "titleKey": "按比例缩放潜空间",
    "aliases": [
      "Upscale Latent By"
    ],
    "inputs": {
      "upscale_method": "缩放方法",
      "scale_by": "缩放倍率"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "KSampler",
    "titleKey": "采样器",
    "aliases": [
      "KSampler"
    ],
    "inputs": {
      "seed": "种子",
      "steps": "步数",
      "cfg": "CFG",
      "sampler_name": "采样器",
      "scheduler": "调度器",
      "denoise": "重绘强度"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "KSamplerAdvanced",
    "titleKey": "高级采样器",
    "aliases": [
      "KSampler (Advanced)"
    ],
    "inputs": {
      "add_noise": "添加噪声",
      "noise_seed": "种子",
      "steps": "步数",
      "cfg": "CFG",
      "sampler_name": "采样器",
      "scheduler": "调度器",
      "start_at_step": "起始步数",
      "end_at_step": "结束步数",
      "return_with_leftover_noise": "保留剩余噪声"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "SaveImage",
    "titleKey": "保存图像",
    "aliases": [
      "Save Image"
    ],
    "inputs": {
      "filename_prefix": "文件名前缀"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "PreviewImage",
    "titleKey": "预览图像",
    "aliases": [
      "Preview Image"
    ],
    "inputs": {},
    "source": "core/nodes.py"
  },
  {
    "classType": "LoadImage",
    "titleKey": "加载图像",
    "aliases": [
      "Load Image"
    ],
    "inputs": {},
    "source": "core/nodes.py"
  },
  {
    "classType": "ImageScale",
    "titleKey": "调整图像尺寸",
    "aliases": [
      "Upscale Image"
    ],
    "inputs": {
      "upscale_method": "缩放方法",
      "width": "宽度",
      "height": "高度",
      "crop": "裁剪"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "ImageScaleBy",
    "titleKey": "按比例缩放",
    "aliases": [
      "Upscale Image By"
    ],
    "inputs": {
      "upscale_method": "缩放方法",
      "scale_by": "缩放倍率"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "ImagePadForOutpaint",
    "titleKey": "扩图填充",
    "aliases": [
      "Pad Image for Outpainting"
    ],
    "inputs": {
      "left": "左侧扩展",
      "top": "顶部扩展",
      "right": "右侧扩展",
      "bottom": "底部扩展",
      "feathering": "边缘羽化"
    },
    "source": "core/nodes.py"
  },
  {
    "classType": "CLIPTextEncodeFlux",
    "titleKey": "FLUX 文本编码",
    "aliases": [],
    "inputs": {
      "clip_l": "CLIP-L 提示词",
      "t5xxl": "T5 提示词",
      "guidance": "引导强度"
    },
    "source": "core/comfy_extras/nodes_flux.py"
  },
  {
    "classType": "EmptyFlux2LatentImage",
    "titleKey": "FLUX 2 空潜空间图像",
    "aliases": [
      "Empty Flux 2 Latent"
    ],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "batch_size": "批量数"
    },
    "source": "core/comfy_extras/nodes_flux.py"
  },
  {
    "classType": "FluxGuidance",
    "titleKey": "FLUX 引导强度",
    "aliases": [],
    "inputs": {
      "guidance": "引导强度"
    },
    "source": "core/comfy_extras/nodes_flux.py"
  },
  {
    "classType": "FluxDisableGuidance",
    "titleKey": "关闭 FLUX 引导",
    "aliases": [],
    "inputs": {},
    "source": "core/comfy_extras/nodes_flux.py"
  },
  {
    "classType": "FluxKontextImageScale",
    "titleKey": "FLUX Kontext 图像缩放",
    "aliases": [],
    "inputs": {},
    "source": "core/comfy_extras/nodes_flux.py"
  },
  {
    "classType": "FluxKontextMultiReferenceLatentMethod",
    "titleKey": "编辑模型参考方式",
    "aliases": [
      "Edit Model Reference Method"
    ],
    "inputs": {
      "reference_latents_method": "参考潜空间方式"
    },
    "source": "core/comfy_extras/nodes_flux.py"
  },
  {
    "classType": "Flux2Scheduler",
    "titleKey": "FLUX 2 调度器",
    "aliases": [],
    "inputs": {
      "steps": "步数",
      "width": "宽度",
      "height": "高度"
    },
    "source": "core/comfy_extras/nodes_flux.py"
  },
  {
    "classType": "CLIPTextEncodeSDXLRefiner",
    "titleKey": "SDXL Refiner 文本编码",
    "aliases": [
      "CLIP Text Encode (SDXL Refiner)"
    ],
    "inputs": {
      "ascore": "美学评分",
      "width": "宽度",
      "height": "高度",
      "text": "提示词"
    },
    "source": "core/comfy_extras/nodes_clip_sdxl.py"
  },
  {
    "classType": "CLIPTextEncodeSDXL",
    "titleKey": "SDXL 文本编码",
    "aliases": [
      "CLIP Text Encode (SDXL)"
    ],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "crop_w": "水平裁剪偏移",
      "crop_h": "垂直裁剪偏移",
      "target_width": "目标宽度",
      "target_height": "目标高度",
      "text_g": "CLIP-G 提示词",
      "text_l": "CLIP-L 提示词"
    },
    "source": "core/comfy_extras/nodes_clip_sdxl.py"
  },
  {
    "classType": "TripleCLIPLoader",
    "titleKey": "三文本编码器加载器",
    "aliases": [
      "Load CLIP (Triple)"
    ],
    "inputs": {
      "clip_name1": "文本编码器文件 1",
      "clip_name2": "文本编码器文件 2",
      "clip_name3": "文本编码器文件 3"
    },
    "source": "core/comfy_extras/nodes_sd3.py"
  },
  {
    "classType": "EmptySD3LatentImage",
    "titleKey": "空潜空间图像（SD3）",
    "aliases": [],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "batch_size": "批量数"
    },
    "source": "core/comfy_extras/nodes_sd3.py"
  },
  {
    "classType": "CLIPTextEncodeSD3",
    "titleKey": "SD3 文本编码",
    "aliases": [
      "CLIP Text Encode (SD3)"
    ],
    "inputs": {
      "clip_l": "CLIP-L 提示词",
      "clip_g": "CLIP-G 提示词",
      "t5xxl": "T5 提示词",
      "empty_padding": "空提示词填充"
    },
    "source": "core/comfy_extras/nodes_sd3.py"
  },
  {
    "classType": "ControlNetApplySD3",
    "titleKey": "应用 ControlNet（高级）",
    "aliases": [
      "Apply Controlnet with VAE"
    ],
    "inputs": {
      "strength": "强度",
      "start_percent": "起始比例",
      "end_percent": "结束比例"
    },
    "source": "core/comfy_extras/nodes_sd3.py"
  },
  {
    "classType": "ModelSamplingDiscrete",
    "titleKey": "离散模型采样",
    "aliases": [],
    "inputs": {
      "sampling": "采样方式",
      "zsnr": "零终端信噪比"
    },
    "source": "core/comfy_extras/nodes_model_advanced.py"
  },
  {
    "classType": "ModelSamplingSD3",
    "titleKey": "SD3 模型采样",
    "aliases": [],
    "inputs": {
      "shift": "采样偏移"
    },
    "source": "core/comfy_extras/nodes_model_advanced.py"
  },
  {
    "classType": "ModelSamplingAuraFlow",
    "titleKey": "AuraFlow 模型采样",
    "aliases": [],
    "inputs": {
      "shift": "采样偏移",
      "sampling": "采样方式"
    },
    "source": "core/comfy_extras/nodes_model_advanced.py"
  },
  {
    "classType": "ModelSamplingFlux",
    "titleKey": "FLUX 模型采样",
    "aliases": [],
    "inputs": {
      "max_shift": "最大采样偏移",
      "base_shift": "基础采样偏移",
      "width": "宽度",
      "height": "高度"
    },
    "source": "core/comfy_extras/nodes_model_advanced.py"
  },
  {
    "classType": "ModelSamplingContinuousEDM",
    "titleKey": "连续 EDM 模型采样",
    "aliases": [],
    "inputs": {
      "sampling": "采样方式",
      "sigma_max": "最大 Sigma",
      "sigma_min": "最小 Sigma"
    },
    "source": "core/comfy_extras/nodes_model_advanced.py"
  },
  {
    "classType": "ModelSamplingContinuousV",
    "titleKey": "连续 V 模型采样",
    "aliases": [],
    "inputs": {
      "sampling": "采样方式",
      "sigma_max": "最大 Sigma",
      "sigma_min": "最小 Sigma"
    },
    "source": "core/comfy_extras/nodes_model_advanced.py"
  },
  {
    "classType": "RescaleCFG",
    "titleKey": "CFG 重缩放",
    "aliases": [],
    "inputs": {
      "multiplier": "倍率"
    },
    "source": "core/comfy_extras/nodes_model_advanced.py"
  },
  {
    "classType": "BasicScheduler",
    "titleKey": "基础调度器",
    "aliases": [],
    "inputs": {
      "scheduler": "调度器",
      "steps": "步数",
      "denoise": "重绘强度"
    },
    "source": "core/comfy_extras/nodes_custom_sampler.py"
  },
  {
    "classType": "KarrasScheduler",
    "titleKey": "Karras 调度器",
    "aliases": [],
    "inputs": {
      "steps": "步数",
      "sigma_max": "最大 Sigma",
      "sigma_min": "最小 Sigma",
      "rho": "Rho 参数"
    },
    "source": "core/comfy_extras/nodes_custom_sampler.py"
  },
  {
    "classType": "KSamplerSelect",
    "titleKey": "选择采样器",
    "aliases": [],
    "inputs": {
      "sampler_name": "采样器"
    },
    "source": "core/comfy_extras/nodes_custom_sampler.py"
  },
  {
    "classType": "SamplerCustom",
    "titleKey": "自定义采样",
    "aliases": [],
    "inputs": {
      "add_noise": "添加噪声",
      "noise_seed": "种子",
      "cfg": "CFG",
      "sampler": "采样器"
    },
    "source": "core/comfy_extras/nodes_custom_sampler.py"
  },
  {
    "classType": "BasicGuider",
    "titleKey": "基础引导器",
    "aliases": [
      "Basic Guider"
    ],
    "inputs": {},
    "source": "core/comfy_extras/nodes_custom_sampler.py"
  },
  {
    "classType": "CFGGuider",
    "titleKey": "CFG 引导器",
    "aliases": [
      "CFG Guider"
    ],
    "inputs": {
      "cfg": "CFG"
    },
    "source": "core/comfy_extras/nodes_custom_sampler.py"
  },
  {
    "classType": "DualCFGGuider",
    "titleKey": "双 CFG 引导器",
    "aliases": [
      "Dual CFG Guider"
    ],
    "inputs": {
      "cfg_conds": "条件 CFG",
      "cfg_cond2_negative": "第二条件负面 CFG",
      "style": "样式"
    },
    "source": "core/comfy_extras/nodes_custom_sampler.py"
  },
  {
    "classType": "DisableNoise",
    "titleKey": "关闭噪声",
    "aliases": [],
    "inputs": {},
    "source": "core/comfy_extras/nodes_custom_sampler.py"
  },
  {
    "classType": "RandomNoise",
    "titleKey": "随机噪声",
    "aliases": [],
    "inputs": {
      "noise_seed": "种子"
    },
    "source": "core/comfy_extras/nodes_custom_sampler.py"
  },
  {
    "classType": "SamplerCustomAdvanced",
    "titleKey": "高级自定义采样",
    "aliases": [],
    "inputs": {
      "sampler": "采样器"
    },
    "source": "core/comfy_extras/nodes_custom_sampler.py"
  },
  {
    "classType": "TextEncodeQwenImageEdit",
    "titleKey": "Qwen Image Edit 文本编码",
    "aliases": [
      "Text Encode Qwen Image Edit"
    ],
    "inputs": {
      "prompt": "提示词"
    },
    "source": "core/comfy_extras/nodes_qwen.py"
  },
  {
    "classType": "TextEncodeQwenImageEditPlus",
    "titleKey": "Qwen Image Edit Plus 文本编码",
    "aliases": [
      "Text Encode Qwen Image Edit Plus"
    ],
    "inputs": {
      "prompt": "提示词"
    },
    "source": "core/comfy_extras/nodes_qwen.py"
  },
  {
    "classType": "TextEncodeQwenImage21",
    "titleKey": "Qwen Image 2.1 文本编码",
    "aliases": [
      "Text Encode Qwen Image 2.1"
    ],
    "inputs": {
      "prompt": "提示词",
      "negative_prompt": "负面提示词",
      "resolution": "参考分辨率"
    },
    "source": "core/comfy_extras/nodes_qwen.py"
  },
  {
    "classType": "QwenImage21Cache",
    "titleKey": "Qwen Image 2.1 缓存",
    "aliases": [
      "Qwen Image 2.1 Cache"
    ],
    "inputs": {
      "device": "运行设备",
      "dtype": "数据类型"
    },
    "source": "core/comfy_extras/nodes_qwen.py"
  },
  {
    "classType": "EmptyQwenImageLayeredLatentImage",
    "titleKey": "Qwen Image Layered 空潜空间图像",
    "aliases": [
      "Empty Qwen Image Layered Latent"
    ],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "layers": "层数或层索引",
      "batch_size": "批量数"
    },
    "source": "core/comfy_extras/nodes_qwen.py"
  },
  {
    "classType": "TextEncodeZImageOmni",
    "titleKey": "Z-Image Omni 文本编码",
    "aliases": [],
    "inputs": {
      "prompt": "提示词",
      "auto_resize_images": "自动调整参考图尺寸"
    },
    "source": "core/comfy_extras/nodes_zimage.py"
  },
  {
    "classType": "EmptyChromaRadianceLatentImage",
    "titleKey": "Chroma Radiance 空潜空间图像",
    "aliases": [],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "batch_size": "批量数"
    },
    "source": "core/comfy_extras/nodes_chroma_radiance.py"
  },
  {
    "classType": "ChromaRadianceOptions",
    "titleKey": "Chroma Radiance 选项",
    "aliases": [],
    "inputs": {
      "preserve_wrapper": "保留模型包装器",
      "start_sigma": "起始 Sigma",
      "end_sigma": "结束 Sigma",
      "nerf_tile_size": "NeRF 分块尺寸",
      "force_sequential_txt_ids": "强制连续文本编号"
    },
    "source": "core/comfy_extras/nodes_chroma_radiance.py"
  },
  {
    "classType": "QuadrupleCLIPLoader",
    "titleKey": "四文本编码器加载器",
    "aliases": [
      "Load CLIP (Quadruple)"
    ],
    "inputs": {
      "clip_name1": "文本编码器文件 1",
      "clip_name2": "文本编码器文件 2",
      "clip_name3": "文本编码器文件 3",
      "clip_name4": "文本编码器文件 4"
    },
    "source": "core/comfy_extras/nodes_hidream.py"
  },
  {
    "classType": "CLIPTextEncodeHiDream",
    "titleKey": "HiDream 文本编码",
    "aliases": [
      "CLIP Text Encode (HiDream)"
    ],
    "inputs": {
      "clip_l": "CLIP-L 提示词",
      "clip_g": "CLIP-G 提示词",
      "t5xxl": "T5 提示词",
      "llama": "Llama 提示词"
    },
    "source": "core/comfy_extras/nodes_hidream.py"
  },
  {
    "classType": "EmptyHiDreamO1LatentImage",
    "titleKey": "HiDream-O1 空潜空间图像",
    "aliases": [
      "Empty HiDream-O1 Latent Image"
    ],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "batch_size": "批量数"
    },
    "source": "core/comfy_extras/nodes_hidream_o1.py"
  },
  {
    "classType": "CLIPTextEncodeHunyuanDiT",
    "titleKey": "Hunyuan Image 文本编码",
    "aliases": [
      "CLIP Text Encode (Hunyuan Image)"
    ],
    "inputs": {
      "bert": "BERT 提示词",
      "mt5xl": "mT5 提示词"
    },
    "source": "core/comfy_extras/nodes_hunyuan.py"
  },
  {
    "classType": "EmptyHunyuanImageLatent",
    "titleKey": "Hunyuan Image 空潜空间图像",
    "aliases": [
      "Empty Hunyuan Image Latent"
    ],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "batch_size": "批量数"
    },
    "source": "core/comfy_extras/nodes_hunyuan.py"
  },
  {
    "classType": "RenormCFG",
    "titleKey": "CFG 重归一化",
    "aliases": [],
    "inputs": {
      "cfg_trunc": "CFG 截断",
      "renorm_cfg": "重归一化 CFG"
    },
    "source": "core/comfy_extras/nodes_lumina2.py"
  },
  {
    "classType": "CLIPTextEncodeLumina2",
    "titleKey": "Lumina 2 文本编码",
    "aliases": [
      "CLIP Text Encode (Lumina 2)"
    ],
    "inputs": {
      "system_prompt": "系统提示词",
      "user_prompt": "提示词"
    },
    "source": "core/comfy_extras/nodes_lumina2.py"
  },
  {
    "classType": "CLIPTextEncodePixArtAlpha",
    "titleKey": "PixArt Alpha 文本编码",
    "aliases": [
      "CLIP Text Encode (PixArt Alpha)"
    ],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "text": "提示词"
    },
    "source": "core/comfy_extras/nodes_pixart.py"
  },
  {
    "classType": "MOSSImageLayoutPrompt",
    "titleKey": "MOSS-Image 布局提示词",
    "aliases": [
      "MOSS-Image Layout Prompt"
    ],
    "inputs": {
      "prompt": "提示词",
      "width": "宽度",
      "height": "高度",
      "character_boxes": "角色框编号"
    },
    "source": "core/comfy_extras/nodes_moss_image.py"
  },
  {
    "classType": "MOSSImageControl",
    "titleKey": "MOSS-Image 颜色与深度控制",
    "aliases": [
      "MOSS-Image Color/Depth Control"
    ],
    "inputs": {
      "strength": "强度",
      "start_percent": "起始比例",
      "end_percent": "结束比例"
    },
    "source": "core/comfy_extras/nodes_moss_image.py"
  },
  {
    "classType": "AnimaLLLiteApply",
    "titleKey": "Anima 轻量控制",
    "aliases": [
      "Apply Anima LLLite"
    ],
    "inputs": {
      "strength": "强度",
      "start_percent": "起始比例",
      "end_percent": "结束比例"
    },
    "source": "core/comfy_extras/nodes_model_patch.py"
  },
  {
    "classType": "QwenImageDiffsynthControlnet",
    "titleKey": "Qwen Image 控制网络",
    "aliases": [
      "Apply Qwen Image DiffSynth ControlNet"
    ],
    "inputs": {
      "strength": "强度",
      "start_percent": "起始比例",
      "end_percent": "结束比例"
    },
    "source": "core/comfy_extras/nodes_model_patch.py"
  },
  {
    "classType": "ZImageFunControlnet",
    "titleKey": "Z-Image 控制网络",
    "aliases": [
      "Apply Fun ControlNet"
    ],
    "inputs": {
      "strength": "强度",
      "start_percent": "起始比例",
      "end_percent": "结束比例"
    },
    "source": "core/comfy_extras/nodes_model_patch.py"
  },
  {
    "classType": "UpscaleModelLoader",
    "titleKey": "放大模型加载器",
    "aliases": [
      "Load Upscale Model"
    ],
    "inputs": {
      "model_name": "模型文件"
    },
    "source": "core/comfy_extras/nodes_upscale_model.py"
  },
  {
    "classType": "ImageUpscaleWithModel",
    "titleKey": "模型放大图像",
    "aliases": [
      "Upscale Image (using Model)"
    ],
    "inputs": {},
    "source": "core/comfy_extras/nodes_upscale_model.py"
  },
  {
    "classType": "UnetLoaderGGUF",
    "titleKey": "GGUF 扩散模型加载器",
    "aliases": [
      "Unet Loader (GGUF)"
    ],
    "inputs": {
      "unet_name": "模型文件"
    },
    "source": "gguf/nodes.py"
  },
  {
    "classType": "UnetLoaderGGUFAdvanced",
    "titleKey": "GGUF Advanced 扩散模型加载器",
    "aliases": [
      "Unet Loader (GGUF/Advanced)"
    ],
    "inputs": {
      "unet_name": "模型文件",
      "dequant_dtype": "反量化数据类型",
      "patch_dtype": "补丁数据类型",
      "patch_on_device": "在设备上应用补丁"
    },
    "source": "gguf/nodes.py"
  },
  {
    "classType": "CLIPLoaderGGUF",
    "titleKey": "GGUF 文本编码器加载器",
    "aliases": [
      "CLIPLoader (GGUF)"
    ],
    "inputs": {
      "clip_name": "文本编码器文件",
      "type": "类型"
    },
    "source": "gguf/nodes.py"
  },
  {
    "classType": "DualCLIPLoaderGGUF",
    "titleKey": "GGUF Dual 文本编码器加载器",
    "aliases": [
      "DualCLIPLoader (GGUF)"
    ],
    "inputs": {
      "clip_name1": "文本编码器文件 1",
      "clip_name2": "文本编码器文件 2",
      "type": "类型"
    },
    "source": "gguf/nodes.py"
  },
  {
    "classType": "TripleCLIPLoaderGGUF",
    "titleKey": "GGUF Triple 文本编码器加载器",
    "aliases": [
      "TripleCLIPLoader (GGUF)"
    ],
    "inputs": {
      "clip_name1": "文本编码器文件 1",
      "clip_name2": "文本编码器文件 2",
      "clip_name3": "文本编码器文件 3"
    },
    "source": "gguf/nodes.py"
  },
  {
    "classType": "QuadrupleCLIPLoaderGGUF",
    "titleKey": "GGUF Quadruple 文本编码器加载器",
    "aliases": [
      "QuadrupleCLIPLoader (GGUF)"
    ],
    "inputs": {
      "clip_name1": "文本编码器文件 1",
      "clip_name2": "文本编码器文件 2",
      "clip_name3": "文本编码器文件 3",
      "clip_name4": "文本编码器文件 4"
    },
    "source": "gguf/nodes.py"
  },
  {
    "classType": "EmptyLatentImagePresets",
    "titleKey": "常用潜空间尺寸",
    "aliases": [
      "Empty Latent Image Presets"
    ],
    "inputs": {
      "dimensions": "尺寸预设",
      "invert": "交换宽高",
      "batch_size": "批量数"
    },
    "source": "kj/nodes/nodes.py"
  },
  {
    "classType": "VAELoaderKJ",
    "titleKey": "KJ VAE 加载器",
    "aliases": [
      "VAELoader KJ"
    ],
    "inputs": {
      "vae_name": "VAE 文件",
      "device": "运行设备",
      "weight_dtype": "权重数据类型"
    },
    "source": "kj/nodes/nodes.py"
  },
  {
    "classType": "ColorMatch",
    "titleKey": "颜色匹配",
    "aliases": [
      "Color Match"
    ],
    "inputs": {
      "method": "处理方式",
      "strength": "强度",
      "multithread": "多线程"
    },
    "source": "kj/nodes/image_nodes.py"
  },
  {
    "classType": "ImageResizeKJv2",
    "titleKey": "KJ 图像尺寸调整",
    "aliases": [
      "Resize Image v2"
    ],
    "inputs": {
      "width": "宽度",
      "height": "高度",
      "upscale_method": "缩放方法",
      "keep_proportion": "保持比例",
      "pad_color": "填充颜色",
      "crop_position": "裁剪位置",
      "divisible_by": "尺寸整除基数",
      "device": "运行设备"
    },
    "source": "kj/nodes/image_nodes.py"
  },
  {
    "classType": "SaveImageKJ",
    "titleKey": "KJ 保存图像",
    "aliases": [
      "Save Image KJ"
    ],
    "inputs": {
      "filename_prefix": "文件名前缀",
      "output_folder": "输出文件夹",
      "caption_file_extension": "说明文件扩展名",
      "caption": "说明文字"
    },
    "source": "kj/nodes/image_nodes.py"
  },
  {
    "classType": "CheckpointLoaderKJ",
    "titleKey": "KJ 检查点加载器",
    "aliases": [
      "CheckpointLoaderKJ"
    ],
    "inputs": {
      "ckpt_name": "检查点文件",
      "weight_dtype": "权重数据类型",
      "compute_dtype": "计算数据类型",
      "patch_cublaslinear": "使用 cuBLAS 线性层补丁",
      "sage_attention": "SageAttention 方式",
      "enable_fp16_accumulation": "启用 FP16 累加"
    },
    "source": "kj/nodes/model_optimization_nodes.py"
  },
  {
    "classType": "DiffusionModelLoaderKJ",
    "titleKey": "KJ 扩散模型加载器",
    "aliases": [
      "Diffusion Model Loader KJ"
    ],
    "inputs": {
      "model_name": "模型文件",
      "weight_dtype": "权重数据类型",
      "compute_dtype": "计算数据类型",
      "patch_cublaslinear": "使用 cuBLAS 线性层补丁",
      "sage_attention": "SageAttention 方式",
      "enable_fp16_accumulation": "启用 FP16 累加"
    },
    "source": "kj/nodes/model_optimization_nodes.py"
  },
  {
    "classType": "Krea2PromptWeight",
    "titleKey": "Krea 2 提示词权重",
    "aliases": [
      "Krea2 Prompt Weight"
    ],
    "inputs": {
      "text": "提示词",
      "strength": "强度"
    },
    "source": "kj/nodes/model_optimization_nodes.py"
  },
  {
    "classType": "MossImagePromptWeight",
    "titleKey": "MOSS-Image 提示词权重",
    "aliases": [
      "MOSS-Image Prompt Weight"
    ],
    "inputs": {
      "text": "提示词",
      "strength": "强度"
    },
    "source": "kj/nodes/model_optimization_nodes.py"
  },
  {
    "classType": "GGUFLoaderKJ",
    "titleKey": "GGUF KJ 扩散模型加载器",
    "aliases": [
      "GGUF Loader KJ"
    ],
    "inputs": {
      "model_name": "模型文件",
      "extra_model_name": "附加模型文件",
      "dequant_dtype": "反量化数据类型",
      "patch_dtype": "补丁数据类型",
      "patch_on_device": "在设备上应用补丁",
      "enable_fp16_accumulation": "启用 FP16 累加",
      "attention_override": "注意力实现覆盖"
    },
    "source": "kj/nodes/model_optimization_nodes.py"
  },
  {
    "classType": "IPAdapterUnifiedLoader",
    "titleKey": "IPAdapter 统一加载器",
    "aliases": [
      "IPAdapter Unified Loader"
    ],
    "inputs": {
      "preset": "预设"
    },
    "source": "ipadapter/IPAdapterPlus.py"
  },
  {
    "classType": "IPAdapterModelLoader",
    "titleKey": "IPAdapter 模型加载器",
    "aliases": [
      "IPAdapter Model Loader"
    ],
    "inputs": {
      "ipadapter_file": "IPAdapter 模型文件"
    },
    "source": "ipadapter/IPAdapterPlus.py"
  },
  {
    "classType": "IPAdapter",
    "titleKey": "IPAdapter 图像适配",
    "aliases": [
      "IPAdapter"
    ],
    "inputs": {
      "weight": "权重",
      "start_at": "开始作用比例",
      "end_at": "结束作用比例",
      "weight_type": "权重曲线"
    },
    "source": "ipadapter/IPAdapterPlus.py"
  },
  {
    "classType": "IPAdapterAdvanced",
    "titleKey": "高级 IPAdapter",
    "aliases": [
      "IPAdapter Advanced"
    ],
    "inputs": {
      "weight": "权重",
      "weight_type": "权重曲线",
      "combine_embeds": "嵌入合并方式",
      "start_at": "开始作用比例",
      "end_at": "结束作用比例",
      "embeds_scaling": "嵌入缩放方式"
    },
    "source": "ipadapter/IPAdapterPlus.py"
  },
  {
    "classType": "IPAdapterStyleComposition",
    "titleKey": "IPAdapter 风格与构图",
    "aliases": [
      "IPAdapter Style & Composition SDXL"
    ],
    "inputs": {
      "weight_style": "风格权重",
      "weight_composition": "构图权重",
      "expand_style": "扩展风格",
      "combine_embeds": "嵌入合并方式",
      "start_at": "开始作用比例",
      "end_at": "结束作用比例",
      "embeds_scaling": "嵌入缩放方式"
    },
    "source": "ipadapter/IPAdapterPlus.py"
  },
  {
    "classType": "IPAdapterFaceID",
    "titleKey": "IPAdapter 人脸身份",
    "aliases": [
      "IPAdapter FaceID"
    ],
    "inputs": {
      "weight": "权重",
      "weight_faceidv2": "FaceID V2 权重",
      "weight_type": "权重曲线",
      "combine_embeds": "嵌入合并方式",
      "start_at": "开始作用比例",
      "end_at": "结束作用比例",
      "embeds_scaling": "嵌入缩放方式"
    },
    "source": "ipadapter/IPAdapterPlus.py"
  },
  {
    "classType": "IPAdapterTiled",
    "titleKey": "分块 IPAdapter",
    "aliases": [
      "IPAdapter Tiled"
    ],
    "inputs": {
      "weight": "权重",
      "weight_type": "权重曲线",
      "combine_embeds": "嵌入合并方式",
      "start_at": "开始作用比例",
      "end_at": "结束作用比例",
      "sharpening": "锐化强度",
      "embeds_scaling": "嵌入缩放方式"
    },
    "source": "ipadapter/IPAdapterPlus.py"
  },
  {
    "classType": "SAMLoader",
    "titleKey": "SAM 分割模型加载器",
    "aliases": [
      "SAMLoader (Impact)"
    ],
    "inputs": {
      "model_name": "模型文件",
      "device_mode": "设备模式"
    },
    "source": "impact/modules/impact/impact_pack.py"
  },
  {
    "classType": "DetailerForEach",
    "titleKey": "区域细节修复",
    "aliases": [
      "Detailer (SEGS)"
    ],
    "inputs": {
      "guide_size": "引导尺寸",
      "guide_size_for": "按检测框确定引导尺寸",
      "max_size": "最大处理尺寸",
      "seed": "种子",
      "steps": "步数",
      "cfg": "CFG",
      "sampler_name": "采样器",
      "scheduler": "调度器",
      "denoise": "重绘强度",
      "feather": "羽化半径",
      "noise_mask": "使用噪声蒙版",
      "force_inpaint": "强制重绘",
      "wildcard": "通配提示词",
      "cycle": "修复轮数",
      "inpaint_model": "使用重绘专用模型",
      "noise_mask_feather": "噪声蒙版羽化",
      "tiled_encode": "分块编码",
      "tiled_decode": "分块解码"
    },
    "source": "impact/modules/impact/impact_pack.py"
  },
  {
    "classType": "DetailerForEachPipe",
    "titleKey": "管道区域细节修复",
    "aliases": [
      "Detailer (SEGS/pipe)"
    ],
    "inputs": {
      "guide_size": "引导尺寸",
      "guide_size_for": "按检测框确定引导尺寸",
      "max_size": "最大处理尺寸",
      "seed": "种子",
      "steps": "步数",
      "cfg": "CFG",
      "sampler_name": "采样器",
      "scheduler": "调度器",
      "denoise": "重绘强度",
      "feather": "羽化半径",
      "noise_mask": "使用噪声蒙版",
      "force_inpaint": "强制重绘",
      "wildcard": "通配提示词",
      "refiner_ratio": "精修比例",
      "cycle": "修复轮数",
      "inpaint_model": "使用重绘专用模型",
      "noise_mask_feather": "噪声蒙版羽化",
      "tiled_encode": "分块编码",
      "tiled_decode": "分块解码"
    },
    "source": "impact/modules/impact/impact_pack.py"
  },
  {
    "classType": "FaceDetailer",
    "titleKey": "人脸细节修复",
    "aliases": [],
    "inputs": {
      "guide_size": "引导尺寸",
      "guide_size_for": "按检测框确定引导尺寸",
      "max_size": "最大处理尺寸",
      "seed": "种子",
      "steps": "步数",
      "cfg": "CFG",
      "sampler_name": "采样器",
      "scheduler": "调度器",
      "denoise": "重绘强度",
      "feather": "羽化半径",
      "noise_mask": "使用噪声蒙版",
      "force_inpaint": "强制重绘",
      "bbox_threshold": "检测框阈值",
      "bbox_dilation": "检测框扩张",
      "bbox_crop_factor": "检测区域裁剪倍率",
      "sam_detection_hint": "SAM 检测提示方式",
      "sam_dilation": "SAM 蒙版扩张",
      "sam_threshold": "SAM 阈值",
      "sam_bbox_expansion": "SAM 检测框扩展",
      "sam_mask_hint_threshold": "SAM 蒙版提示阈值",
      "sam_mask_hint_use_negative": "SAM 使用负面提示",
      "drop_size": "忽略小区域尺寸",
      "wildcard": "通配提示词",
      "cycle": "修复轮数",
      "inpaint_model": "使用重绘专用模型",
      "noise_mask_feather": "噪声蒙版羽化",
      "tiled_encode": "分块编码",
      "tiled_decode": "分块解码"
    },
    "source": "impact/modules/impact/impact_pack.py"
  },
  {
    "classType": "FaceDetailerPipe",
    "titleKey": "管道人脸细节修复",
    "aliases": [
      "FaceDetailer (pipe)"
    ],
    "inputs": {
      "guide_size": "引导尺寸",
      "guide_size_for": "按检测框确定引导尺寸",
      "max_size": "最大处理尺寸",
      "seed": "种子",
      "steps": "步数",
      "cfg": "CFG",
      "sampler_name": "采样器",
      "scheduler": "调度器",
      "denoise": "重绘强度",
      "feather": "羽化半径",
      "noise_mask": "使用噪声蒙版",
      "force_inpaint": "强制重绘",
      "bbox_threshold": "检测框阈值",
      "bbox_dilation": "检测框扩张",
      "bbox_crop_factor": "检测区域裁剪倍率",
      "sam_detection_hint": "SAM 检测提示方式",
      "sam_dilation": "SAM 蒙版扩张",
      "sam_threshold": "SAM 阈值",
      "sam_bbox_expansion": "SAM 检测框扩展",
      "sam_mask_hint_threshold": "SAM 蒙版提示阈值",
      "sam_mask_hint_use_negative": "SAM 使用负面提示",
      "drop_size": "忽略小区域尺寸",
      "refiner_ratio": "精修比例",
      "cycle": "修复轮数",
      "inpaint_model": "使用重绘专用模型",
      "noise_mask_feather": "噪声蒙版羽化",
      "tiled_encode": "分块编码",
      "tiled_decode": "分块解码"
    },
    "source": "impact/modules/impact/impact_pack.py"
  },
  {
    "classType": "ToDetailerPipe",
    "titleKey": "组装修复管道",
    "aliases": [],
    "inputs": {
      "wildcard": "通配提示词"
    },
    "source": "impact/modules/impact/pipe.py"
  },
  {
    "classType": "ToBasicPipe",
    "titleKey": "组装基础管道",
    "aliases": [],
    "inputs": {},
    "source": "impact/modules/impact/pipe.py"
  },
  {
    "classType": "UltimateSDUpscale",
    "titleKey": "Ultimate SD 分块放大",
    "aliases": [
      "Ultimate SD Upscale"
    ],
    "inputs": {
      "upscale_by": "放大倍率",
      "seed": "种子",
      "steps": "步数",
      "cfg": "CFG",
      "sampler_name": "采样器",
      "scheduler": "调度器",
      "denoise": "重绘强度",
      "mode_type": "分块重绘顺序",
      "tile_width": "分块宽度",
      "tile_height": "分块高度",
      "mask_blur": "蒙版模糊",
      "tile_padding": "分块边缘填充",
      "seam_fix_mode": "接缝修复方式",
      "seam_fix_denoise": "接缝修复重绘强度",
      "seam_fix_width": "接缝修复宽度",
      "seam_fix_mask_blur": "接缝蒙版模糊",
      "seam_fix_padding": "接缝修复填充",
      "force_uniform_tiles": "强制统一分块尺寸",
      "tiled_decode": "分块解码",
      "batch_size": "批量数"
    },
    "source": "ultimate/usdu_nodes.py"
  },
  {
    "classType": "UltimateSDUpscaleNoUpscale",
    "titleKey": "Ultimate SD 仅分块重绘",
    "aliases": [
      "Ultimate SD Upscale (No Upscale)"
    ],
    "inputs": {
      "seed": "种子",
      "steps": "步数",
      "cfg": "CFG",
      "sampler_name": "采样器",
      "scheduler": "调度器",
      "denoise": "重绘强度",
      "mode_type": "分块重绘顺序",
      "tile_width": "分块宽度",
      "tile_height": "分块高度",
      "mask_blur": "蒙版模糊",
      "tile_padding": "分块边缘填充",
      "seam_fix_mode": "接缝修复方式",
      "seam_fix_denoise": "接缝修复重绘强度",
      "seam_fix_width": "接缝修复宽度",
      "seam_fix_mask_blur": "接缝蒙版模糊",
      "seam_fix_padding": "接缝修复填充",
      "force_uniform_tiles": "强制统一分块尺寸",
      "tiled_decode": "分块解码",
      "batch_size": "批量数"
    },
    "source": "ultimate/usdu_nodes.py"
  }
];
