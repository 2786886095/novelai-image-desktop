/// Offline catalog; stable IDs and original font bytes match desktop.
class BuiltinUiFont {
  final String id,name,english,style,englishStyle,file;
  const BuiltinUiFont(this.id,this.name,this.english,this.style,this.englishStyle,this.file);
  String label(String language)=>language.startsWith('zh')?'$name · $style':'$english · $englishStyle';
}
const builtinUiFonts=<BuiltinUiFont>[
  BuiltinUiFont("builtin-wenkai","霞鹜文楷 轻便版","LXGW WenKai Lite","文雅楷书","Elegant Kai","LXGWWenKaiLite-Regular.ttf"),
  BuiltinUiFont("builtin-xiaolai","小赖字体","Xiaolai","圆润手写","Rounded handwriting","Xiaolai-Regular.ttf"),
  BuiltinUiFont("builtin-yozai","悠哉字体","Yozai","随性手写","Casual handwriting","Yozai-Regular.ttf"),
  BuiltinUiFont("builtin-marker","霞鹜漫黑","LXGW Marker Gothic","漫画马克笔","Comic marker","LXGWMarkerGothic-Regular.ttf"),
  BuiltinUiFont("builtin-smiley","得意黑","Smiley Sans","倾斜美术黑体","Slanted display","SmileySans-Oblique.ttf"),
  BuiltinUiFont("builtin-source-serif","思源宋体 CN","Source Han Serif CN","文艺宋体","Literary serif","SourceHanSerifCN-Regular.otf"),
 ];
BuiltinUiFont? builtinUiFont(String id) {
  for(final font in builtinUiFonts){if(font.id==id)return font;}return null;
}
String builtinUiFontHint(String language)=>switch(language){
 'zh-TW'=>'內建風格字型可離線使用，不佔匯入名額；缺字使用系統字型。得意黑偏美術風格，長篇閱讀建議文楷或宋體。',
 'en-US'=>'Bundled style fonts work offline and do not use import slots. Missing glyphs use system fallback. Smiley Sans is a display face; WenKai or Source Han Serif is easier for long reading.',
 'ja-JP'=>'内蔵フォントはオフラインで使用でき、インポート枠を消費しません。未収録文字はシステムフォントで表示します。Smiley Sans は装飾的なので、長文には WenKai または Source Han Serif をおすすめします。',
 'ko-KR'=>'내장 글꼴은 오프라인으로 사용하며 가져오기 슬롯을 쓰지 않습니다. 없는 문자는 시스템 글꼴로 표시됩니다. Smiley Sans는 장식용이며 긴 글에는 WenKai 또는 Source Han Serif가 편합니다.',
 _=>'内置风格字体可离线使用，不占导入名额；缺字使用系统字体。得意黑偏美术风格，长篇阅读建议文楷或宋体。',
};
