// Generated from src/agent/software-action-contract.ts; do not hand-edit.
import 'dart:convert';
final Map<String,dynamic> softwareActionCatalog=Map<String,dynamic>.from(jsonDecode(r'''{
  "history.groups.list": {
    "title": "读取历史分组",
    "effect": "read"
  },
  "history.groups.create": {
    "title": "创建历史分组",
    "effect": "write",
    "fields": [
      "name"
    ]
  },
  "history.groups.rename": {
    "title": "重命名历史分组",
    "effect": "write",
    "fields": [
      "id",
      "name"
    ]
  },
  "history.groups.delete": {
    "title": "删除历史分组（图片保留）",
    "effect": "confirm",
    "fields": [
      "id"
    ]
  },
  "history.items.list": {
    "title": "读取历史图片",
    "effect": "read"
  },
  "history.items.move": {
    "title": "移动图片分组",
    "effect": "write",
    "fields": [
      "id",
      "group"
    ]
  },
  "history.items.rename": {
    "title": "重命名历史图片（保留原图元数据，重名自动避让）",
    "effect": "write",
    "fields": [
      "id",
      "name"
    ]
  },
  "history.groups.export": {
    "title": "导出分组原图为 ZIP（空 group 为全部，__ungrouped 为未分组）",
    "effect": "write",
    "fields": [
      "group"
    ]
  },
  "history.exports.list": {
    "title": "读取已导出的 ZIP 文件与可用状态",
    "effect": "read"
  },
  "history.exports.open": {
    "title": "打开或分享已导出的 ZIP（仅使用导出记录 ID）",
    "effect": "write",
    "fields": [
      "id"
    ]
  },
  "history.items.delete": {
    "title": "删除历史记录及软件管理的图片（共享文件保留）",
    "effect": "confirm",
    "fields": [
      "id"
    ]
  },
  "references.groups.list": {
    "title": "读取参考图分组",
    "effect": "read"
  },
  "references.list": {
    "title": "读取参考图预设",
    "effect": "read"
  },
  "references.delete": {
    "title": "删除参考图预设",
    "effect": "confirm",
    "fields": [
      "id"
    ]
  },
  "references.move": {
    "title": "移动参考图预设分组",
    "effect": "write",
    "fields": [
      "id",
      "group"
    ]
  },
  "references.groups.create": {
    "title": "创建参考图分组",
    "effect": "write",
    "fields": [
      "name"
    ]
  },
  "references.groups.delete": {
    "title": "删除参考图分组",
    "effect": "confirm",
    "fields": [
      "name"
    ]
  },
  "text.convert.list": {
    "title": "读取转换历史",
    "effect": "read"
  },
  "text.convert.delete": {
    "title": "删除转换历史项",
    "effect": "confirm",
    "fields": [
      "id"
    ]
  },
  "text.convert.clear": {
    "title": "清空转换历史",
    "effect": "confirm"
  },
  "text.reverse.list": {
    "title": "读取反推历史",
    "effect": "read"
  },
  "text.reverse.delete": {
    "title": "删除反推历史项",
    "effect": "confirm",
    "fields": [
      "id"
    ]
  },
  "text.reverse.clear": {
    "title": "清空反推历史",
    "effect": "confirm"
  }
}'''));
