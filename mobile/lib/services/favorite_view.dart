/// View preferences are separate from library ordering and image bytes.
class FavoriteView {
  final String sortBy, sortDirection, layout;
  final int pageSize;
  const FavoriteView({this.sortBy='savedAt',this.sortDirection='desc',
    this.layout='grid',this.pageSize=24});
  factory FavoriteView.fromJson(Object? value) {
    final raw=value is Map?value:const {};
    return FavoriteView(sortBy:raw['sortBy']=='generatedAt'?'generatedAt':'savedAt',
      sortDirection:raw['sortDirection']=='asc'?'asc':'desc',
      layout:raw['layout']=='masonry'?'masonry':'grid',
      pageSize:const [12,24,48,96].contains(raw['pageSize'])?raw['pageSize'] as int:24);
  }
  Map<String,dynamic> toJson()=>{'sortBy':sortBy,'sortDirection':sortDirection,
    'layout':layout,'pageSize':pageSize};
  FavoriteView copyWith({String? sortBy,String? sortDirection,String? layout,int? pageSize})=>
    FavoriteView.fromJson({...toJson(),if(sortBy!=null)'sortBy':sortBy,
      if(sortDirection!=null)'sortDirection':sortDirection,
      if(layout!=null)'layout':layout,if(pageSize!=null)'pageSize':pageSize});
}

/// Reject calendar roll-forward, date-only strings and timezone-free timestamps.
/// A filesystem mtime, EXIF or imported date is never a generation-completion time.
DateTime? favoriteSortTimestamp(Object? value) {
  if(value is! String)return null;
  final m=RegExp(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$').firstMatch(value);
  if(m==null)return null;
  final year=int.parse(m[1]!),month=int.parse(m[2]!),day=int.parse(m[3]!);
  final leap=year%4==0&&(year%100!=0||year%400==0);
  final days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month<1||month>12||day<1||day>days[month-1]||
    int.parse(m[4]!)>23||int.parse(m[5]!)>59||int.parse(m[6]!)>59)return null;
  final offset=m[7]!;
  if(offset!='Z'&&(int.parse(offset.substring(1,3))>23||int.parse(offset.substring(4,6))>59))return null;
  return DateTime.tryParse(value)?.toUtc();
}

List<T> sortFavoriteRecords<T>(Iterable<T> items,FavoriteView view,
  {required String? Function(T) savedAt,required String? Function(T) generatedAt,
  required String Function(T) id,required String Function(T) fileName}) {
  final rows=items.toList().asMap().entries.map((e)=>
    (item:e.value,index:e.key,time:favoriteSortTimestamp(
      view.sortBy=='generatedAt'?generatedAt(e.value):savedAt(e.value)))).toList();
  rows.sort((a,b){
    if(a.time==null&&b.time!=null)return 1;
    if(a.time!=null&&b.time==null)return -1;
    if(a.time!=null&&b.time!=null){final difference=a.time!.compareTo(b.time!);
      if(difference!=0)return view.sortDirection=='asc'?difference:-difference;}
    final identity=id(a.item).compareTo(id(b.item));if(identity!=0)return identity;
    final path=fileName(a.item).compareTo(fileName(b.item));
    return path!=0?path:a.index.compareTo(b.index);
  });
  return rows.map((row)=>row.item).toList();
}
