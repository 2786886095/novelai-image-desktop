import 'package:flutter/material.dart';
import 'package:novelai_mobile/ui/effort_control.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/state/app_state.dart';
import 'package:novelai_mobile/agent/studio_generation_preparations.dart';
import 'package:novelai_mobile/models/nai_models.dart';
import 'package:novelai_mobile/services/nai_api.dart';
import 'package:novelai_mobile/billing/anlas.dart';
import 'package:novelai_mobile/agent/tavern_models.dart';
import 'package:novelai_mobile/agent/tavern_prompt.dart';

void main() {
  testWidgets('Effort title and choices omit explanatory small text in both modes', (tester) async {
    for (final effort in ['high','medium']) {
      await tester.pumpWidget(MaterialApp(home:Scaffold(body:EffortControl(model:'nai-diffusion-5-full',value:effort,language:'zh-CN',onChanged:(_){}))));
      await tester.pumpAndSettle();
      expect(find.text('生成档位（Effort）'),findsOneWidget);
      expect(find.text('Medium'),findsOneWidget); expect(find.text('High'),findsOneWidget);
      expect(find.byType(Text),findsNWidgets(3)); expect(tester.takeException(),isNull);
    }
  });
  test('Medium payload fixes only request fields and retains High preferences', () async {
    final p=GenerateParams(effort:'medium',steps:37,sampler:'k_euler',cfgRescale:.45,negativePrompt:'keep UC');
    final before=p.toJson();
    final payload=await NaiApi().buildPayload('fixture',AppSettings(),p,42,GenerateExtras());
    expect(payload['model'],'nai-diffusion-5-full-medium');
    expect(payload['parameters'],containsPair('steps',14));
    expect(payload['parameters'],containsPair('sampler','k_euler_ancestral'));
    expect(payload['parameters'],containsPair('cfg_rescale',0));
    expect((payload['parameters'] as Map)['uc'].toString(),isNot(contains('keep UC')));
    expect(p.toJson(),before);
    p.effort='high';
    expect(p.effectiveEffort().steps,37);
    expect(p.effectiveEffort().negativePrompt,'keep UC');
  });
  test('exact public price and count, no automatic batch changes', () {
    final p=GenerateParams(width:1024,height:1024,steps:23);
    const batchCount=3;
    expect(calculateImageGenerationAnlas(params:p,forcePaid:true,batchCount:batchCount).amount,78);
    expect(estimateOpusImages(p,50),865);
    p.effort='medium';
    expect(calculateImageGenerationAnlas(params:p,forcePaid:true,batchCount:batchCount).amount,54);
    expect(estimateOpusImages(p,50),1249);
    expect(batchCount,3);
  });
  test('High defaults and supported model boundary survive JSON', () {
    expect(GenerateParams.fromJson({}).effort,'high');
    final medium=GenerateParams.fromJson({'model':'nai-diffusion-5-full-medium'});
    expect(medium.model,'nai-diffusion-5-full'); expect(medium.effort,'medium');
    expect(GenerateParams(model:'nai-diffusion-5-curated',effort:'medium').isMediumEffort,isFalse);
    final infill=GenerateParams(model:'nai-diffusion-5-full-inpainting',effort:'medium').effectiveEffort();
    expect(infill.model,'nai-diffusion-5-full-medium-inpainting');
  });
  test('active Studio Agent prepares actual Medium settings and unchanged count', () {
    final app=AppState()..settings=AppSettings(allowCustomEndpoint:false)..params=GenerateParams(width:1024,height:1024,steps:23,effort:'medium')..batchCount=3..account=const AccountSummary(hasToken:true,tierLevel:1,hasActiveSubscription:true,anlasBalance:1000);
    addTearDown(app.dispose);
    final preview=studioGenerationPreview(app,{'positivePrompt':'1girl','count':3});
    expect(preview,containsPair('effort','medium'));
    expect(preview,containsPair('model','nai-diffusion-5-full-medium'));
    expect(preview,containsPair('steps',14));
    expect(preview,containsPair('estimatedAnlas',54));
    final high=studioGenerationPreview(app,{'positivePrompt':'1girl','count':3,'effort':'high'});
    expect(high,containsPair('steps',23)); expect(high,containsPair('estimatedAnlas',78));
    expect(app.params.effort,'medium'); expect(app.batchCount,3);
  });
  test('Agent Effort serialization and authoritative count', () {
    final visual=TavernCharacterVisual(effort:'medium',count:4);
    expect(TavernCharacterVisual.fromJson(visual.toJson()).effort,'medium');
    final proposal=TavernImageProposal.fromJson({'effort':'medium','count':8,'explicitParameters':['effort']});
    applyAuthoritativeTavernImageDefaults(proposal,const TavernImageParameterDefaults(model:'nai-diffusion-5-full',effort:'high',count:4));
    expect(proposal.effort,'medium'); expect(proposal.count,4);
  });
}
