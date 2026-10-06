typedef InpaintSize = ({int width, int height});

Map<String, String> inpaintSizeText(String language) {
  if (language.startsWith('zh-TW')) return {'title':'重繪尺寸','original':'原圖尺寸','custom':'自訂尺寸','width':'寬','height':'高','missing':'請先載入原圖。','rule':'寬高需為 64–1600 之間的 64 整數倍；不會自動修改尺寸。','output':'輸出尺寸'};
  if (language.startsWith('zh')) return {'title':'重绘尺寸','original':'原图尺寸','custom':'自定义尺寸','width':'宽','height':'高','missing':'请先加载原图。','rule':'宽高需为 64–1600 之间的 64 整数倍；不会自动修改尺寸。','output':'输出尺寸'};
  if (language.startsWith('ja')) return {'title':'再描画サイズ','original':'元画像のサイズ','custom':'カスタムサイズ','width':'幅','height':'高さ','missing':'元画像を読み込んでください。','rule':'幅と高さは 64～1600 の範囲で 64 の倍数にしてください。自動変更はしません。','output':'出力サイズ'};
  if (language.startsWith('ko')) return {'title':'인페인트 크기','original':'원본 이미지 크기','custom':'사용자 지정 크기','width':'너비','height':'높이','missing':'원본 이미지를 불러오세요.','rule':'너비와 높이는 64–1600 사이의 64 배수여야 합니다. 자동으로 변경하지 않습니다.','output':'출력 크기'};
  return {'title':'Inpaint size','original':'Original image size','custom':'Custom size','width':'Width','height':'Height','missing':'Load an original image first.','rule':'Width and height must be multiples of 64 between 64 and 1600; sizes are never changed automatically.','output':'Output size'};
}

InpaintSize resolveInpaintSize(String mode, InpaintSize custom, InpaintSize source, [String language = 'en-US']) {
  final size = mode == 'custom' ? custom : source;
  if ([size.width, size.height].any((v) => v < 64 || v > 1600 || v % 64 != 0)) {
    throw FormatException('${size.width}×${size.height}: ${inpaintSizeText(language)['rule']}');
  }
  return size;
}

({String mode, InpaintSize custom}) restoreInpaintSizeState(Map<String, dynamic> saved) {
  final raw = saved['inpaintCustomSize'];
  int dimension(dynamic v) => v is num && v.isFinite && v == v.round() && v >= 64 && v <= 1600 ? v.toInt() : 1024;
  return (mode: saved['inpaintSizeMode'] == 'custom' ? 'custom' : 'original',
    custom: (width: dimension(raw is Map ? raw['width'] : null), height: dimension(raw is Map ? raw['height'] : null)));
}
