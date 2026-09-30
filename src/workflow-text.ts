const en={preview:'Open preview',close:'Close preview',region:'Focused inpaint',clearRegion:'Clear region',regionHint:'Select a crop, then paint its mask. The crop is resized to about 1 MP, inpainted and pasted back.',regionLabel:'Focused inpaint region',read:'Read original tags',reverse:'AI reverse',busy:'Reading…',apply:'Apply to inpaint prompt',cancel:'Cancel',prompt:'Original prompt preview',configure:'Configure API'};
type Labels=typeof en;
const table:Record<string,Labels>={
 'en-US':en,
 'zh-CN':{preview:'放大预览',close:'关闭预览',region:'选区超分',clearRegion:'取消选区',regionHint:'框选处理范围，再涂抹蒙版；仅选区放大到约 1 MP 重绘并贴回原图',regionLabel:'局部超分选区',read:'读取原图 Tag',reverse:'AI 反推',busy:'正在读取…',apply:'应用到重绘提示词',cancel:'取消',prompt:'原图提示词预览',configure:'配置 API'},
 'zh-TW':{preview:'放大預覽',close:'關閉預覽',region:'選區超分',clearRegion:'取消選區',regionHint:'框選範圍後塗抹遮罩；選區放大至約 1 MP 重繪並貼回原圖',regionLabel:'局部超分選區',read:'讀取原圖 Tag',reverse:'AI 反推',busy:'正在讀取…',apply:'套用至重繪提示詞',cancel:'取消',prompt:'原圖提示詞預覽',configure:'設定 API'},
 'ja-JP':{preview:'拡大プレビュー',close:'閉じる',region:'範囲を拡大修正',clearRegion:'選択解除',regionHint:'範囲を選びマスクを描画。約1 MPで修正後、元画像に合成します。',regionLabel:'修正範囲',read:'元のタグを読む',reverse:'AI解析',busy:'読み込み中…',apply:'修正プロンプトに適用',cancel:'キャンセル',prompt:'元のプロンプト',configure:'API設定'},
 'ko-KR':{preview:'확대 미리보기',close:'닫기',region:'선택 영역 확대 수정',clearRegion:'선택 해제',regionHint:'영역을 선택하고 마스크를 그리세요. 약 1 MP로 수정한 후 원본에 합성합니다.',regionLabel:'수정 영역',read:'원본 태그 읽기',reverse:'AI 분석',busy:'읽는 중…',apply:'수정 프롬프트에 적용',cancel:'취소',prompt:'원본 프롬프트',configure:'API 설정'},
};
export function workflowText(language:unknown):Labels{return table[String(language??'zh-CN')]??en;}
