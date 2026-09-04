// GENERATED FILE — edit shared/random-custom-tag-library.json, then run
// npm run generate:random-tags. Keeping this as Dart constants avoids a visible
// asynchronous asset-loading state when the mobile page opens.

class RandomCustomTagEntry {
  const RandomCustomTagEntry({required this.tag, required this.labels});

  final String tag;
  final Map<String, String> labels;

  String label(String language) => labels[language] ?? labels['en-US'] ?? tag;
}

class RandomCustomTagCategory {
  const RandomCustomTagCategory({
    required this.id,
    required this.labels,
    required this.tags,
  });

  final String id;
  final Map<String, String> labels;
  final List<RandomCustomTagEntry> tags;

  String label(String language) => labels[language] ?? labels['en-US'] ?? id;
}

const randomCustomTagLibrary = <RandomCustomTagCategory>[
  RandomCustomTagCategory(
    id: 'quality',
    labels: <String, String>{
      'zh-CN': '通用质量词',
      'zh-TW': '通用品質詞',
      'en-US': 'General quality',
      'ja-JP': '汎用品質タグ',
      'ko-KR': '범용 품질 태그'
    },
    tags: <RandomCustomTagEntry>[
      RandomCustomTagEntry(tag: 'masterpiece', labels: <String, String>{
        'zh-CN': '杰作级',
        'zh-TW': '傑作級',
        'en-US': 'Masterpiece-grade',
        'ja-JP': '傑作級',
        'ko-KR': '걸작급'
      }),
      RandomCustomTagEntry(tag: 'top aesthetic', labels: <String, String>{
        'zh-CN': '顶级美感（V4+）',
        'zh-TW': '頂級美感（V4+）',
        'en-US': 'Top aesthetic (V4+)',
        'ja-JP': '最高美感（V4+）',
        'ko-KR': '최고 미감(V4+)'
      }),
      RandomCustomTagEntry(tag: 'very aesthetic', labels: <String, String>{
        'zh-CN': '高美感',
        'zh-TW': '高美感',
        'en-US': 'Very aesthetic',
        'ja-JP': '非常に美的',
        'ko-KR': '높은 미감'
      }),
      RandomCustomTagEntry(tag: 'aesthetic', labels: <String, String>{
        'zh-CN': '美感',
        'zh-TW': '美感',
        'en-US': 'Aesthetic',
        'ja-JP': '美的',
        'ko-KR': '미적'
      }),
      RandomCustomTagEntry(tag: 'best quality', labels: <String, String>{
        'zh-CN': '最高质量',
        'zh-TW': '最高品質',
        'en-US': 'Best quality',
        'ja-JP': '最高品質',
        'ko-KR': '최고 품질'
      }),
      RandomCustomTagEntry(tag: 'amazing quality', labels: <String, String>{
        'zh-CN': '惊艳质量',
        'zh-TW': '驚豔品質',
        'en-US': 'Amazing quality',
        'ja-JP': '驚異的な品質',
        'ko-KR': '놀라운 품질'
      }),
      RandomCustomTagEntry(tag: 'great quality', labels: <String, String>{
        'zh-CN': '优秀质量',
        'zh-TW': '優秀品質',
        'en-US': 'Great quality',
        'ja-JP': '高品質',
        'ko-KR': '우수한 품질'
      }),
      RandomCustomTagEntry(tag: 'high quality', labels: <String, String>{
        'zh-CN': '高质量',
        'zh-TW': '高品質',
        'en-US': 'High quality',
        'ja-JP': '高品質',
        'ko-KR': '고품질'
      }),
      RandomCustomTagEntry(tag: 'normal quality', labels: <String, String>{
        'zh-CN': '普通质量',
        'zh-TW': '一般品質',
        'en-US': 'Normal quality',
        'ja-JP': '通常品質',
        'ko-KR': '보통 품질'
      }),
      RandomCustomTagEntry(tag: 'bad quality', labels: <String, String>{
        'zh-CN': '低质量（实验）',
        'zh-TW': '低品質（實驗）',
        'en-US': 'Bad quality (experimental)',
        'ja-JP': '低品質（実験）',
        'ko-KR': '낮은 품질(실험)'
      }),
      RandomCustomTagEntry(tag: 'worst quality', labels: <String, String>{
        'zh-CN': '最差质量（实验）',
        'zh-TW': '最差品質（實驗）',
        'en-US': 'Worst quality (experimental)',
        'ja-JP': '最低品質（実験）',
        'ko-KR': '최저 품질(실험)'
      }),
      RandomCustomTagEntry(tag: 'absurdres', labels: <String, String>{
        'zh-CN': '超高分辨率',
        'zh-TW': '超高解析度',
        'en-US': 'Extremely high resolution',
        'ja-JP': '超高解像度',
        'ko-KR': '초고해상도'
      }),
      RandomCustomTagEntry(tag: 'highres', labels: <String, String>{
        'zh-CN': '高分辨率',
        'zh-TW': '高解析度',
        'en-US': 'High resolution',
        'ja-JP': '高解像度',
        'ko-KR': '고해상도'
      }),
      RandomCustomTagEntry(tag: 'ultra detailed', labels: <String, String>{
        'zh-CN': '超精细',
        'zh-TW': '超精細',
        'en-US': 'Ultra-detailed',
        'ja-JP': '超精細',
        'ko-KR': '초정밀'
      }),
      RandomCustomTagEntry(tag: 'extremely detailed', labels: <String, String>{
        'zh-CN': '极致细节',
        'zh-TW': '極致細節',
        'en-US': 'Extremely detailed',
        'ja-JP': '極めて詳細',
        'ko-KR': '극도로 세밀함'
      }),
      RandomCustomTagEntry(tag: 'intricate details', labels: <String, String>{
        'zh-CN': '繁复细节',
        'zh-TW': '繁複細節',
        'en-US': 'Intricate details',
        'ja-JP': '緻密なディテール',
        'ko-KR': '정교한 디테일'
      }),
      RandomCustomTagEntry(tag: 'no text', labels: <String, String>{
        'zh-CN': '无文字',
        'zh-TW': '無文字',
        'en-US': 'No text',
        'ja-JP': '文字なし',
        'ko-KR': '텍스트 없음'
      }),
      RandomCustomTagEntry(tag: 'low complexity', labels: <String, String>{
        'zh-CN': '低复杂度（V5）',
        'zh-TW': '低複雜度（V5）',
        'en-US': 'Low complexity (V5)',
        'ja-JP': '低複雑度（V5）',
        'ko-KR': '낮은 복잡도(V5)'
      }),
      RandomCustomTagEntry(tag: 'medium complexity', labels: <String, String>{
        'zh-CN': '中等复杂度（V5）',
        'zh-TW': '中等複雜度（V5）',
        'en-US': 'Medium complexity (V5)',
        'ja-JP': '中複雑度（V5）',
        'ko-KR': '중간 복잡도(V5)'
      }),
      RandomCustomTagEntry(tag: 'high complexity', labels: <String, String>{
        'zh-CN': '高复杂度（V5）',
        'zh-TW': '高複雜度（V5）',
        'en-US': 'High complexity (V5)',
        'ja-JP': '高複雑度（V5）',
        'ko-KR': '높은 복잡도(V5)'
      }),
      RandomCustomTagEntry(tag: 'ultra complexity', labels: <String, String>{
        'zh-CN': '超高复杂度（V5）',
        'zh-TW': '超高複雜度（V5）',
        'en-US': 'Ultra complexity (V5)',
        'ja-JP': '超高複雑度（V5）',
        'ko-KR': '초고 복잡도(V5)'
      }),
      RandomCustomTagEntry(tag: 'year 2026', labels: <String, String>{
        'zh-CN': '2026 年画风',
        'zh-TW': '2026 年畫風',
        'en-US': '2026 art era',
        'ja-JP': '2026 年の画風',
        'ko-KR': '2026년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2025', labels: <String, String>{
        'zh-CN': '2025 年画风',
        'zh-TW': '2025 年畫風',
        'en-US': '2025 art era',
        'ja-JP': '2025 年の画風',
        'ko-KR': '2025년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2024', labels: <String, String>{
        'zh-CN': '2024 年画风',
        'zh-TW': '2024 年畫風',
        'en-US': '2024 art era',
        'ja-JP': '2024 年の画風',
        'ko-KR': '2024년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2023', labels: <String, String>{
        'zh-CN': '2023 年画风',
        'zh-TW': '2023 年畫風',
        'en-US': '2023 art era',
        'ja-JP': '2023 年の画風',
        'ko-KR': '2023년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2022', labels: <String, String>{
        'zh-CN': '2022 年画风',
        'zh-TW': '2022 年畫風',
        'en-US': '2022 art era',
        'ja-JP': '2022 年の画風',
        'ko-KR': '2022년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2021', labels: <String, String>{
        'zh-CN': '2021 年画风',
        'zh-TW': '2021 年畫風',
        'en-US': '2021 art era',
        'ja-JP': '2021 年の画風',
        'ko-KR': '2021년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2020', labels: <String, String>{
        'zh-CN': '2020 年画风',
        'zh-TW': '2020 年畫風',
        'en-US': '2020 art era',
        'ja-JP': '2020 年の画風',
        'ko-KR': '2020년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2019', labels: <String, String>{
        'zh-CN': '2019 年画风',
        'zh-TW': '2019 年畫風',
        'en-US': '2019 art era',
        'ja-JP': '2019 年の画風',
        'ko-KR': '2019년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2018', labels: <String, String>{
        'zh-CN': '2018 年画风',
        'zh-TW': '2018 年畫風',
        'en-US': '2018 art era',
        'ja-JP': '2018 年の画風',
        'ko-KR': '2018년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2017', labels: <String, String>{
        'zh-CN': '2017 年画风',
        'zh-TW': '2017 年畫風',
        'en-US': '2017 art era',
        'ja-JP': '2017 年の画風',
        'ko-KR': '2017년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2016', labels: <String, String>{
        'zh-CN': '2016 年画风',
        'zh-TW': '2016 年畫風',
        'en-US': '2016 art era',
        'ja-JP': '2016 年の画風',
        'ko-KR': '2016년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2015', labels: <String, String>{
        'zh-CN': '2015 年画风',
        'zh-TW': '2015 年畫風',
        'en-US': '2015 art era',
        'ja-JP': '2015 年の画風',
        'ko-KR': '2015년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2014', labels: <String, String>{
        'zh-CN': '2014 年画风',
        'zh-TW': '2014 年畫風',
        'en-US': '2014 art era',
        'ja-JP': '2014 年の画風',
        'ko-KR': '2014년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2013', labels: <String, String>{
        'zh-CN': '2013 年画风',
        'zh-TW': '2013 年畫風',
        'en-US': '2013 art era',
        'ja-JP': '2013 年の画風',
        'ko-KR': '2013년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2012', labels: <String, String>{
        'zh-CN': '2012 年画风',
        'zh-TW': '2012 年畫風',
        'en-US': '2012 art era',
        'ja-JP': '2012 年の画風',
        'ko-KR': '2012년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2011', labels: <String, String>{
        'zh-CN': '2011 年画风',
        'zh-TW': '2011 年畫風',
        'en-US': '2011 art era',
        'ja-JP': '2011 年の画風',
        'ko-KR': '2011년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2010', labels: <String, String>{
        'zh-CN': '2010 年画风',
        'zh-TW': '2010 年畫風',
        'en-US': '2010 art era',
        'ja-JP': '2010 年の画風',
        'ko-KR': '2010년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2009', labels: <String, String>{
        'zh-CN': '2009 年画风',
        'zh-TW': '2009 年畫風',
        'en-US': '2009 art era',
        'ja-JP': '2009 年の画風',
        'ko-KR': '2009년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2008', labels: <String, String>{
        'zh-CN': '2008 年画风',
        'zh-TW': '2008 年畫風',
        'en-US': '2008 art era',
        'ja-JP': '2008 年の画風',
        'ko-KR': '2008년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2007', labels: <String, String>{
        'zh-CN': '2007 年画风',
        'zh-TW': '2007 年畫風',
        'en-US': '2007 art era',
        'ja-JP': '2007 年の画風',
        'ko-KR': '2007년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2006', labels: <String, String>{
        'zh-CN': '2006 年画风',
        'zh-TW': '2006 年畫風',
        'en-US': '2006 art era',
        'ja-JP': '2006 年の画風',
        'ko-KR': '2006년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2005', labels: <String, String>{
        'zh-CN': '2005 年画风',
        'zh-TW': '2005 年畫風',
        'en-US': '2005 art era',
        'ja-JP': '2005 年の画風',
        'ko-KR': '2005년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2004', labels: <String, String>{
        'zh-CN': '2004 年画风',
        'zh-TW': '2004 年畫風',
        'en-US': '2004 art era',
        'ja-JP': '2004 年の画風',
        'ko-KR': '2004년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2003', labels: <String, String>{
        'zh-CN': '2003 年画风',
        'zh-TW': '2003 年畫風',
        'en-US': '2003 art era',
        'ja-JP': '2003 年の画風',
        'ko-KR': '2003년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2002', labels: <String, String>{
        'zh-CN': '2002 年画风',
        'zh-TW': '2002 年畫風',
        'en-US': '2002 art era',
        'ja-JP': '2002 年の画風',
        'ko-KR': '2002년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2001', labels: <String, String>{
        'zh-CN': '2001 年画风',
        'zh-TW': '2001 年畫風',
        'en-US': '2001 art era',
        'ja-JP': '2001 年の画風',
        'ko-KR': '2001년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 2000', labels: <String, String>{
        'zh-CN': '2000 年画风',
        'zh-TW': '2000 年畫風',
        'en-US': '2000 art era',
        'ja-JP': '2000 年の画風',
        'ko-KR': '2000년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1999', labels: <String, String>{
        'zh-CN': '1999 年画风',
        'zh-TW': '1999 年畫風',
        'en-US': '1999 art era',
        'ja-JP': '1999 年の画風',
        'ko-KR': '1999년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1998', labels: <String, String>{
        'zh-CN': '1998 年画风',
        'zh-TW': '1998 年畫風',
        'en-US': '1998 art era',
        'ja-JP': '1998 年の画風',
        'ko-KR': '1998년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1997', labels: <String, String>{
        'zh-CN': '1997 年画风',
        'zh-TW': '1997 年畫風',
        'en-US': '1997 art era',
        'ja-JP': '1997 年の画風',
        'ko-KR': '1997년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1996', labels: <String, String>{
        'zh-CN': '1996 年画风',
        'zh-TW': '1996 年畫風',
        'en-US': '1996 art era',
        'ja-JP': '1996 年の画風',
        'ko-KR': '1996년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1995', labels: <String, String>{
        'zh-CN': '1995 年画风',
        'zh-TW': '1995 年畫風',
        'en-US': '1995 art era',
        'ja-JP': '1995 年の画風',
        'ko-KR': '1995년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1994', labels: <String, String>{
        'zh-CN': '1994 年画风',
        'zh-TW': '1994 年畫風',
        'en-US': '1994 art era',
        'ja-JP': '1994 年の画風',
        'ko-KR': '1994년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1993', labels: <String, String>{
        'zh-CN': '1993 年画风',
        'zh-TW': '1993 年畫風',
        'en-US': '1993 art era',
        'ja-JP': '1993 年の画風',
        'ko-KR': '1993년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1992', labels: <String, String>{
        'zh-CN': '1992 年画风',
        'zh-TW': '1992 年畫風',
        'en-US': '1992 art era',
        'ja-JP': '1992 年の画風',
        'ko-KR': '1992년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1991', labels: <String, String>{
        'zh-CN': '1991 年画风',
        'zh-TW': '1991 年畫風',
        'en-US': '1991 art era',
        'ja-JP': '1991 年の画風',
        'ko-KR': '1991년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1990', labels: <String, String>{
        'zh-CN': '1990 年画风',
        'zh-TW': '1990 年畫風',
        'en-US': '1990 art era',
        'ja-JP': '1990 年の画風',
        'ko-KR': '1990년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1989', labels: <String, String>{
        'zh-CN': '1989 年画风',
        'zh-TW': '1989 年畫風',
        'en-US': '1989 art era',
        'ja-JP': '1989 年の画風',
        'ko-KR': '1989년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1988', labels: <String, String>{
        'zh-CN': '1988 年画风',
        'zh-TW': '1988 年畫風',
        'en-US': '1988 art era',
        'ja-JP': '1988 年の画風',
        'ko-KR': '1988년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1987', labels: <String, String>{
        'zh-CN': '1987 年画风',
        'zh-TW': '1987 年畫風',
        'en-US': '1987 art era',
        'ja-JP': '1987 年の画風',
        'ko-KR': '1987년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1986', labels: <String, String>{
        'zh-CN': '1986 年画风',
        'zh-TW': '1986 年畫風',
        'en-US': '1986 art era',
        'ja-JP': '1986 年の画風',
        'ko-KR': '1986년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1985', labels: <String, String>{
        'zh-CN': '1985 年画风',
        'zh-TW': '1985 年畫風',
        'en-US': '1985 art era',
        'ja-JP': '1985 年の画風',
        'ko-KR': '1985년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1984', labels: <String, String>{
        'zh-CN': '1984 年画风',
        'zh-TW': '1984 年畫風',
        'en-US': '1984 art era',
        'ja-JP': '1984 年の画風',
        'ko-KR': '1984년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1983', labels: <String, String>{
        'zh-CN': '1983 年画风',
        'zh-TW': '1983 年畫風',
        'en-US': '1983 art era',
        'ja-JP': '1983 年の画風',
        'ko-KR': '1983년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1982', labels: <String, String>{
        'zh-CN': '1982 年画风',
        'zh-TW': '1982 年畫風',
        'en-US': '1982 art era',
        'ja-JP': '1982 年の画風',
        'ko-KR': '1982년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1981', labels: <String, String>{
        'zh-CN': '1981 年画风',
        'zh-TW': '1981 年畫風',
        'en-US': '1981 art era',
        'ja-JP': '1981 年の画風',
        'ko-KR': '1981년 화풍'
      }),
      RandomCustomTagEntry(tag: 'year 1980', labels: <String, String>{
        'zh-CN': '1980 年画风',
        'zh-TW': '1980 年畫風',
        'en-US': '1980 art era',
        'ja-JP': '1980 年の画風',
        'ko-KR': '1980년 화풍'
      }),
    ],
  ),
  RandomCustomTagCategory(
    id: 'render3d',
    labels: <String, String>{
      'zh-CN': '3D 与渲染',
      'zh-TW': '3D 與渲染',
      'en-US': '3D & rendering',
      'ja-JP': '3D・レンダリング',
      'ko-KR': '3D·렌더링'
    },
    tags: <RandomCustomTagEntry>[
      RandomCustomTagEntry(tag: '3d', labels: <String, String>{
        'zh-CN': '3D 立体',
        'zh-TW': '3D 立體',
        'en-US': '3D imagery',
        'ja-JP': '3D表現',
        'ko-KR': '3D 표현'
      }),
      RandomCustomTagEntry(tag: '3d render', labels: <String, String>{
        'zh-CN': '3D 渲染',
        'zh-TW': '3D 渲染',
        'en-US': '3D render',
        'ja-JP': '3Dレンダー',
        'ko-KR': '3D 렌더'
      }),
      RandomCustomTagEntry(tag: 'cgi', labels: <String, String>{
        'zh-CN': '计算机图形',
        'zh-TW': '電腦圖形',
        'en-US': 'Computer-generated imagery',
        'ja-JP': 'CG映像',
        'ko-KR': '컴퓨터 그래픽'
      }),
      RandomCustomTagEntry(tag: 'photorealistic', labels: <String, String>{
        'zh-CN': '照片级写实',
        'zh-TW': '照片級寫實',
        'en-US': 'Photorealistic',
        'ja-JP': '写真級リアル',
        'ko-KR': '사진급 사실감'
      }),
      RandomCustomTagEntry(tag: 'octane render', labels: <String, String>{
        'zh-CN': 'Octane 渲染质感',
        'zh-TW': 'Octane 渲染質感',
        'en-US': 'Octane-rendered look',
        'ja-JP': 'Octaneレンダー質感',
        'ko-KR': 'Octane 렌더 질감'
      }),
      RandomCustomTagEntry(tag: 'unreal engine', labels: <String, String>{
        'zh-CN': '虚幻引擎质感',
        'zh-TW': '虛幻引擎質感',
        'en-US': 'Unreal Engine look',
        'ja-JP': 'Unreal Engine質感',
        'ko-KR': '언리얼 엔진 질감'
      }),
      RandomCustomTagEntry(tag: 'blender', labels: <String, String>{
        'zh-CN': 'Blender 渲染',
        'zh-TW': 'Blender 渲染',
        'en-US': 'Blender render',
        'ja-JP': 'Blenderレンダー',
        'ko-KR': 'Blender 렌더'
      }),
      RandomCustomTagEntry(tag: 'ray tracing', labels: <String, String>{
        'zh-CN': '光线追踪',
        'zh-TW': '光線追蹤',
        'en-US': 'Ray tracing',
        'ja-JP': 'レイトレーシング',
        'ko-KR': '레이 트레이싱'
      }),
      RandomCustomTagEntry(
          tag: 'physically based rendering',
          labels: <String, String>{
            'zh-CN': '基于物理的渲染',
            'zh-TW': '基於物理的渲染',
            'en-US': 'Physically based rendering',
            'ja-JP': '物理ベースレンダリング',
            'ko-KR': '물리 기반 렌더링'
          }),
      RandomCustomTagEntry(
          tag: 'subsurface scattering',
          labels: <String, String>{
            'zh-CN': '次表面散射',
            'zh-TW': '次表面散射',
            'en-US': 'Subsurface scattering',
            'ja-JP': '表面下散乱',
            'ko-KR': '서브서피스 스캐터링'
          }),
    ],
  ),
  RandomCustomTagCategory(
    id: 'medium',
    labels: <String, String>{
      'zh-CN': '媒介与画法',
      'zh-TW': '媒介與畫法',
      'en-US': 'Medium & technique',
      'ja-JP': '画材・技法',
      'ko-KR': '매체·기법'
    },
    tags: <RandomCustomTagEntry>[
      RandomCustomTagEntry(tag: 'illustration', labels: <String, String>{
        'zh-CN': '插画',
        'zh-TW': '插畫',
        'en-US': 'Illustration',
        'ja-JP': 'イラスト',
        'ko-KR': '일러스트'
      }),
      RandomCustomTagEntry(tag: 'digital painting', labels: <String, String>{
        'zh-CN': '数字绘画',
        'zh-TW': '數位繪畫',
        'en-US': 'Digital painting',
        'ja-JP': 'デジタルペイント',
        'ko-KR': '디지털 페인팅'
      }),
      RandomCustomTagEntry(tag: 'concept art', labels: <String, String>{
        'zh-CN': '概念设计',
        'zh-TW': '概念設計',
        'en-US': 'Concept art',
        'ja-JP': 'コンセプトアート',
        'ko-KR': '컨셉 아트'
      }),
      RandomCustomTagEntry(tag: 'anime coloring', labels: <String, String>{
        'zh-CN': '动画式上色',
        'zh-TW': '動畫式上色',
        'en-US': 'Anime coloring',
        'ja-JP': 'アニメ塗り',
        'ko-KR': '애니메이션 채색'
      }),
      RandomCustomTagEntry(tag: 'painterly', labels: <String, String>{
        'zh-CN': '绘画笔触感',
        'zh-TW': '繪畫筆觸感',
        'en-US': 'Painterly',
        'ja-JP': '絵画的な筆致',
        'ko-KR': '회화적 붓터치'
      }),
      RandomCustomTagEntry(tag: 'watercolor', labels: <String, String>{
        'zh-CN': '水彩',
        'zh-TW': '水彩',
        'en-US': 'Watercolor',
        'ja-JP': '水彩',
        'ko-KR': '수채화'
      }),
      RandomCustomTagEntry(tag: 'oil painting', labels: <String, String>{
        'zh-CN': '油画',
        'zh-TW': '油畫',
        'en-US': 'Oil painting',
        'ja-JP': '油彩',
        'ko-KR': '유화'
      }),
      RandomCustomTagEntry(tag: 'gouache', labels: <String, String>{
        'zh-CN': '水粉',
        'zh-TW': '廣告顏料',
        'en-US': 'Gouache',
        'ja-JP': 'ガッシュ',
        'ko-KR': '과슈'
      }),
      RandomCustomTagEntry(tag: 'cel shading', labels: <String, String>{
        'zh-CN': '赛璐璐上色',
        'zh-TW': '賽璐璐上色',
        'en-US': 'Cel shading',
        'ja-JP': 'セルシェーディング',
        'ko-KR': '셀 셰이딩'
      }),
      RandomCustomTagEntry(tag: 'lineart', labels: <String, String>{
        'zh-CN': '线稿',
        'zh-TW': '線稿',
        'en-US': 'Line art',
        'ja-JP': '線画',
        'ko-KR': '선화'
      }),
    ],
  ),
  RandomCustomTagCategory(
    id: 'lighting',
    labels: <String, String>{
      'zh-CN': '光影与照明',
      'zh-TW': '光影與照明',
      'en-US': 'Lighting',
      'ja-JP': '光・照明',
      'ko-KR': '빛·조명'
    },
    tags: <RandomCustomTagEntry>[
      RandomCustomTagEntry(tag: 'cinematic lighting', labels: <String, String>{
        'zh-CN': '电影光影',
        'zh-TW': '電影光影',
        'en-US': 'Cinematic lighting',
        'ja-JP': '映画的ライティング',
        'ko-KR': '시네마틱 조명'
      }),
      RandomCustomTagEntry(tag: 'volumetric lighting', labels: <String, String>{
        'zh-CN': '体积光',
        'zh-TW': '體積光',
        'en-US': 'Volumetric lighting',
        'ja-JP': 'ボリュームライト',
        'ko-KR': '볼류메트릭 라이트'
      }),
      RandomCustomTagEntry(tag: 'rim lighting', labels: <String, String>{
        'zh-CN': '轮廓光',
        'zh-TW': '輪廓光',
        'en-US': 'Rim lighting',
        'ja-JP': 'リムライト',
        'ko-KR': '림 라이트'
      }),
      RandomCustomTagEntry(tag: 'backlighting', labels: <String, String>{
        'zh-CN': '逆光',
        'zh-TW': '逆光',
        'en-US': 'Backlighting',
        'ja-JP': '逆光',
        'ko-KR': '역광'
      }),
      RandomCustomTagEntry(tag: 'side lighting', labels: <String, String>{
        'zh-CN': '侧光',
        'zh-TW': '側光',
        'en-US': 'Side lighting',
        'ja-JP': 'サイドライト',
        'ko-KR': '측면 조명'
      }),
      RandomCustomTagEntry(tag: 'soft lighting', labels: <String, String>{
        'zh-CN': '柔和光线',
        'zh-TW': '柔和光線',
        'en-US': 'Soft lighting',
        'ja-JP': '柔らかな光',
        'ko-KR': '부드러운 조명'
      }),
      RandomCustomTagEntry(tag: 'hard lighting', labels: <String, String>{
        'zh-CN': '硬朗光线',
        'zh-TW': '強烈硬光',
        'en-US': 'Hard lighting',
        'ja-JP': '硬い光',
        'ko-KR': '강한 하드 라이트'
      }),
      RandomCustomTagEntry(tag: 'dramatic lighting', labels: <String, String>{
        'zh-CN': '戏剧性光影',
        'zh-TW': '戲劇性光影',
        'en-US': 'Dramatic lighting',
        'ja-JP': 'ドラマチックな光',
        'ko-KR': '극적인 조명'
      }),
      RandomCustomTagEntry(tag: 'studio lighting', labels: <String, String>{
        'zh-CN': '摄影棚灯光',
        'zh-TW': '攝影棚燈光',
        'en-US': 'Studio lighting',
        'ja-JP': 'スタジオ照明',
        'ko-KR': '스튜디오 조명'
      }),
      RandomCustomTagEntry(tag: 'neon lighting', labels: <String, String>{
        'zh-CN': '霓虹灯光',
        'zh-TW': '霓虹燈光',
        'en-US': 'Neon lighting',
        'ja-JP': 'ネオン照明',
        'ko-KR': '네온 조명'
      }),
    ],
  ),
  RandomCustomTagCategory(
    id: 'color',
    labels: <String, String>{
      'zh-CN': '色彩与调色',
      'zh-TW': '色彩與調色',
      'en-US': 'Color & grading',
      'ja-JP': '色彩・カラー',
      'ko-KR': '색채·컬러'
    },
    tags: <RandomCustomTagEntry>[
      RandomCustomTagEntry(tag: 'vibrant colors', labels: <String, String>{
        'zh-CN': '鲜艳色彩',
        'zh-TW': '鮮豔色彩',
        'en-US': 'Vibrant colors',
        'ja-JP': '鮮やかな色',
        'ko-KR': '선명한 색상'
      }),
      RandomCustomTagEntry(tag: 'pastel colors', labels: <String, String>{
        'zh-CN': '粉彩色调',
        'zh-TW': '粉彩色調',
        'en-US': 'Pastel colors',
        'ja-JP': 'パステルカラー',
        'ko-KR': '파스텔 색상'
      }),
      RandomCustomTagEntry(tag: 'muted colors', labels: <String, String>{
        'zh-CN': '低饱和色彩',
        'zh-TW': '低飽和色彩',
        'en-US': 'Muted colors',
        'ja-JP': '落ち着いた色',
        'ko-KR': '차분한 저채도 색'
      }),
      RandomCustomTagEntry(tag: 'monochrome', labels: <String, String>{
        'zh-CN': '单色画面',
        'zh-TW': '單色畫面',
        'en-US': 'Monochrome',
        'ja-JP': 'モノクロ',
        'ko-KR': '단색'
      }),
      RandomCustomTagEntry(tag: 'limited palette', labels: <String, String>{
        'zh-CN': '限制色板',
        'zh-TW': '限制色盤',
        'en-US': 'Limited palette',
        'ja-JP': '限定カラーパレット',
        'ko-KR': '제한된 팔레트'
      }),
      RandomCustomTagEntry(
          tag: 'complementary colors',
          labels: <String, String>{
            'zh-CN': '互补色',
            'zh-TW': '互補色',
            'en-US': 'Complementary colors',
            'ja-JP': '補色配色',
            'ko-KR': '보색'
          }),
      RandomCustomTagEntry(tag: 'warm colors', labels: <String, String>{
        'zh-CN': '暖色调',
        'zh-TW': '暖色調',
        'en-US': 'Warm colors',
        'ja-JP': '暖色',
        'ko-KR': '따뜻한 색조'
      }),
      RandomCustomTagEntry(tag: 'cool colors', labels: <String, String>{
        'zh-CN': '冷色调',
        'zh-TW': '冷色調',
        'en-US': 'Cool colors',
        'ja-JP': '寒色',
        'ko-KR': '차가운 색조'
      }),
      RandomCustomTagEntry(tag: 'color contrast', labels: <String, String>{
        'zh-CN': '色彩对比',
        'zh-TW': '色彩對比',
        'en-US': 'Color contrast',
        'ja-JP': '色彩コントラスト',
        'ko-KR': '색상 대비'
      }),
      RandomCustomTagEntry(tag: 'iridescent colors', labels: <String, String>{
        'zh-CN': '虹彩色泽',
        'zh-TW': '虹彩色澤',
        'en-US': 'Iridescent colors',
        'ja-JP': '玉虫色',
        'ko-KR': '오팔빛 색상'
      }),
    ],
  ),
  RandomCustomTagCategory(
    id: 'texture',
    labels: <String, String>{
      'zh-CN': '材质与纹理',
      'zh-TW': '材質與紋理',
      'en-US': 'Material & texture',
      'ja-JP': '素材・質感',
      'ko-KR': '재질·텍스처'
    },
    tags: <RandomCustomTagEntry>[
      RandomCustomTagEntry(tag: 'detailed skin', labels: <String, String>{
        'zh-CN': '皮肤细节',
        'zh-TW': '皮膚細節',
        'en-US': 'Detailed skin',
        'ja-JP': '肌のディテール',
        'ko-KR': '피부 디테일'
      }),
      RandomCustomTagEntry(tag: 'detailed eyes', labels: <String, String>{
        'zh-CN': '眼睛细节',
        'zh-TW': '眼睛細節',
        'en-US': 'Detailed eyes',
        'ja-JP': '瞳のディテール',
        'ko-KR': '눈 디테일'
      }),
      RandomCustomTagEntry(tag: 'detailed hair', labels: <String, String>{
        'zh-CN': '发丝细节',
        'zh-TW': '髮絲細節',
        'en-US': 'Detailed hair',
        'ja-JP': '髪のディテール',
        'ko-KR': '머리카락 디테일'
      }),
      RandomCustomTagEntry(tag: 'fabric texture', labels: <String, String>{
        'zh-CN': '布料纹理',
        'zh-TW': '布料紋理',
        'en-US': 'Fabric texture',
        'ja-JP': '布の質感',
        'ko-KR': '직물 질감'
      }),
      RandomCustomTagEntry(tag: 'metallic texture', labels: <String, String>{
        'zh-CN': '金属质感',
        'zh-TW': '金屬質感',
        'en-US': 'Metallic texture',
        'ja-JP': '金属質感',
        'ko-KR': '금속 질감'
      }),
      RandomCustomTagEntry(tag: 'glass texture', labels: <String, String>{
        'zh-CN': '玻璃质感',
        'zh-TW': '玻璃質感',
        'en-US': 'Glass texture',
        'ja-JP': 'ガラス質感',
        'ko-KR': '유리 질감'
      }),
      RandomCustomTagEntry(tag: 'wet surface', labels: <String, String>{
        'zh-CN': '湿润表面',
        'zh-TW': '濕潤表面',
        'en-US': 'Wet surface',
        'ja-JP': '濡れた表面',
        'ko-KR': '젖은 표면'
      }),
      RandomCustomTagEntry(tag: 'reflections', labels: <String, String>{
        'zh-CN': '反射质感',
        'zh-TW': '反射質感',
        'en-US': 'Reflections',
        'ja-JP': '反射',
        'ko-KR': '반사'
      }),
      RandomCustomTagEntry(tag: 'glossy', labels: <String, String>{
        'zh-CN': '高光泽',
        'zh-TW': '高光澤',
        'en-US': 'Glossy',
        'ja-JP': '光沢感',
        'ko-KR': '광택'
      }),
      RandomCustomTagEntry(tag: 'matte', labels: <String, String>{
        'zh-CN': '哑光质感',
        'zh-TW': '霧面質感',
        'en-US': 'Matte',
        'ja-JP': 'マット質感',
        'ko-KR': '무광 질감'
      }),
    ],
  ),
  RandomCustomTagCategory(
    id: 'stylization',
    labels: <String, String>{
      'zh-CN': '风格化方向',
      'zh-TW': '風格化方向',
      'en-US': 'Stylization',
      'ja-JP': 'スタイル方向',
      'ko-KR': '스타일화'
    },
    tags: <RandomCustomTagEntry>[
      RandomCustomTagEntry(tag: 'realistic', labels: <String, String>{
        'zh-CN': '写实',
        'zh-TW': '寫實',
        'en-US': 'Realistic',
        'ja-JP': 'リアル',
        'ko-KR': '사실적'
      }),
      RandomCustomTagEntry(tag: 'semi-realistic', labels: <String, String>{
        'zh-CN': '半写实',
        'zh-TW': '半寫實',
        'en-US': 'Semi-realistic',
        'ja-JP': 'セミリアル',
        'ko-KR': '반실사'
      }),
      RandomCustomTagEntry(tag: 'stylized', labels: <String, String>{
        'zh-CN': '强风格化',
        'zh-TW': '強風格化',
        'en-US': 'Stylized',
        'ja-JP': 'スタイライズ',
        'ko-KR': '스타일화'
      }),
      RandomCustomTagEntry(tag: 'anime style', labels: <String, String>{
        'zh-CN': '动漫风格',
        'zh-TW': '動漫風格',
        'en-US': 'Anime style',
        'ja-JP': 'アニメ風',
        'ko-KR': '애니메이션 스타일'
      }),
      RandomCustomTagEntry(tag: 'manga style', labels: <String, String>{
        'zh-CN': '漫画风格',
        'zh-TW': '漫畫風格',
        'en-US': 'Manga style',
        'ja-JP': '漫画風',
        'ko-KR': '만화 스타일'
      }),
      RandomCustomTagEntry(tag: 'chibi', labels: <String, String>{
        'zh-CN': 'Q 版比例',
        'zh-TW': 'Q 版比例',
        'en-US': 'Chibi',
        'ja-JP': 'ちびキャラ',
        'ko-KR': '치비'
      }),
      RandomCustomTagEntry(tag: 'minimalist', labels: <String, String>{
        'zh-CN': '极简主义',
        'zh-TW': '極簡主義',
        'en-US': 'Minimalist',
        'ja-JP': 'ミニマリスト',
        'ko-KR': '미니멀리즘'
      }),
      RandomCustomTagEntry(tag: 'maximalist', labels: <String, String>{
        'zh-CN': '极繁主义',
        'zh-TW': '極繁主義',
        'en-US': 'Maximalist',
        'ja-JP': 'マキシマリスト',
        'ko-KR': '맥시멀리즘'
      }),
      RandomCustomTagEntry(tag: 'art nouveau', labels: <String, String>{
        'zh-CN': '新艺术风格',
        'zh-TW': '新藝術風格',
        'en-US': 'Art Nouveau',
        'ja-JP': 'アール・ヌーヴォー',
        'ko-KR': '아르 누보'
      }),
      RandomCustomTagEntry(tag: 'futuristic', labels: <String, String>{
        'zh-CN': '未来主义',
        'zh-TW': '未來主義',
        'en-US': 'Futuristic',
        'ja-JP': '未来的',
        'ko-KR': '미래적'
      }),
    ],
  ),
];

final randomCustomTagValues = randomCustomTagLibrary
    .expand((category) => category.tags)
    .map((entry) => entry.tag.toLowerCase())
    .toSet();

int get randomCustomTagCount => randomCustomTagLibrary.fold(
      0,
      (total, category) => total + category.tags.length,
    );

bool matchesRandomCustomTagSearch(
  RandomCustomTagCategory category,
  RandomCustomTagEntry entry,
  String language,
  String query,
) {
  final needle = query.trim().toLowerCase();
  if (needle.isEmpty) return true;
  final haystack = <String>[
    entry.tag,
    ...entry.labels.values,
    category.id,
    ...category.labels.values,
    entry.label(language),
  ].join('\n').toLowerCase();
  return haystack.contains(needle);
}
