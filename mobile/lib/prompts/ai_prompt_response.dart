class PromptResponse {
 final String content,kind; final bool retryableEmptyLength;
 const PromptResponse(this.content,[this.kind='',this.retryableEmptyLength=false]);
 bool get ok=>kind.isEmpty;
 String get message=>switch(kind){
 'refusal'=>'视觉模型拒绝了本次反推请求，未生成可用提示词。请检查请求内容及模型服务的使用要求。',
 'filtered'=>'视觉模型服务返回内容过滤结果，未生成可用提示词。',
 'truncated'=>'反推响应被长度截断，未接受为提示词；请缩短请求或提高服务输出上限。',
 'empty'=>'视觉模型返回内容为空，请检查所选模型和接口是否支持图片反推。',
 _=>'视觉模型返回了不支持的响应格式，未生成可用提示词。'};
}
bool _hasRefusal(dynamic value)=>value is String?value.trim().isNotEmpty:value!=null&&value!=false;
bool isExplicitPromptRefusal(String text){
 var s=text.trim();final f=RegExp(r'^```(?:text|txt|markdown)?\s*\r?\n([\s\S]*?)\r?\n```$',caseSensitive:false).firstMatch(s);if(f!=null)s=f[1]!.trim();
 s=s.replaceAll(RegExp('[’‘]'),"'").replaceAll(RegExp(r'\s+'),' ');
 final en=s.replaceFirst(RegExp(r"^(?:(?:i(?:'m| am)\s+)?sorry|i apologize)[\s,.!:;—-]*(?:but\s+)?",caseSensitive:false),'');
 if(RegExp(r"^i(?:\s+(?:can't|cannot|can not)|(?:'m| am)\s+unable to)\s+(?:assist\b|comply\b|help\b(?!\s+but\b))",caseSensitive:false).hasMatch(en))return true;
 final apology=RegExp(r'^(?:很|非常)?(?:抱歉|对不起)[\s，,。:：]*(?:但(?:是)?[\s，,]*)?'),zh=s.replaceFirst(apology,'');
 return RegExp(r'^我(?:无法|不能|没办法)(?:为你|为您)?(?:帮助|协助|处理|完成|满足|提供)').hasMatch(zh)||(apology.hasMatch(s)&&RegExp(r'^(?:无法|不能|没办法)(?:为你|为您)?(?:帮助|协助|处理|完成|满足|提供)').hasMatch(zh));
}
PromptResponse classifyPromptResponse(dynamic data){
 if(data is! Map||data['choices'] is! List||(data['choices'] as List).isEmpty||data['choices'][0] is! Map)return const PromptResponse('','invalid');
 final choice=data['choices'][0] as Map;if(choice['finish_reason']=='content_filter')return const PromptResponse('','filtered');
 final message=choice['message'];if(message is! Map)return const PromptResponse('','invalid');
 if(_hasRefusal(message['refusal']))return const PromptResponse('','refusal');
 final raw=message['content'];if(raw is List&&raw.any((p)=>p is Map&&(p['type']=='refusal'||_hasRefusal(p['refusal']))))return const PromptResponse('','refusal');
 String content='';if(raw is String){content=raw;}else if(raw is List){final parts=<String>[];for(final p in raw){if(p is! Map||!['text','output_text'].contains(p['type'])||p['text'] is! String)return const PromptResponse('','invalid');parts.add(p['text'] as String);}content=parts.join();}else if(raw!=null){return const PromptResponse('','invalid');}
 if(isExplicitPromptRefusal(content))return const PromptResponse('','refusal');
 if(content.trim().isEmpty)return PromptResponse('','empty',choice['finish_reason']=='length');
 if(choice['finish_reason']=='length')return const PromptResponse('','truncated');return PromptResponse(content);
}

/// Exact configured credentials only; do not rewrite actual successful prompts.
String redactAiCredentials(String text,Iterable<String> secrets){
 final values=<String>{};for(final raw in secrets){final key=raw.trim();if(key.isNotEmpty){values.add(key);values.add(Uri.encodeComponent(key));}}
 final ordered=values.toList()..sort((a,b)=>b.length.compareTo(a.length));
 for(final value in ordered){text=text.replaceAll(value,'[REDACTED]');}return text;
}
