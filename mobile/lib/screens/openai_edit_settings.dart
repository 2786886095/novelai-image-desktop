import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/openai_image_edit.dart';
import '../i18n/platform_feature_text.dart';
import '../ui/studio_dropdown.dart';

class OpenAIEditSettingsCard extends StatefulWidget {
  const OpenAIEditSettingsCard({super.key});
  @override State<OpenAIEditSettingsCard> createState()=>_OpenAIEditSettingsCardState();
}
class _OpenAIEditSettingsCardState extends State<OpenAIEditSettingsCard> {
  final url=TextEditingController(),model=TextEditingController(),secret=TextEditingController();
  final customSize=TextEditingController();
  String? revision;String size='fit',quality='auto',fidelity='';bool saving=false;
  @override void dispose(){url.dispose();model.dispose();secret.dispose();customSize.dispose();super.dispose();}
  @override Widget build(BuildContext context) {
    final state=context.watch<AppState>(),c=state.settings.openAIEdit;
    final id=c['credentialId'] as String? ?? '';
    if(revision!=id) {final value=OpenAIEditConfig.fromJson(c);revision=id;url.text=value.baseUrl;model.text=value.model;
      size=value.size;customSize.text=RegExp(r'^\d+x\d+$').hasMatch(size)?size:'1024x1024';quality=value.quality;fidelity=value.inputFidelity;secret.clear();}
    String t(String k)=>platformFeatureText(state.settings.language,k);
    Widget field(TextEditingController ctrl,String label,{bool password=false})=>TextField(controller:ctrl,
      enabled:!state.busy && !saving,obscureText:password,enableSuggestions:!password,autocorrect:!password,
      decoration:InputDecoration(labelText:label,border:const OutlineInputBorder()),onChanged:(_)=>setState((){}));
    Widget select(String label,String value,List<String> items,void Function(String) update)=>StudioDropdownButtonFormField<String>(
      value:value,isExpanded:true,decoration:InputDecoration(labelText:label,border:const OutlineInputBorder()),
      items:items.map((s)=>DropdownMenuItem(value:s,child:Text(s.isEmpty?'—':s))).toList(),
      onChanged:state.busy||saving?null:(v){if(v!=null)setState(()=>update(v));});
    return Card(child:ExpansionTile(title:Text(t('edit')),childrenPadding:const EdgeInsets.all(12),children:[
      field(url,t('baseUrl')),const SizedBox(height:12),field(model,t('model')),const SizedBox(height:12),
      field(secret,t('key'),password:true),const SizedBox(height:12),
      select(t('size'),size,{size,'fit','auto','1024x1024','1536x1024','1024x1536','custom'}.toList(),(v)=>size=v),
      if(size=='custom') ...[const SizedBox(height:12),field(customSize,t('customSize'))],
      const SizedBox(height:12),select(t('quality'),quality,['auto','low','medium','high'],(v)=>quality=v),
      const SizedBox(height:12),select(t('fidelity'),fidelity,['','low','high'],(v)=>fidelity=v),
      const SizedBox(height:12),Text(t('editBilling')),const SizedBox(height:12),
      FilledButton(onPressed:state.busy||saving?null:() async {
        final messenger=ScaffoldMessenger.of(context);
        final expected=revision!;setState(()=>saving=true);
        try {
          final key=secret.text.isNotEmpty?secret.text:await state.storage.getOpenAIEditKey(expected)??'';
          await state.saveOpenAIEditSettings(OpenAIEditConfig(baseUrl:url.text,model:model.text,quality:quality,inputFidelity:fidelity,size:size=='custom'?customSize.text.trim():size).toJson(),key,expected);
          if(mounted)messenger.showSnackBar(SnackBar(content:Text(t('saved'))));
        } catch (_) {if(mounted)messenger.showSnackBar(SnackBar(content:Text(t('saveFailed'))));}
        finally {if(mounted)setState(()=>saving=false);}
      },child:Text(t('save')))
    ]));
  }
}
class OpenAIInpaintControls extends StatelessWidget {
  const OpenAIInpaintControls({super.key});
  @override Widget build(BuildContext context) {
    final state=context.watch<AppState>();String t(String k)=>platformFeatureText(state.settings.language,k);
    return Column(crossAxisAlignment:CrossAxisAlignment.start,children:[
      Text(t('engine')),const SizedBox(height:8),
      SizedBox(width:double.infinity,child:SegmentedButton<String>(segments:[
        const ButtonSegment(value:'novelai',label:Text('NovelAI')),
        ButtonSegment(value:'openai',label:Text(t('edit')))],selected:{state.inpaintEngine},
        onSelectionChanged:state.busy?null:(v)=>state.setInpaintEngine(v.first))),
      if(state.inpaintEngine=='openai') ...[const OpenAIEditSettingsCard(),Text(t('editBilling'))],
      const SizedBox(height:12)
    ]);
  }
}
