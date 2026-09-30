import 'dart:convert';
import '../models/nai_models.dart';
import 'prompt_mode.dart';

/// Same typed-unit contract as desktop. This checks structure, not visual truth.
class ReverseTemplateProtocol {
  final int min, max;
  final bool knownCharacter, allowStyleTags;
  const ReverseTemplateProtocol(this.min,this.max,this.knownCharacter,this.allowStyleTags);
  static ReverseTemplateProtocol? resolve(String template, ReversePromptMode mode, bool known) {
    final range=RegExp(r'计数口径[^\n]*?(\d{1,3})\s*[–—-]\s*(\d{1,3})').firstMatch(template) ?? RegExp(r'有效语义单元[\s\S]{0,80}?(\d{1,3})\s*[–—-]\s*(\d{1,3})').firstMatch(template);
    if(mode!=ReversePromptMode.mixed||range==null||!RegExp(r'(?:65\s*[–—-]\s*75|70)\s*%').hasMatch(template))return null;
    return ReverseTemplateProtocol(RegExp(r'极短输入允许\s*25\s*[–—-]\s*49').hasMatch(template)?25:int.parse(range[1]!),int.parse(range[2]!),known,!RegExp(r'(?:不输出|无)[^\n]{0,30}(?:画师|画质|质量)').hasMatch(template));
  }
  String get instruction => '''软件内部输出协议：返回 JSON {"segments":[{"units":[{"kind":"tag","text":"1girl"},{"kind":"natural","text":"her left hand rests on the railing"}]}]}。
每项为一个有效单元（通常无逗号；引号内画面文字允许逗号和中文，不能拆开）。单人一个 segment，多人 base 与角色各一个 segment，角色段以 girl/boy/other 开头。Tag 65–75%，自然短语25–35%，总计 $min–$max。优先遵守不虚构和短输入例外；信息充分时建议60单元（42 Tag、18自然短语），不要用重复、伪造关系、同义词或不可见细节凑数。Tag 不得假标 natural；自然短语描述有证据的空间和身体关系。角色身份不替代可见动作、构图、道具、环境。
${knownCharacter ? '本次内部协议覆盖前文的字符串 JSON 协议：返回 {"namePrompt":{"segments":[{"units":[]}]},"featurePrompt":{"segments":[{"units":[]}]}}，两个完整版本各自独立满足模板。' : ''}''';
  ({String prompt, PromptVariants? variants}) parse(String raw,{String source=''}) {
    final value=jsonDecode(raw.trim().replaceFirst(RegExp(r'^```(?:json)?\s*',caseSensitive:false),'').replaceFirst(RegExp(r'\s*```$'),''));
    if(!knownCharacter)return (prompt:_audit(value,source),variants:null);
    final name=_audit(value['namePrompt'],source),feature=_audit(value['featurePrompt'],source);
    return (prompt:name,variants:PromptVariants(namePrompt:name,featurePrompt:feature));
  }
  String _audit(dynamic value,String source) {
    if(value is! Map||value['segments'] is! List)throw const FormatException('模板结果缺少有效段落');
    final segments=value['segments'] as List;
    if(segments.isEmpty||segments.length>23)throw const FormatException('模板段落数量无效');
    var total=0,tags=0;final texts=<String>[];
    for(var index=0;index<segments.length;index++) {
      final segment=segments[index];
      if(segment is! Map||segment['units'] is! List||(segment['units'] as List).isEmpty)throw const FormatException('模板段落没有有效单元');
      final seen=<String>{},exactSeen=<String>{},units=<String>[];var localNatural=0;
      for(final unit in segment['units']) {
        if(unit is! Map||!['tag','natural'].contains(unit['kind'])||unit['text'] is! String||(unit['text'] as String).trim().isEmpty)throw const FormatException('单元需要 kind 与非空 text');
        // Remove redundant units, not facts. Preserve differing weights and
        // character segments; recount unique units against the same contract.
        final exact='${unit['kind']}\n${(unit['text'] as String).trim().toLowerCase().replaceAll('_',' ').replaceAll(RegExp(r'\s+'),' ')}';
        if(!exactSeen.add(exact))continue;
        final text=(unit['text'] as String).trim(),plain=text.toLowerCase().replaceAll('_',' ').replaceAll(RegExp(r'\d+(?:\.\d+)?::|::'),'').replaceAll(RegExp(r'\s+'),' ').trim();
        final syntax=text.replaceAll(RegExp(r'"[^"\r\n]*"|「[^」\r\n]*」'),'"text"').replaceAll(RegExp(r'^Text:\s*[^|\r\n]*$',caseSensitive:false),'Text: text');
        if(RegExp(r'[,，|\r\n\u4e00-\u9fff]').hasMatch(syntax))throw const FormatException('每项必须为一个英文有效单元');
        if(!seen.add(plain))throw FormatException('重复单元：$text');
        if(!allowStyleTags&&RegExp(r'artist:|\b(?:masterpiece|best quality|amazing quality|very aesthetic)\b').hasMatch(plain))throw const FormatException('模板不允许画师或质量词');
        if(unit['kind']=='tag') {
          tags++;
          if(RegExp(r'\b(?:her|his|their|she|he|they|which|while|beneath|behind her|in front of|with (?:one|both|her|his)|on (?:her|his|the))\b').hasMatch(plain)||plain.split(' ').length>6)throw const FormatException('自然短语被标为 Tag');
        }else {
          localNatural++;
          if(plain.split(' ').length<4&&!RegExp(r'^(?:on the (?:left|right)|in the (?:middle|center))$').hasMatch(plain))throw const FormatException('短 Tag 被标为自然语言');
        }
        units.add(text);total++;
      }
      if(segments.length>1&&index>0&&(!RegExp(r'^(girl|boy|other)\b',caseSensitive:false).hasMatch(units.first)||localNatural==0))throw const FormatException('角色段需要类别和关系短语');
      texts.add(units.join(', '));
    }
    if(total<min||total>max)throw FormatException('有效单元 $total，要求 $min–$max');
    if(tags/total<.65||tags/total>.75)throw FormatException('Tag $tags/$total，应为65–75%');
    final prompt=texts.join(' | '),normalized=prompt.toLowerCase().replaceAll('_',' ');
    validateExplicitPromptFacts(source,normalized,texts.length);
    if((normalized.contains('upper body')&&normalized.contains('full body'))||(normalized.contains('from above')&&normalized.contains('from below')))throw const FormatException('镜头要求互斥');
    if(texts.length>1) {
      final count=RegExp(r'\b(\d+)(?:girls?|boys?|others?)\b').allMatches(texts.first).fold(0,(n,m)=>n+int.parse(m[1]!));
      if(count!=texts.length-1)throw const FormatException('base 人数必须等于角色段数量');
    }
    return prompt;
  }
}

/// Deliberately bounded parity with desktop; not a proof of image semantics.
void validateExplicitPromptFacts(String source,String normalized,int segments) {
 bool has(String pattern,String text)=>RegExp(pattern,caseSensitive:false).hasMatch(text);
 String latest(String pattern)=>RegExp(pattern,caseSensitive:false).allMatches(source).lastOrNull?.group(0)??'';
 if(segments==1) {
  const colors={'白':['white'],'银':['silver'],'银白':['silver','white'],'黑':['black'],'红':['red'],'蓝':['blue'],'金':['blonde','blond'],'紫':['purple'],'棕':['brown']};
  for(final part in ['hair','eyes']) {
   final pattern=part=='hair'?r'(银白|白|银|黑|红|蓝|金|紫|棕)(?:色)?(?:长|短)?发|\b(white|silver|black|red|blue|blonde|purple|brown) hair\b':r'(白|银|黑|红|蓝|金|紫|棕)(?:色)?(?:眼睛|眼|瞳)|\b(white|silver|black|red|blue|golden|purple|brown) eyes\b';
   final match=RegExp(pattern,caseSensitive:false).allMatches(source).lastOrNull;
   if(match!=null) {
    final allowed=colors[match.group(1)]??[match.group(2)!.toLowerCase()];
    final actual=RegExp(r'\b(white|silver|black|red|blue|blonde|blond|golden|purple|brown) '+part+r'\b').allMatches(normalized).map((m)=>m.group(1)!);
    if(!actual.any(allowed.contains)||actual.any((x)=>!allowed.contains(x)))throw FormatException('用户指定 ${allowed.join('/')} $part，不可遗漏或替换');
   }
  }
 }
 if(has(r'单人|一位|一个(?:女孩|少女|女性)|\bsolo\b',source)&&(!has(r'\b1girl\b|\b1boy\b|\b1other\b',normalized)||has(r'\b[2-9](?:girls|boys|others)\b',normalized)||segments>1))throw const FormatException('保留用户指定的单人数量');
 final time=latest(r'雨夜|雨天|傍晚|黄昏|日落|夕阳|白天|清晨|黎明|rainy night|sunset|daytime');
 if(has(r'^(?:雨夜|rainy night)$',time)&&(!has(r'\brain\b|\brainy\b',normalized)||!has(r'\bnight\b',normalized)||has(r'\bdaytime\b|\bsunset\b',normalized)))throw const FormatException('保留雨夜，不替换成白天或日落');
 if(has(r'透明.*(?:伞)|transparent umbrella',source)&&!has(r'\btransparent umbrella\b',normalized))throw const FormatException('保留透明雨伞');
 final camera=latest(r'俯视(?:机位|视角|镜头)|仰视(?:机位|视角|镜头)|平视(?:机位|视角|镜头)|from above|from below|eye level');
 if(has(r'俯视|from above',camera)&&(!has(r'\bfrom above\b',normalized)||has(r'\bfrom below\b|\blow angle\b',normalized)))throw const FormatException('保留俯视机位 from above，不混入仰视机位');
 final framing=latest(r'全身|上半身|半身|特写|full body|upper body|close.up');
 if(has(r'全身|full body',framing)&&(!has(r'\bfull body\b',normalized)||has(r'\bupper body\b',normalized)))throw const FormatException('保留全身构图，不替换成上半身');
 if(has(r'上半身|半身|upper body',framing)) {
  if(!has(r'\bupper body\b',normalized)||has(r'\bfull body\b',normalized))throw const FormatException('保留上半身构图 upper body，不替换成全身');
  if(!has(r'脚|鞋|靴|腿|膝|\b(?:feet|shoes|boots|legs|knees)\b',source)&&has(r'\b(?:both feet|her feet|his feet|long legs|full figure|head to toe|knees visible|shoes|boots|footwear|sandals|sneakers|high heels)\b',normalized))throw const FormatException('上半身构图不应补入展示双脚、鞋靴或全身的提示');
 }
}
