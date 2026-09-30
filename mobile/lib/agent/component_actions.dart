import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'agent_models.dart';

const componentActionCatalog = <String, Map<String, String>>{
  'component.status': {'title': '读取 Agent 组件和最近交接结果', 'effect': 'read'},
  'component.check': {'title': '查询兼容组件（仅元数据）', 'effect': 'read'},
  'component.install': {'title': '安装组件并保留对话', 'effect': 'confirm'},
  'component.update': {'title': '更新组件并保留对话', 'effect': 'confirm'},
  'component.reinstall': {'title': '重装组件并保留对话', 'effect': 'confirm'},
  'component.uninstall': {'title': '仅卸载组件，保留对话与资料', 'effect': 'confirm'},
};
typedef ComponentInvoke = Future<Map<String, dynamic>> Function(
    String name, Map<String, dynamic> args);
typedef ComponentApprove = Future<bool> Function(
    String session, Map<String, dynamic> summary);

/// The Flutter host owns this job, not the Agent process or its bridge.
/// Native commands return early: every command is polled to a terminal state.
class ComponentActions {
  final Directory root;
  final ComponentInvoke invoke;
  final ComponentApprove approve;
  final void Function()? changed;
  final Duration handoffTimeout, pollInterval, commandTimeout;
  Future<void>? _initializing, _work;
  bool busy = false, _cancelled = false, _awaitingApproval = false;
  Map<String, dynamic>? operation, _plan;
  DateTime? _checkedAt;
  String? _owner;
  Timer? _timer;
  ComponentActions({required this.root, required this.invoke,
    required this.approve, this.changed,
    this.handoffTimeout = const Duration(seconds: 30),
    this.pollInterval = const Duration(milliseconds: 150),
    // Native reads have their own inactivity timeout; allow a progressing
    // large download on a slow connection, while retaining a bounded lifetime.
    this.commandTimeout = const Duration(minutes: 60)});
  static bool handles(String tool, Map<String, dynamic> args) =>
      tool == 'langbai_software_action' && componentActionCatalog.containsKey(args['action']);
  static bool isRead(Map<String, dynamic> args) =>
      ['component.status', 'component.check'].contains(args['action']);
  File get _file => File('${root.path}/component-operation.json');
  Future<void> _save(Map<String, dynamic> value) async {
    await root.create(recursive: true);
    final temp = File('${_file.path}.${agentId('receipt')}.tmp');
    await temp.writeAsString(jsonEncode(value), flush: true);
    await temp.rename(_file.path);
    operation = value; changed?.call();
  }
  Future<void> initialize() => _initializing ??= () async {
    if (!await _file.exists()) return;
    final value = jsonDecode(await _file.readAsString());
    if (value is! Map<String, dynamic> || value['id'] is! String ||
        !componentActionCatalog.containsKey(value['action']) ||
        !['queued','running','completed','failed','interrupted'].contains(value['state'])) {
      throw StateError('组件交接记录损坏，未自动重试');
    }
    operation = value;
    if (['queued','running'].contains(value['state'])) {
      await _save({...value,'state':'interrupted','message':'上次操作中断，结果待核对；未自动重试或下载。'});
    }
    changed?.call();
  }();
  String _revision(Map<String, dynamic> state) => sha256.convert(utf8.encode(jsonEncode({
    'version':state['installed'],'phase':state['phase'],'plan':_plan,'checked':_checkedAt?.toIso8601String(),
  }))).toString();
  Map<String, dynamic> _data(Map<String, dynamic> state) => {
    'component':{'version':state['installed'],'phase':state['phase']},
    'available':_plan == null ? null : {'version':_plan!['version'],'bytes':_plan!['bytes'],'sha256':_plan!['sha256']},
    'operation':operation,'revision':_revision(state),'busy':busy,
  };
  AgentToolResult _result(Map<String, dynamic> value) => AgentToolResult(ok:true,title:'组件操作',output:jsonEncode(value));
  void _checkCancelled() { if (_cancelled) throw StateError('用户已停止组件操作'); }
  Future<Map<String, dynamic>> _wait({bool checkError=true}) async {
    final deadline = DateTime.now().add(commandTimeout);
    while (true) {
      final state = await invoke('status', {});
      if (state['busy'] != true) {
        if (checkError && state['error'] != null) throw StateError('${state['error']}');
        return state;
      }
      if (DateTime.now().isAfter(deadline)) {await invoke('stop', {});throw TimeoutException('组件任务超时；请核对软件日志，未自动重试');}
      await Future<void>.delayed(pollInterval);
    }
  }
  Future<AgentToolResult> execute(String tool, Map<String, dynamic> args, String session) async {
    var acquired = false;
    try {
      await initialize();
      if (!handles(tool,args)) throw StateError('未知组件操作');
      for (final key in args.keys) {if (!['action','expectedRevision'].contains(key)) throw StateError('未知组件参数：$key');}
      final action = args['action'] as String;
      if (action == 'component.status') return _result(_data(await invoke('status', {})));
      if (busy) throw StateError('已有组件任务，请读取状态，不要重复提交');
      busy=true; acquired=true; _cancelled=false; changed?.call();
      if (action == 'component.check') {
        _plan=await invoke('planDownload', {'kind':'component','reinstall':false});
        _checkCancelled();_checkedAt=DateTime.now();busy=false;
        return _result(_data(await invoke('status', {})));
      }
      final before = await invoke('status', {});
      if (before['supported'] == false || before['busy'] == true) throw StateError('当前环境不支持或正在处理其他组件任务');
      if (!['running','stopped','not_installed'].contains(before['phase'])) throw StateError('组件仍在处理其他任务');
      if (args['expectedRevision'] != _revision(before)) throw StateError('组件状态已变化，请重新读取并传入 expectedRevision');
      if (action != 'component.uninstall' && (_plan == null || _checkedAt == null || DateTime.now().difference(_checkedAt!).inMinutes >= 10)) throw StateError('请先检查兼容组件，检查结果有效期为10分钟');
      if (action == 'component.uninstall' && before['installed'] == null) throw StateError('没有已安装组件');
      if (action == 'component.install' && before['installed'] != null) throw StateError('组件已安装，请选择更新或重装');
      if (action == 'component.update' && before['installed'] == _plan!['version']) return _result({..._data(before),'current':true,'busy':false});
      if(action=='component.reinstall'){
        _plan=await invoke('planDownload', {'kind':'component','reinstall':true});
        _checkedAt=DateTime.now();_checkCancelled();
      }
      final revision = _revision(before);
      _awaitingApproval=true;
      final approved=await approve(session, {...args,'title':componentActionCatalog[action]!['title'],
        'version':action=='component.uninstall'?before['installed']:_plan!['version'],
        'downloadBytes':action=='component.uninstall'?0:_plan!['bytes'],
        'sha256':action=='component.uninstall'?null:_plan!['sha256'],
        'keepConversations':true,'notice':'确认后软件接管，Agent 会断开；结果在软件日志中查看。不会再次确认或自动重试。'});
      _awaitingApproval=false;_checkCancelled();
      if (!approved) throw StateError('已取消，未停止 Agent 或修改组件');
      if (_revision(await invoke('status', {})) != revision) throw StateError('确认期间状态变化，未执行');
      if (action!='component.uninstall' && DateTime.now().difference(_checkedAt!).inMinutes>=10) throw StateError('组件检查已过期，未下载');
      final value = <String,dynamic>{'id':agentId('component'),'action':action,'state':'queued','version':action=='component.uninstall'?before['installed']:_plan!['version'],'updatedAt':DateTime.now().toIso8601String(),'message':'已确认并排队，等待交接回执；排队不代表完成。'};
      await _save(value); _owner=session; _work=null; acquired=false;
      _timer=Timer(handoffTimeout,(){if(_work==null){_launch(_finish('interrupted','交接回执未完成，未停止 Agent 或修改组件。'));}});
      return _result({'queued':true,'operation':value});
    } catch(e) {return AgentToolResult(ok:false,title:'组件操作未执行',output:'$e');}
    finally {if(acquired){busy=false;_awaitingApproval=false;changed?.call();}}
  }
  Future<void> _finish(String state,String message) async {
    try {await _save({...operation!,'state':state,'message':message,'updatedAt':DateTime.now().toIso8601String()});}
    finally {_timer?.cancel();_owner=null;busy=false;changed?.call();}
  }
  void _launch(Future<void> work){
    _work=work.catchError((Object error){
      busy=false;_owner=null;
      operation={...operation!,'state':'failed','message':'交接结果写入失败，请核对日志，勿重复操作：$error'};
      changed?.call();
    });
  }
  Future<void> _run() async {
    try {
      await _save({...operation!,'state':'running','message':'软件已接管；正在停止 Agent 并执行已确认的组件操作。'});
      _checkCancelled();final stopped=await invoke('stop', {'handoff':true});
      final afterStop=await _wait(checkError:false);_checkCancelled();
      final stopRevision=stopped['stopRevision'];
      if(stopRevision is! num || afterStop['stopRevision']!=stopRevision ||
          afterStop['running']==true || !['stopped','not_installed'].contains(afterStop['phase'])) {
        throw StateError('Agent 停止交接未通过或用户再次停止，未修改组件');
      }
      if (operation!['action']=='component.uninstall') {
        await invoke('uninstall', {'confirmed':true,'expectedStopRevision':stopRevision});final result=await _wait();_checkCancelled();
        if(result['installed']!=null || !['stopped','not_installed'].contains(result['phase'])) throw StateError('卸载回读未通过');
      } else {
        await invoke('prepare', {'kind':'component','downloadToken':_plan!['token'],'expectedStopRevision':stopRevision});final prepared=await _wait();_checkCancelled();
        final proposal=prepared['proposal'];
        if(proposal is! Map || proposal['version']!=operation!['version'] || proposal['token'] is! String) throw StateError('兼容校验未通过或候选版本变化；未安装');
        if(prepared['stopRevision']!=stopRevision)throw StateError('用户已停止组件操作，未安装');
        await invoke('confirm', {'token':proposal['token'],'expectedStopRevision':stopRevision});final installed=await _wait();_checkCancelled();
        if(installed['installed']!=operation!['version'] || installed['phase']!='stopped') throw StateError('安装结果回读未通过');
      }
      await _finish('completed',operation!['action']=='component.uninstall'?'组件已卸载，对话与资料保留。':'组件已安装，对话与资料保留；可在软件中启动 Agent。');
    } catch(e) {await _finish(_cancelled?'interrupted':'failed','$e；未自动重试，请核对日志。');}
  }
  void afterResponse(String tool,Map<String,dynamic> args,String session,String call,
      Map<String,dynamic> result,bool delivered) {
    final returned=result['data'];
    if(!busy || _work!=null || !handles(tool,args) || session!=_owner || result['ok']!=true ||
        returned is! Map || returned['operation'] is! Map || returned['operation']['id']!=operation?['id']) return;
    _timer?.cancel();
    _launch(delivered?_run():_finish('interrupted','连接已断开，未停止 Agent 或修改组件。'));
  }
  Future<void> cancel() async {
    _cancelled=true;
    if(_awaitingApproval) return; // The bridge closes its pending approval separately.
    if(!busy || _owner==null || operation==null) return;
    _timer?.cancel();
    if(_work!=null){await invoke('stop', {});await _work;}
    else {_work=_finish('interrupted','用户停止了排队任务，尚未修改组件。');await _work;}
  }
  Future<void> settled() async {await _work;}
}
