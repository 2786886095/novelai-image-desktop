import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/agent/operation_approval.dart';
import 'package:novelai_mobile/agent/operation_policy.dart';
void main(){
 test('one-shot UI approval is bound to session and expires without execution',()async{
  final approvals=AgentOperationApprovals(timeout:const Duration(milliseconds:15));
  final waiting=approvals.wait('A','langbai_generate_image',{'count':1});
  final id=approvals.read('A')!['id'] as String;
  expect(()=>approvals.resolve('B',id,true),throwsStateError);
  approvals.resolve('A',id,true);expect(await waiting,true);
  expect(()=>approvals.resolve('A',id,true),throwsStateError);
  expect(await approvals.wait('A','langbai_memory_delete',{}),false);
  final closing=approvals.wait('A','langbai_generate_image',{});approvals.close();expect(await closing,false);
 });
 test('ordinary edits direct, paid and destructive operations confirmed',(){
  expect(requiresAgentConfirmation('langbai_update_studio_config',{}),false);
  expect(requiresAgentConfirmation('langbai_save_style_preset',{}),false);
  expect(requiresAgentConfirmation('langbai_save_style_preset',{'id':'old'}),true);
  expect(requiresAgentConfirmation('langbai_generate_image',{}),true);
  expect(requiresAgentConfirmation('unknown',{}),true);
 });
}
