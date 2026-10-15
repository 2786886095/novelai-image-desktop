import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/billing/anlas.dart';
import 'package:novelai_mobile/models/nai_models.dart';
void main(){
 const opus=AccountSummary(hasToken:true,tierLevel:3,hasActiveSubscription:true,anlasBalance:10000);
 for(final refs in [1,2,5]) { for(final samples in [1,3]){
  test('precise reference fee is 5 x $refs refs x $samples images',(){
   final q=calculateImageGenerationAnlas(params:GenerateParams(model:'nai-diffusion-4-5-full'),account:opus,batchCount:samples,preciseReferenceCount:refs);
   expect(q.amount,refs*samples*5);
  });
 } }
}
