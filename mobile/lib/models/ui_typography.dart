import 'builtin_ui_fonts.dart';
class UiTypography {
  final String font;
  final int scale;
  const UiTypography({this.font='default',this.scale=100});
  static bool isImported(String id)=>RegExp(r'^font-[a-f0-9]{64}$').hasMatch(id);
  factory UiTypography.fromJson(dynamic raw) {
    final map=raw is Map ? raw : const {};
    final f=map['font'];final n=map['scale'];
    return UiTypography(font:f is String && ((['default','sans','serif','mono'].contains(f)||builtinUiFont(f)!=null)||isImported(f))?f:'default',scale:n is num && n.isFinite?n.clamp(80,200).round():100);
  }
  Map<String,dynamic> toJson()=>{'font':font,'scale':scale};
  UiTypography copyWith({String? font,int? scale})=>UiTypography.fromJson({'font':font??this.font,'scale':scale??this.scale});
}
