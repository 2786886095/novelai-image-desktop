import 'dart:convert';
import 'prompt_mode.dart';
import '../models/nai_models.dart';

// Bounded syntactic/countable-unit checks, not proof of image truth, fact
// provenance, a complete English grammar, or the NovelAI tokenizer budget.
const promptSkillV2Runtime = '''技能版本 2.0.0 运行时边界：使用上文独立完整模板，不从混合派生其他模式。附件中的合成正例只是格式示范，不是本次图片或输入的事实，禁止套用示例补内容。
本次普通模型调用没有可用的外部检索/世界书工具。按模板的无工具分支保守表达；不能声称已检索、已核实词条或伪造工具日志。正文规则不会授予工具、文件、网络、生图或发布权限。
只忠实转换明确输入或反推实际可见证据，不默认扩写场景、人物、服装、表情或道具。事实不足时返回模板规定的“信息不足：”；纯Tag无法无损表达关系时可返回“模式能力不足：”。不要为计数或比例编造，不因程序反馈凑数。单次生成最终单行prompt，不输出内部JSON单元、解释、计数、Markdown或思考过程。
自然语言按有依据的独立视觉事实计数，不是50句话或50个逗号片段；软件只能进行基本格式检查，不能证明视觉事实真实性。''';
String promptSkillV2KnownInstruction(bool known) => known ? '用户保留了网络角色双版本选项。仅把两个完整的所选模式prompt封装为JSON字符串字段 {"namePrompt":"...","featurePrompt":"..."}；不返回segments/units。namePrompt仅在身份有依据时保留准确角色名，featurePrompt用可见稳定特征表达同一人物；不得猜身份、增加画师、质量词、未见事实。两项各自遵循所选模板；任一信息不足则直接报告模板规定失败，不能以另一个版本冒充。' : '';
String? promptSkillControlledFailure(String raw) => RegExp(r'^(?:信息不足|模式能力不足)\s*[:：]').hasMatch(raw.trim()) ? raw.trim() : null;
({String text,bool excluded}) _unweight(String value) {
 final m=RegExp(r'^(-?\d+(?:\.\d+)?)::\s*([\s\S]*?)\s*::$').firstMatch(value.trim());
 return (text:(m?.group(2)??value).trim(),excluded:m!=null&&double.parse(m[1]!)<=0);
}
List<String> _splitOutside(String value,String delimiter) {
 final out=<String>[];var start=0,quoted=false,escaped=false,weight=false;
 for(var i=0;i<value.length;i++){
  final c=value[i];if(escaped){escaped=false;continue;}if(c==r'\'){escaped=true;continue;}
  if(c=='"'){quoted=!quoted;continue;}
  if(!quoted&&c==':'&&i+1<value.length&&value[i+1]==':'){weight=!weight;i++;continue;}
  if(!quoted&&!weight&&c==delimiter){out.add(value.substring(start,i).trim());start=i+1;}
 }
 if(quoted||weight)throw const FormatException('技能2.0.0提示词引号或权重没有闭合');
 out.add(value.substring(start).trim());return out;
}
bool _control(String value){
 final v=_unweight(value);return v.excluded||RegExp(r'^(?:\d+(?:girls?|boys?|others?)|girl|boy|other|no humans|(?:fur|background) dataset|text|(?:[A-Za-z-]+\s+)?text|Text\s*:[\s\S]*|(?:source|target|mutual)#[\s\S]+)$',caseSensitive:false).hasMatch(v.text);
}
final _finite=RegExp(r'\b(?:is|are|was|were|has|have|holds?|rests?|sits?|stands?|lies?|lie|shows?|wears?|looks?|faces?|touches?|reaches?|supports?|covers?|hides?|obscures?|casts?|lights?|hangs?|extends?|leans?|points?|grips?|keeps?|runs?|falls?|frames?|appears?|remains?|opens?|closes?|reads?|contains?|displays?|stops?|bends?|surrounds?|crosses?|illuminates?|enters?|shines?|flows?|occupies?|connects?|passes?|receives?)\b',caseSensitive:false);
bool _naturalStart(String value){final text=_unweight(value).text;return RegExp(r'^[A-Z]').hasMatch(text)&&_finite.hasMatch(text);}
bool _sentenceLike(String value){final text=_unweight(value).text;return _naturalStart(text)&&RegExp(r'''[.!?](?:["']|\s)*$''').hasMatch(text);}
List<String> _sentences(String value)=>RegExp(r'''[^.!?]+(?:[.!?]+(?:["']|\s)*|$)''').allMatches(value).map((m)=>m[0]!.trim()).where((x)=>x.isNotEmpty).toList();
int _words(String text)=>RegExp(r"[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*").allMatches(text).length;
class PromptSkillV2Audit {
 final String prompt,scope;
 final List<String> warnings;
 final int? effectiveUnits,tagWords,naturalWords;
 final double? tagPercent;
 const PromptSkillV2Audit(this.prompt,this.scope,this.warnings,{this.effectiveUnits,this.tagWords,this.naturalWords,this.tagPercent});
}
PromptSkillV2Audit auditPromptSkillV2(String prompt,ReversePromptMode mode){
 final literal=prompt.trim(),failure=promptSkillControlledFailure(prompt);if(failure!=null)throw FormatException(failure);
 if(literal.isEmpty||literal.length>60000)throw const FormatException('技能2.0.0提示词为空或超过软件安全长度');
 if(RegExp(r'[\r\n]|^```|^#{1,6}\s|^\s*[\[{]').hasMatch(literal))throw const FormatException('技能2.0.0要求单行prompt，不是Markdown或内部JSON');
 final visible=literal.replaceAll(RegExp(r'\bText\s*:\s*"(?:\\.|[^"\\])*"',caseSensitive:false),'Text: ""');
 if(RegExp(r'[\u3400-\u9fff\u3040-\u30ff]').hasMatch(visible))throw const FormatException('技能2.0.0仅Text载荷允许非英文文字');
 if(RegExp(r'artist\s*:|\b(?:masterpiece|best quality|amazing quality|very aesthetic)\b',caseSensitive:false).hasMatch(visible))throw const FormatException('技能2.0.0模板不输出画师或质量词');
 for(final m in RegExp(r'\bText\s*:\s*"((?:\\.|[^"\\])*)"',caseSensitive:false).allMatches(literal)){if(m[1]!.replaceAll(r'\n','\n').runes.length>750)throw const FormatException('Text载荷超过750字符');}
 final segments=_splitOutside(literal,'|');if(segments.any((x)=>x.isEmpty)||segments.length>23)throw const FormatException('技能2.0.0角色段为空或超过22人');
 var effective=0,tagWords=0,naturalWords=0;final anchors=<String,Set<String>>{};
 for(var index=0;index<segments.length;index++){
  final segment=segments[index],chunks=_splitOutside(segment,',');var naturalParts=<String>[],localNatural=0;final seen=<String>{};
  final textIndex=chunks.indexWhere((x)=>RegExp(r'^Text\s*:',caseSensitive:false).hasMatch(_unweight(x).text));
  if(textIndex>=0&&(index!=0||textIndex!=chunks.length-1))throw const FormatException('技能2.0.0的Text载荷必须位于base最后');
  if(textIndex>=0&&!RegExp(r'^Text\s*:\s*"(?:\\.|[^"\\])*"$',caseSensitive:false).hasMatch(_unweight(chunks[textIndex]).text))throw const FormatException('技能2.0.0的Text载荷必须使用完整双引号');
  void countNatural(){
   if(naturalParts.isEmpty)return;final text=naturalParts.join(', ');naturalParts=[];
   for(final sentence in _sentences(text)){
    if(!_sentenceLike(sentence))throw const FormatException('技能2.0.0自然语言应为完整英文句，而不是Tag或悬空短语');
    final key='natural\n${sentence.toLowerCase().replaceAll(RegExp(r'\s+'),' ')}';
    if(!seen.add(key))throw const FormatException('技能2.0.0有重复自然语言句');
    if(mode!=ReversePromptMode.natural){effective++;naturalWords+=_words(sentence);}localNatural++;
   }
  }
  for(final chunk in chunks){
   if(chunk.isEmpty)throw const FormatException('技能2.0.0存在空Tag/句子');final plain=_unweight(chunk).text;
   if(_control(chunk)){
    countNatural();final a=RegExp(r'^(source|target|mutual)#(.+)$',caseSensitive:false).firstMatch(plain);
    if(a!=null){(anchors[a[2]!]??=<String>{}).add('${a[1]!.toLowerCase()}:$index');}continue;
   }
   if(mode==ReversePromptMode.natural||naturalParts.isNotEmpty||_naturalStart(chunk)){
    if(mode==ReversePromptMode.tags)throw const FormatException('技能2.0.0纯Tag模式不能包含完整自然语言句');naturalParts.add(chunk);continue;
   }
   if(RegExp(r'[.!?]$').hasMatch(plain))throw const FormatException('技能2.0.0不把Tag加句号伪装为自然语言');
   if(mode==ReversePromptMode.mixed&&localNatural>0)throw const FormatException('技能2.0.0每段先Tag后关系句');
   final key='tag\n${plain.toLowerCase().replaceAll('_',' ').replaceAll(RegExp(r'\s+'),' ')}';
   if(!seen.add(key))throw const FormatException('技能2.0.0有重复Tag');effective++;tagWords+=_words(plain);
  }
  countNatural();
  if(mode==ReversePromptMode.mixed&&localNatural<(segments.length==1?2:index==0?0:1))throw const FormatException('技能2.0.0混合模式需要完整关系句（简单图至少2句、每个角色至少1句）');
  if(segments.length>1&&index>0&&mode!=ReversePromptMode.natural&&!RegExp(r'^(?:girl|boy|other)(?:\s*,|$)',caseSensitive:false).hasMatch(segment))throw const FormatException('技能2.0.0角色段以girl/boy/other开头');
  if(mode==ReversePromptMode.natural&&localNatural==0)throw const FormatException('技能2.0.0自然语言段没有完整句');
 }
 if(segments.length>1&&mode!=ReversePromptMode.natural){
  final people=_splitOutside(segments.first,',').fold<int>(0,(n,chunk){final v=_unweight(chunk),m=RegExp(r'^(\d+)(?:girls?|boys?|others?)$',caseSensitive:false).firstMatch(_unweight(chunk).text);return n+(!v.excluded&&m!=null?int.parse(m[1]!):0);});
  if(people!=segments.length-1)throw const FormatException('技能2.0.0base人数应等于角色段数');
 }
 for(final entry in anchors.entries){final source=entry.value.any((x)=>x.startsWith('source:')),target=entry.value.any((x)=>x.startsWith('target:')),mutual=entry.value.where((x)=>x.startsWith('mutual:')).length;
  final sources=entry.value.where((x)=>x.startsWith('source:')).map((x)=>x.split(':')[1]).toSet(),targets=entry.value.where((x)=>x.startsWith('target:')).map((x)=>x.split(':')[1]).toSet();
  if(source!=target||(source&&sources.containsAll(targets)&&targets.containsAll(sources))||(mutual>0&&mutual<2))throw FormatException('技能2.0.0互动锚点没有配对：${entry.key}');
 }
 if(mode!=ReversePromptMode.natural&&effective<50)throw FormatException('技能2.0.0有效单元$effective，至少需要50；不为凑数编造，请补充证据或细节');
 final tagPercent=tagWords/((tagWords+naturalWords)>0?(tagWords+naturalWords):1)*100;
 if(mode==ReversePromptMode.mixed&&(tagPercent<65||tagPercent>75))throw FormatException('技能2.0.0混合Tag英文词占比${tagPercent.toStringAsFixed(2)}%，要求65–75%（不是单元比例）');
 final warnings=[mode==ReversePromptMode.natural?'仅完成自然语言基本格式检查；至少50项来源事实与准确性仍需人工复核。':'仅检查格式与可计数单元；事实真实性、同义概念及来源仍需人工复核。'];
 return mode==ReversePromptMode.natural?PromptSkillV2Audit(literal,'format-only',warnings):PromptSkillV2Audit(literal,'format-and-countable-units',warnings,effectiveUnits:effective,tagWords:tagWords,naturalWords:naturalWords,tagPercent:tagPercent);
}
({String prompt,PromptVariants? variants,List<String> warnings}) parsePromptSkillV2Response(String raw,ReversePromptMode mode,{bool knownCharacter=false}){
 final failure=promptSkillControlledFailure(raw);if(failure!=null)throw FormatException(failure);
 if(!knownCharacter){final a=auditPromptSkillV2(raw,mode);return(prompt:a.prompt,variants:null,warnings:a.warnings);}
 var text=raw.trim();if(text.startsWith('```')){final f=RegExp(r'^```(?:json)?\s*([\s\S]*?)\s*```$',caseSensitive:false).firstMatch(text);if(f==null)throw const FormatException('技能2.0.0双版本JSON围栏必须完整');text=f[1]!;}
 dynamic value;try{value=jsonDecode(text);}catch(_){throw const FormatException('技能2.0.0双版本需要完整JSON字符串字段namePrompt/featurePrompt');}
 if(value is! Map||value['namePrompt'] is! String||value['featurePrompt'] is! String)throw const FormatException('技能2.0.0双版本需要namePrompt/featurePrompt字符串');
 for(final part in [value['namePrompt'],value['featurePrompt']]){final failure=promptSkillControlledFailure(part);if(failure!=null)throw FormatException(failure);}
 final a=auditPromptSkillV2(value['namePrompt'],mode),b=auditPromptSkillV2(value['featurePrompt'],mode);
 return(prompt:a.prompt,variants:PromptVariants(namePrompt:a.prompt,featurePrompt:b.prompt),warnings:{...a.warnings,...b.warnings}.toList());
}
