import 'app_locales.dart';

/// Saved-image file format setting (PNG default, lossless WebP).
String imageFormatText(Object? language, String key) {
  const labels = {
    'en-US': [
      'Image file format',
      'Applies to future NovelAI generation saves. WebP losslessly encodes prepared 8-bit pixels; removing metadata first sanitizes pixel carriers. Higher-bit-depth PNGs stay PNG to preserve precision. File size depends on image content; the extension matches the actual format. Existing images are not converted.',
      'PNG (default)',
      'WebP (lossless)',
    ],
    'zh-CN': [
      '图片保存格式',
      '用于之后保存的 NovelAI 生成结果。WebP 对处理后的 8 位像素无损编码；关闭元数据时会先清理像素载荷。高位深 PNG 保留为 PNG 以免降低精度。体积取决于图片内容，扩展名与实际格式一致。已保存的图片不会转换。',
      'PNG（默认）',
      'WebP（无损）',
    ],
    'zh-TW': [
      '圖片儲存格式',
      '用於之後儲存的 NovelAI 生成結果。WebP 對處理後的 8 位元像素無損編碼；關閉中繼資料時會先清理像素載荷。高位元深度 PNG 保留為 PNG，以免降低精度。大小取決於圖片內容，副檔名與實際格式一致。已儲存的圖片不會轉換。',
      'PNG（預設）',
      'WebP（無損）',
    ],
    'ja-JP': [
      '画像の保存形式',
      '今後保存する NovelAI の生成結果に適用されます。WebP は処理後の 8 ビット画素を可逆圧縮します。メタデータを削除する場合は画素内のデータも先に除去します。高ビット深度の PNG は精度を保つため PNG のまま保存します。容量は画像の内容によって異なり、拡張子は実際の形式と一致します。保存済みの画像は変換しません。',
      'PNG（既定）',
      'WebP（可逆）',
    ],
    'ko-KR': [
      '이미지 저장 형식',
      '이후 저장되는 NovelAI 생성 결과에 적용됩니다. WebP는 처리된 8비트 픽셀을 무손실로 인코딩합니다. 메타데이터를 끄면 픽셀에 숨긴 데이터도 먼저 정리합니다. 높은 비트 심도의 PNG는 정밀도를 유지하도록 PNG로 저장합니다. 파일 크기는 이미지 내용에 따라 달라지며 확장자는 실제 형식과 일치합니다. 이미 저장된 이미지는 변환하지 않습니다.',
      'PNG(기본값)',
      'WebP(무손실)',
    ],
  };
  const keys = ['title', 'subtitle', 'png', 'webp'];
  final index = keys.indexOf(key);
  return index < 0 ? key : labels[normalizeAppLocaleCode(language)]![index];
}
