// Generated from src/agent/api-contract.ts; do not edit.
import 'dart:convert';
final Map<String,dynamic> apiProfiles=Map<String,dynamic>.from(jsonDecode(r'''{
  "novelai": {
    "title": "NovelAI 生图",
    "secret": "token",
    "mobile": true,
    "fields": {
      "baseUrl": {
        "key": "apiBaseUrl",
        "title": "账户 API 地址",
        "type": "url"
      },
      "imageUrl": {
        "key": "imageBaseUrl",
        "title": "图片 API 地址",
        "type": "url"
      },
      "allowCustomEndpoint": {
        "key": "allowCustomEndpoint",
        "title": "允许自定义服务接收凭据",
        "type": "boolean"
      },
      "allowCustomEndpointFallback": {
        "key": "allowCustomEndpointFallback",
        "title": "自定义失败后尝试官方收费服务",
        "type": "boolean"
      }
    }
  },
  "reverse": {
    "title": "图片反推",
    "secret": "visionApiKey",
    "mobile": true,
    "fields": {
      "baseUrl": {
        "key": "visionApiUrl",
        "title": "API 地址",
        "type": "url"
      },
      "model": {
        "key": "visionApiModel",
        "title": "模型",
        "type": "text"
      }
    }
  },
  "convert": {
    "title": "提示词转换",
    "secret": "convertApiKey",
    "mobile": true,
    "fields": {
      "baseUrl": {
        "key": "convertApiUrl",
        "title": "API 地址",
        "type": "url"
      },
      "model": {
        "key": "convertApiModel",
        "title": "模型",
        "type": "text"
      }
    }
  },
  "agent": {
    "title": "酒馆对话",
    "secret": "agentApiKey",
    "mobile": true,
    "fields": {
      "baseUrl": {
        "key": "agentApiBaseUrl",
        "title": "API 地址",
        "type": "url"
      },
      "model": {
        "key": "agentApiModel",
        "title": "模型",
        "type": "text"
      },
      "protocol": {
        "key": "agentApiProtocol",
        "title": "接口协议",
        "type": "choice",
        "values": [
          "openai-compatible",
          "openai-responses",
          "anthropic-messages",
          "google-gemini"
        ]
      },
      "name": {
        "key": "agentProviderName",
        "title": "服务名称",
        "type": "text"
      }
    }
  },
  "tags": {
    "title": "标签检索服务",
    "secret": "tagServerApiKey",
    "mobile": true,
    "fields": {
      "baseUrl": {
        "key": "tagServerUrl",
        "title": "服务地址",
        "type": "url"
      },
      "enabled": {
        "key": "tagServerEnabled",
        "title": "启用",
        "type": "boolean"
      },
      "transport": {
        "key": "tagServerType",
        "title": "连接方式",
        "type": "choice",
        "values": [
          "rest",
          "http",
          "sse"
        ]
      },
      "tool": {
        "key": "tagServerTool",
        "title": "检索工具名称",
        "type": "text"
      }
    }
  },
  "translate": {
    "title": "AI 翻译",
    "secret": "translateAiApiKey",
    "mobile": false,
    "fields": {
      "baseUrl": {
        "key": "translateAiApiUrl",
        "title": "API 地址",
        "type": "url"
      },
      "model": {
        "key": "translateAiModel",
        "title": "模型",
        "type": "text"
      }
    }
  }
}'''));
