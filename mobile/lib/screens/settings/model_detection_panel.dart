import 'dart:async';
import 'package:flutter/material.dart';

import '../../i18n/app_locales.dart';
import '../../services/model_list_error.dart';

/// Keeps the request and feedback in the same settings section. Never writes
/// secrets or raw server/exception messages to diagnostics or UI.
class ModelDetectionPanel extends StatefulWidget {
  const ModelDetectionPanel(
      {super.key,
      required this.language,
      required this.url,
      required this.keyController,
      required this.keyField,
      required this.modelField,
      required this.fetch});
  final String language, url;
  final TextEditingController keyController;
  final Widget keyField;
  final Widget Function(List<String> models) modelField;
  final Future<List<String>> Function(String url, String key) fetch;

  @override
  State<ModelDetectionPanel> createState() => _ModelDetectionPanelState();
}

enum _Result {
  idle,
  busy,
  found,
  empty,
  config,
  timeout,
  auth,
  http,
  invalidList,
  network
}

class _ModelDetectionPanelState extends State<ModelDetectionPanel> {
  var _result = _Result.idle;
  var _models = <String>[];
  int _serial = 0, _status = 0;
  late String _observedKey;
  @override
  void initState() {
    super.initState();
    _observedKey = widget.keyController.text;
    widget.keyController.addListener(_keyChanged);
  }

  void _reset() {
    _serial++;
    _result = _Result.idle;
    _models = [];
  }

  void _keyChanged() {
    if (_observedKey == widget.keyController.text) return;
    _observedKey = widget.keyController.text;
    setState(_reset);
  }

  @override
  void didUpdateWidget(covariant ModelDetectionPanel old) {
    super.didUpdateWidget(old);
    if (old.keyController != widget.keyController) {
      old.keyController.removeListener(_keyChanged);
      _observedKey = widget.keyController.text;
      widget.keyController.addListener(_keyChanged);
      _reset();
    }
    if (old.url.trim() != widget.url.trim()) _reset();
  }

  @override
  void dispose() {
    widget.keyController.removeListener(_keyChanged);
    super.dispose();
  }

  Future<void> _detect() async {
    if (_result == _Result.busy) return;
    final id = ++_serial;
    final url = widget.url.trim(), key = widget.keyController.text.trim();
    final uri = Uri.tryParse(url);
    if (key.isEmpty ||
        uri == null ||
        uri.host.isEmpty ||
        !['https', 'http'].contains(uri.scheme)) {
      setState(() {
        _result = _Result.config;
        _models = [];
      });
      return;
    }
    setState(() {
      _result = _Result.busy;
      _models = [];
    });
    List<String> values = [];
    var result = _Result.network, status = 0;
    try {
      values = await widget.fetch(url, key);
      result = values.isEmpty ? _Result.empty : _Result.found;
    } on TimeoutException {
      result = _Result.timeout;
    } on ModelListFormatError {
      result = _Result.invalidList;
    } on ModelListHttpError catch (e) {
      status = e.status;
      result = (status == 401 || status == 403) ? _Result.auth : _Result.http;
    } catch (_) {
      result = _Result.network;
    }
    if (!mounted || id != _serial) return;
    setState(() {
      _models = values;
      _result = result;
      _status = status;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = settingsDetailTextFor(widget.language);
    final code = widget.language.toLowerCase();
    final i = code.startsWith('en')
        ? 2
        : code.startsWith('ja')
            ? 3
            : code.startsWith('ko')
                ? 4
                : (code.contains('tw') || code.contains('hant'))
                    ? 1
                    : 0;
    String tr(List<String> options) => options[i];
    final busy = _result == _Result.busy;
    final message = switch (_result) {
      _Result.busy =>
        tr(['正在检测模型…', '正在偵測模型…', 'Checking models…', 'モデルを検出中…', '모델 확인 중…']),
      _Result.config => tr([
          '请填写有效的 API 地址和 Key。',
          '請填寫有效的 API 位址與 Key。',
          'Enter a valid API URL and key.',
          '有効な API URL とキーを入力してください。',
          '올바른 API 주소와 키를 입력하세요.'
        ]),
      _Result.timeout => tr([
          '检测超时（20 秒）。请检查 API 地址、网络或 AI 代理，然后重试。',
          '偵測逾時（20 秒）。請檢查 API 位址、網路或 AI 代理後重試。',
          'Timed out after 20 seconds. Check the URL, network or AI proxy, then retry.',
          '20 秒でタイムアウトしました。URL、ネットワーク、AI プロキシを確認して再試行してください。',
          '20초 후 시간 초과. 주소, 네트워크 또는 AI 프록시를 확인하고 다시 시도하세요.'
        ]),
      _Result.auth => '${tr([
              '服务拒绝访问，请检查 API Key 和权限。',
              '服務拒絕存取，請檢查 API Key 與權限。',
              'Access denied. Check the API key and permissions.',
              'アクセス拒否。API キーと権限を確認してください。',
              '접근 거부. API 키와 권한을 확인하세요.'
            ])} (HTTP $_status)',
      _Result.http => '${t.connectionFailed} (HTTP $_status)',
      _Result.invalidList => tr([
          '已连接服务，但返回内容不是可用的模型列表。请核对 API 地址。',
          '已連接服務，但傳回內容不是可用的模型清單。請核對 API 位址。',
          'Connected, but the response is not a model list. Check the API URL.',
          '接続しましたが、モデル一覧を読み取れません。API URL を確認してください。',
          '연결되었지만 모델 목록 형식이 아닙니다. API 주소를 확인하세요.'
        ]),
      _Result.network => tr([
          '无法读取模型列表，请检查 API 地址、网络和服务是否支持模型列表。',
          '無法讀取模型清單，請檢查 API 位址、網路與服務支援。',
          'Cannot read the model list. Check the URL, connection and provider support.',
          '一覧を取得できません。URL、接続、サービスの対応状況を確認してください。',
          '목록을 읽을 수 없습니다. 주소, 연결 및 서비스 지원을 확인하세요.'
        ]),
      _Result.empty => t.noModelList,
      _Result.found => tr([
          '已检测到 ${_models.length} 个模型，可在上方模型栏选择。',
          '已偵測到 ${_models.length} 個模型，可在上方模型欄選取。',
          'Found ${_models.length} models. Select one in the model field above.',
          '${_models.length} 件のモデルを検出しました。上の欄から選択できます。',
          '모델 ${_models.length}개를 찾았습니다. 위 필드에서 선택하세요.'
        ]),
      _Result.idle => '',
    };
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      widget.modelField(_models),
      widget.keyField,
      const SizedBox(height: 8),
      OutlinedButton(
          onPressed: busy ? null : _detect,
          child: Text(busy ? message : t.detectModel)),
      if (message.isNotEmpty && !busy)
        Semantics(
            liveRegion: true,
            child: Padding(
                padding: const EdgeInsets.only(top: 8), child: Text(message))),
    ]);
  }
}
