import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../i18n/platform_feature_text.dart';

class ExternalMcpSettingsCard extends StatefulWidget {
  const ExternalMcpSettingsCard({super.key});
  @override State<ExternalMcpSettingsCard> createState()=>_ExternalMcpSettingsCardState();
}
class _ExternalMcpSettingsCardState extends State<ExternalMcpSettingsCard> {
  @override Widget build(BuildContext context) {
    final app=context.watch<AppState>();String t(String k)=>platformFeatureText(app.settings.language,k);
    final runtime=app.externalMcp;
    return ListenableBuilder(listenable:runtime,builder:(context,_) {
    final current=runtime.server,changing=runtime.changing;
    return Card(child:Padding(padding:const EdgeInsets.all(12),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(t('mcp'),style:Theme.of(context).textTheme.titleMedium),Text(t('mcpHint')),
      const SizedBox(height:8),TextField(key:const ValueKey('mcp-budget'),enabled:current==null && !changing,
        keyboardType:TextInputType.number,decoration:const InputDecoration(labelText:'Max Anlas / call',hintText:'0',border:OutlineInputBorder()),
        onChanged:(v)=>runtime.setBudget(int.tryParse(v)??0)),
      const SizedBox(height:8),Wrap(spacing:8,runSpacing:8,children:[
        FilledButton(key:const ValueKey('external-mcp-enable'),onPressed:changing?null:() async {final messenger=ScaffoldMessenger.of(context);try{await runtime.toggle();}catch(_){if(mounted)messenger.showSnackBar(SnackBar(content:Text(t('mcpUnavailable'))));}},child:Text(current==null?t('enable'):t('disable'))),
        if(current!=null)OutlinedButton(onPressed:()=>Clipboard.setData(ClipboardData(text:jsonEncode({'mcpServers':{'langbai':{'type':'http','url':current.url,'headers':{'Authorization':'Bearer ${current.token}'}}}}))),child:Text(t('copy')))
      ]),
      if(current!=null) ...[
        SelectableText(current.url),
        ...current.approvals.map((request)=>Card(child:Padding(padding:const EdgeInsets.all(8),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
          Text(request['title'] as String),ConstrainedBox(constraints:const BoxConstraints(maxHeight:180),child:SingleChildScrollView(child:SelectableText(const JsonEncoder.withIndent('  ').convert(request['parameters'])))),
          Wrap(spacing:8,children:[TextButton(onPressed:()=>current.decide(request['session'],request['id'],false),child:Text(t('cancel'))),
            FilledButton(onPressed:()=>current.decide(request['session'],request['id'],true),child:Text(t('approve')))])
        ]))))
      ]
    ])));
    });
  }
}
