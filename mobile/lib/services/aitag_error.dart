class AitagFailure implements Exception {
  final String code;
  const AitagFailure(this.code);
  @override
  String toString() => 'AITAG_$code';
}

String formatAitagFailure(Object? error, String language) {
  const messages = <String, List<String>>{
    "zh-CN": [
      "AITag 网站防护拒绝了软件请求（HTTP 403）。官网网页与接口的访问结果可能不同；请稍后重试，或打开官网查看。",
      "AITag 接口拒绝访问（HTTP {status}）。请打开官网确认访问状态。",
      "AITag 请求过于频繁（HTTP 429），请稍后重试。",
      "AITag 服务暂时异常（HTTP {status}），请稍后重试。",
      "AITag 返回的不是有效图库数据，可能是接口变更或验证页面。",
      "AITag 请求超时，请稍后重试并检查软件代理设置。",
      "AITag 连接失败，请检查软件代理或网络设置。",
      "读取 AITag 数据失败，请稍后重试。"
    ],
    "zh-TW": [
      "AITag 網站防護拒絕了軟體請求（HTTP 403）。官網網頁與介面的存取結果可能不同；請稍後重試或開啟官網查看。",
      "AITag 介面拒絕存取（HTTP {status}）。請開啟官網確認存取狀態。",
      "AITag 請求過於頻繁（HTTP 429），請稍後重試。",
      "AITag 服務暫時異常（HTTP {status}），請稍後重試。",
      "AITag 傳回的不是有效圖庫資料，可能是介面變更或驗證頁面。",
      "AITag 請求逾時，請稍後重試並檢查軟體代理設定。",
      "AITag 連線失敗，請檢查軟體代理或網路設定。",
      "讀取 AITag 資料失敗，請稍後重試。"
    ],
    "en-US": [
      "AITag website protection rejected the app request (HTTP 403). The website and API may have different access results. Try later or open the website.",
      "AITag denied access (HTTP {status}). Open the website to check access.",
      "AITag rate limit reached (HTTP 429). Try again later.",
      "AITag is temporarily unavailable (HTTP {status}). Try again later.",
      "AITag returned invalid gallery data, possibly an API change or verification page.",
      "AITag request timed out. Try later and check the app proxy settings.",
      "AITag connection failed. Check the app proxy or network settings.",
      "Failed to read AITag data. Try again later."
    ],
    "ja-JP": [
      "AITag のサイト保護がアプリのリクエストを拒否しました（HTTP 403）。公式サイトと API のアクセス結果は異なる場合があります。時間を置くか公式サイトで確認してください。",
      "AITag がアクセスを拒否しました（HTTP {status}）。公式サイトで確認してください。",
      "AITag のリクエストが多すぎます（HTTP 429）。時間を置いて再試行してください。",
      "AITag サービスで一時的なエラーが発生しました（HTTP {status}）。",
      "AITag の応答が有効なギャラリーデータではありません。API 変更または認証ページの可能性があります。",
      "AITag の応答がタイムアウトしました。アプリのプロキシ設定を確認してください。",
      "AITag に接続できません。アプリのプロキシまたはネットワーク設定を確認してください。",
      "AITag の読み込みに失敗しました。時間を置いて再試行してください。"
    ],
    "ko-KR": [
      "AITag 사이트 보호가 앱 요청을 거부했습니다(HTTP 403). 웹사이트와 API의 접근 결과는 다를 수 있습니다. 나중에 재시도하거나 공식 사이트를 확인하세요.",
      "AITag 접근이 거부되었습니다(HTTP {status}). 공식 사이트에서 확인하세요.",
      "AITag 요청이 너무 많습니다(HTTP 429). 나중에 재시도하세요.",
      "AITag 서비스에 일시적인 오류가 있습니다(HTTP {status}).",
      "AITag 응답이 올바른 갤러리 데이터가 아닙니다. API 변경이나 인증 페이지일 수 있습니다.",
      "AITag 요청 시간이 초과되었습니다. 앱 프록시 설정을 확인하세요.",
      "AITag 연결에 실패했습니다. 앱 프록시 또는 네트워크 설정을 확인하세요.",
      "AITag 데이터를 읽지 못했습니다. 나중에 재시도하세요."
    ]
  };
  final code =
      RegExp(r'AITAG_(BLOCKED_403|HTTP_\d{3}|INVALID_RESPONSE|TIMEOUT|NETWORK)')
              .firstMatch('$error')
              ?.group(1) ??
          '';
  final status = RegExp(r'HTTP_(\d{3})').firstMatch(code)?.group(1) ?? '';
  final text = messages[language] ?? messages['en-US']!;
  final index = code == 'BLOCKED_403'
      ? 0
      : status == '429'
          ? 2
          : status.isNotEmpty
              ? ((int.tryParse(status) ?? 0) >= 500 ? 3 : 1)
              : code == 'INVALID_RESPONSE'
                  ? 4
                  : code == 'TIMEOUT'
                      ? 5
                      : code == 'NETWORK'
                          ? 6
                          : 7;
  return text[index].replaceAll('{status}', status);
}
