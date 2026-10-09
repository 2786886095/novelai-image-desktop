// Generated from src/agent/library-contract.ts; do not edit.
import 'dart:convert';
final Map<String,dynamic> libraryFields=Map<String,dynamic>.from(jsonDecode(r'''{
  "characters": {
    "name": {
      "type": "string",
      "label": "名称",
      "max": 160
    },
    "nickname": {
      "type": "string",
      "label": "昵称",
      "max": 30000
    },
    "description": {
      "type": "string",
      "label": "描述",
      "max": 30000
    },
    "personality": {
      "type": "string",
      "label": "性格",
      "max": 30000
    },
    "scenario": {
      "type": "string",
      "label": "场景",
      "max": 30000
    },
    "firstMessage": {
      "type": "string",
      "label": "开场白",
      "max": 30000
    },
    "exampleMessages": {
      "type": "string",
      "label": "对话示例",
      "max": 30000
    },
    "creatorNotes": {
      "type": "string",
      "label": "作者备注",
      "max": 30000
    },
    "systemPrompt": {
      "type": "string",
      "label": "系统提示词",
      "max": 30000
    },
    "postHistoryInstructions": {
      "type": "string",
      "label": "历史后提示词",
      "max": 30000
    },
    "alternateGreetings": {
      "type": "array",
      "label": "备用开场白",
      "max": 100,
      "items": {
        "type": "string",
        "label": "备用开场白",
        "max": 2000
      }
    },
    "groupOnlyGreetings": {
      "type": "array",
      "label": "群聊开场白",
      "max": 100,
      "items": {
        "type": "string",
        "label": "群聊开场白",
        "max": 2000
      }
    },
    "tags": {
      "type": "array",
      "label": "标签",
      "max": 200,
      "items": {
        "type": "string",
        "label": "标签",
        "max": 2000
      }
    },
    "creator": {
      "type": "string",
      "label": "作者",
      "max": 200
    },
    "characterVersion": {
      "type": "string",
      "label": "角色版本",
      "max": 80
    },
    "favorite": {
      "type": "boolean",
      "label": "收藏"
    },
    "visual": {
      "type": "object",
      "label": "角色生图参数",
      "fields": {
        "positivePrompt": {
          "type": "string",
          "label": "正面提示词",
          "max": 30000
        },
        "negativePrompt": {
          "type": "string",
          "label": "负面提示词",
          "max": 30000
        },
        "stylePrompt": {
          "type": "string",
          "label": "风格提示词",
          "max": 30000
        },
        "model": {
          "type": "string",
          "label": "模型",
          "max": 100
        },
        "width": {
          "type": "number",
          "label": "宽度",
          "min": 64,
          "max": 4096,
          "integer": true
        },
        "height": {
          "type": "number",
          "label": "高度",
          "min": 64,
          "max": 4096,
          "integer": true
        },
        "steps": {
          "type": "number",
          "label": "步数",
          "min": 1,
          "max": 50,
          "integer": true
        },
        "scale": {
          "type": "number",
          "label": "引导强度",
          "min": 0,
          "max": 10,
          "integer": false
        },
        "sampler": {
          "type": "string",
          "label": "采样器",
          "max": 100
        },
        "count": {
          "type": "number",
          "label": "张数",
          "min": 1,
          "max": 8,
          "integer": true
        },
        "referencePresetIds": {
          "type": "array",
          "label": "参考图预设 ID",
          "max": 24,
          "items": {
            "type": "string",
            "label": "参考图预设 ID",
            "max": 2000
          }
        },
        "effort": {
          "type": "string",
          "label": "生成档位",
          "values": [
            "medium",
            "high"
          ]
        }
      }
    }
  },
  "personas": {
    "name": {
      "type": "string",
      "label": "名称",
      "max": 160
    },
    "description": {
      "type": "string",
      "label": "人设内容",
      "max": 30000
    },
    "favorite": {
      "type": "boolean",
      "label": "收藏"
    }
  },
  "lorebooks": {
    "name": {
      "type": "string",
      "label": "名称",
      "max": 160
    },
    "description": {
      "type": "string",
      "label": "世界书说明",
      "max": 10000
    },
    "scanDepth": {
      "type": "number",
      "label": "扫描深度",
      "min": 1,
      "max": 100,
      "integer": true
    },
    "tokenBudget": {
      "type": "number",
      "label": "Token 预算",
      "min": 128,
      "max": 131072,
      "integer": true
    },
    "recursiveScanning": {
      "type": "boolean",
      "label": "递归扫描"
    },
    "entries": {
      "type": "array",
      "label": "世界书条目",
      "max": 500,
      "items": {
        "type": "object",
        "fields": {
          "id": {
            "type": "string",
            "label": "条目 ID",
            "max": 200
          },
          "keys": {
            "type": "array",
            "label": "关键词",
            "max": 200,
            "items": {
              "type": "string",
              "label": "关键词",
              "max": 2000
            }
          },
          "secondaryKeys": {
            "type": "array",
            "label": "辅助关键词",
            "max": 200,
            "items": {
              "type": "string",
              "label": "辅助关键词",
              "max": 2000
            }
          },
          "content": {
            "type": "string",
            "label": "条目内容",
            "max": 30000
          },
          "enabled": {
            "type": "boolean",
            "label": "启用"
          },
          "constant": {
            "type": "boolean",
            "label": "常驻"
          },
          "selective": {
            "type": "boolean",
            "label": "辅助关键词筛选"
          },
          "caseSensitive": {
            "type": "boolean",
            "label": "区分大小写"
          },
          "insertionOrder": {
            "type": "number",
            "label": "插入顺序",
            "min": 0,
            "max": 10000,
            "integer": true
          },
          "priority": {
            "type": "number",
            "label": "优先级",
            "min": 0,
            "max": 10000,
            "integer": true
          },
          "position": {
            "type": "string",
            "label": "插入位置",
            "values": [
              "before-character",
              "after-character",
              "before-examples",
              "after-examples",
              "depth"
            ]
          },
          "depth": {
            "type": "number",
            "label": "深度",
            "min": 0,
            "max": 100,
            "integer": true
          },
          "comment": {
            "type": "string",
            "label": "备注",
            "max": 500
          }
        }
      }
    }
  },
  "samplerPresets": {
    "name": {
      "type": "string",
      "label": "名称",
      "max": 160
    },
    "systemPrompt": {
      "type": "string",
      "label": "系统提示词",
      "max": 30000
    },
    "jailbreakPrompt": {
      "type": "string",
      "label": "追加提示词",
      "max": 30000
    },
    "temperature": {
      "type": "number",
      "label": "温度",
      "min": 0,
      "max": 2,
      "integer": false
    },
    "topP": {
      "type": "number",
      "label": "Top P",
      "min": 0,
      "max": 1,
      "integer": false
    },
    "frequencyPenalty": {
      "type": "number",
      "label": "频率惩罚",
      "min": -2,
      "max": 2,
      "integer": false
    },
    "presencePenalty": {
      "type": "number",
      "label": "重复惩罚",
      "min": -2,
      "max": 2,
      "integer": false
    },
    "maxOutputTokens": {
      "type": "number",
      "label": "输出 Token 上限",
      "min": 128,
      "max": 131072,
      "integer": true
    },
    "stop": {
      "type": "array",
      "label": "停止词",
      "max": 32,
      "items": {
        "type": "string",
        "label": "停止词",
        "max": 2000
      }
    }
  },
  "styles": {
    "name": {
      "type": "string",
      "label": "名称",
      "max": 160
    },
    "prompt": {
      "type": "string",
      "label": "风格提示词",
      "max": 30000
    },
    "group": {
      "type": "string",
      "label": "分组",
      "max": 200
    },
    "rating": {
      "type": "number",
      "label": "评分",
      "min": 0,
      "max": 5,
      "integer": false
    }
  },
  "positivePresets": {
    "name": {
      "type": "string",
      "label": "名称",
      "max": 160
    },
    "prompt": {
      "type": "string",
      "label": "正面提示词",
      "max": 30000
    }
  }
}'''));
