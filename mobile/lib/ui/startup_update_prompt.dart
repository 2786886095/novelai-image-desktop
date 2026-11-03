import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/update_prompt_gate.dart';
import '../state/app_state.dart';
import '../screens/ios_update_card.dart';
import '../i18n/ios_update_text.dart';

class StartupUpdatePrompt extends StatefulWidget {
  final Widget child;
  final bool ready;
  const StartupUpdatePrompt({super.key, required this.child, this.ready=true});
  @override State<StartupUpdatePrompt> createState()=>_StartupUpdatePromptState();
}
class _StartupUpdatePromptState extends State<StartupUpdatePrompt> {
  final gate=UpdatePromptGate();
  bool scheduled=false;
  @override Widget build(BuildContext context){
    final app=context.watch<AppState>();
    if(widget.ready && app.booted && !app.updateTaskBusy && app.updateInfo?.hasUpdate==true && !scheduled &&
        (ModalRoute.of(context)?.isCurrent ?? true)) {
      scheduled=true;
      WidgetsBinding.instance.addPostFrameCallback((_)=>unawaited(_offer()));
    }
    return widget.child;
  }
  Future<void> _offer() async {
    try {
      final app=context.read<AppState>(), info=app.updateInfo;
      if (!mounted || !widget.ready || app.updateTaskBusy || !(ModalRoute.of(context)?.isCurrent ?? true)) return;
      final claimed = await gate.claim(info);
      if (!mounted || !claimed) return;
      final lang=app.settings.language;
      final words=switch(lang){
        'en-US'=>['New version available','Update','Download in browser','Cancel','This version will not be shown automatically again. You can check manually in Settings.','Could not open the browser. Please download from Settings.'],
        'zh-TW'=>['發現新版本','更新','瀏覽器下載','取消','同一版本不再自動提醒；可在設定手動檢查。','無法開啟瀏覽器，請到設定手動下載。'],
        'ja-JP'=>['新しいバージョンがあります','更新','ブラウザーでダウンロード','キャンセル','同じバージョンは再通知しません。設定から手動で確認できます。','ブラウザーを開けません。設定からダウンロードしてください。'],
        'ko-KR'=>['새 버전이 있습니다','업데이트','브라우저에서 다운로드','취소','같은 버전은 다시 자동 알림하지 않습니다. 설정에서 확인할 수 있습니다.','브라우저를 열 수 없습니다. 설정에서 다운로드하세요.'],
        _=>['发现新版本','更新','浏览器下载','取消','同一版本不再自动提醒；可在设置中手动检查更新。','无法打开浏览器，请到设置中手动下载。'],
      };
      final result=await showDialog<String>(context:context,barrierDismissible:false,builder:(c)=>AlertDialog(
        key:const ValueKey('startup-update-dialog'), title:Text('${words[0]} v${info!.latestVersion}'),
        content:SingleChildScrollView(child:Column(mainAxisSize:MainAxisSize.min,crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text('v${info.currentVersion} → v${info.latestVersion}'),const SizedBox(height:12),Text(words[4]),
          if(Theme.of(context).platform==TargetPlatform.iOS) Padding(padding:const EdgeInsets.only(top:12),child:Text(iosUpdateText(lang)[5])),
        ])), actions:[
          TextButton(key:const ValueKey('startup-update-cancel'),onPressed:()=>Navigator.pop(c,'cancel'),child:Text(words[3])),
          OutlinedButton(key:const ValueKey('startup-update-browser'),onPressed:()=>Navigator.pop(c,'browser'),child:Text(words[2])),
          FilledButton(key:const ValueKey('startup-update-install'),onPressed:()=>Navigator.pop(c,'update'),child:Text(words[1])),
        ]));
      if(!mounted)return;
      if(result=='browser') {
        bool ok=false;
        try { ok=await launchUrl(Uri.parse('https://github.com/2786886095/novelai-image-desktop/releases/latest'),mode:LaunchMode.externalApplication); }catch(_){}
        if(!ok && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(words[5])));
      } else if(result=='update') {
        if(app.updateTaskBusy) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text(switch(lang){
            'en-US'=>'A task is running. Update later from Settings.',
            'zh-TW'=>'任務執行中，請稍後到設定更新。',
            'ja-JP'=>'タスク実行中です。後で設定から更新してください。',
            'ko-KR'=>'작업 실행 중입니다. 나중에 설정에서 업데이트하세요.',
            _=>'任务执行中，请结束后在设置中更新。',
          })));
          return;
        }
        // A later check must not silently replace the version the user accepted.
        if(app.updateInfo?.latestVersion!=info?.latestVersion)return;
        if(Theme.of(context).platform==TargetPlatform.android){await app.installAppUpdate();}
        else if(Theme.of(context).platform==TargetPlatform.iOS && mounted){await showDialog<void>(context:context,builder:(c)=>AlertDialog(content:const SingleChildScrollView(child:IosUpdateCard()),actions:[TextButton(onPressed:()=>Navigator.pop(c),child:Text(words[3]))]));}
      }
    } finally { if(mounted) scheduled=false; }
  }
}
