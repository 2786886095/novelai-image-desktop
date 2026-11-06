import 'package:flutter_test/flutter_test.dart';
import 'package:novelai_mobile/prompts/v5_artist_weight_repair.dart';
const tags=['watercolor','oil_painting','pencil_sketch'];
void main() {
 for(final n in [0,1,2,3]) {
 test('artist-string draw fixed $n random tags preserves typed input and batch count',() {
 final rows=drawAllV5ArtistWeights(input:'artist:fixture, blue_dress',count:40,drawSeed:42,
 customTagPool:tags.join(', '),customTagModes:{for(final t in tags)t:'random'},minRandomCustomTags:n,maxRandomCustomTags:n);
 expect(rows.length,40);for(final row in rows){expect(tags.where((t)=>row.prompt.contains('::$t ::')).length,n);expect(row.prompt,contains('artist:fixture'));expect(row.prompt,contains('blue_dress'));}
 });}
 test('swapped bounds clamp to distinct eligible random tags',(){
 final rows=drawAllV5ArtistWeights(input:'artist:fixture',count:40,drawSeed:42,customTagPool:tags.join(', '),customTagModes:{for(final t in tags)t:'random'},minRandomCustomTags:9,maxRandomCustomTags:2);
 for(final row in rows){expect(tags.where((t)=>row.prompt.contains('::$t ::')).length,inInclusiveRange(2,3));}
 });
 test('legacy selections default always; manually typed duplicates are not removed or counted',(){
 final rows=drawAllV5ArtistWeights(input:'artist:fixture, watercolor',count:40,drawSeed:42,customTagPool:'watercolor, WATERCOLOR, oil_painting',customTagModes:{'watercolor':'random','oil_painting':'random'},minRandomCustomTags:1,maxRandomCustomTags:1);
 for(final row in rows){expect(RegExp(r'::watercolor ::').allMatches(row.prompt).length,1);expect(row.prompt,contains('::oil_painting ::'));}
 final old=drawAllV5ArtistWeights(input:'artist:fixture',count:3,customTagPool:tags.join(', '),minRandomCustomTags:0,maxRandomCustomTags:0);
 for(final row in old){expect(tags.every((t)=>row.prompt.contains('::$t ::')),true);}
 });
}
