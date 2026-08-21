"""Small reviewed alias set for catalogue roles absent from extracted tables.

These are game-specific proper names and form labels.  Do not replace this
table with generic machine translation.
"""

LANGUAGES = ("zh-CN", "zh-TW", "ja-JP", "ko-KR", "en-US")


def row(zh_cn, zh_tw, ja, ko, en):
    return dict(zip(LANGUAGES, (zh_cn, zh_tw, ja, ko, en)))


def build_manual_names():
    data = {
        "原神": {
            "旅行者-女": row("旅行者（女）", "旅行者（女）", "旅人（女性）", "여행자(여)", "Traveler (F)"),
            "旅行者-男": row("旅行者（男）", "旅行者（男）", "旅人（男性）", "여행자(남)", "Traveler (M)"),
        },
        "崩坏三": {
            "享乐狂宴·邀影": row("享乐狂宴·邀影", "享樂狂宴·邀影", "享楽の狂宴・誘影", "향락•광란의 연회", "Mad Pleasure: Shadowbringer"),
            "月下誓约·予爱以心": row("月下誓约·予爱以心", "月下誓約·予愛以心", "月下の誓い・真紅の愛", "월하의 서약•핏빛 사랑", "Lunar Vow: Crimson Love"),
            "镇×偃月叩晓": row("镇×偃月叩晓", "鎮×偃月叩曉", "镇×偃月叩晓", "镇×偃月叩晓", "镇×偃月叩晓"),
        },
        "异环": {
            "Aurelia": row("奥蕾莉亚", "奧蕾莉亞", "オーレリア", "아우렐리아", "Aurelia"),
            "Daffodill": row("达芙迪尔", "達芙迪爾", "ダフォディル", "대퍼딜", "Daffodill"),
            "Edgar": row("埃德嘉", "埃德嘉", "エドガー", "에드거", "Edgar"),
            "Fadia": row("法蒂亚", "法蒂亞", "ファディア", "파디아", "Fadia"),
            "Haniel": row("哈尼尔", "哈尼爾", "ハニエル", "하니엘", "Haniel"),
            "Hathor": row("哈索尔", "哈索爾", "ハトホル", "하토르", "Hathor"),
            "Jiuyuan": row("九原", "九原", "九原", "구원", "Jiuyuan"),
            "Linko": row("灵可", "靈可", "リンコ", "링코", "Linko"),
            "Sakiri": row("咲里", "咲里", "サキリ", "사키리", "Sakiri"),
            "Zankou": row("残虹", "殘虹", "残虹", "잔홍", "Zankou"),
        },
        "明日方舟": {
            "Amiya_Guard": row("阿米娅（近卫）", "阿米婭（近衛）", "アーミヤ（前衛）", "아미야(근위)", "Amiya (Guard)"),
            "Amiya_Medic": row("阿米娅（医疗）", "阿米婭（醫療）", "アーミヤ（医療）", "아미야(메디카)", "Amiya (Medic)"),
            "Botani": row("伯塔尼", "伯塔尼", "ボタニ", "보타니", "Botani"),
            "Justice Knight": row("正义骑士号", "正義騎士號", "ジャスティスナイト", "저스티스 나이트", "'Justice Knight'"),
            "Ukusik": row("乌啾", "烏啾", "ウクシク", "우쿠시크", "Ukusik"),
            "Viy": row("维伊", "維伊", "ヴィイ", "비이", "Viy"),
        },
        "终末地": {
            "Arcane": row("诀", "訣", "オクギ", "결", "Arcane"),
            "Camille": row("卡缪", "卡繆", "カミーユ", "카뮤", "Camille"),
            "Liino": row("梨诺", "梨諾", "リーノ", "리노", "Liino"),
        },
        "绝区零": {
            "Claret Flint": row("克拉蕾·弗林特", "克拉蕾·弗林特", "クラレッタ・フリンツ", "클라렛·플린트", "Claret Flint"),
            "Roxy Ifrita Pryce": row("洛克茜·伊芙莉塔·普莱斯", "洛克茜·伊芙莉塔·普萊斯", "ロクシー・イフリータ・プライス", "록시·이프리타·프라이스", "Roxy Ifrita Pryce"),
        },
        "蔚蓝档案": {
            "Arisu": row("爱丽丝", "愛麗絲", "アリス", "아리스", "Aris"),
            "Arisu (Battle)": row("爱丽丝（武装）", "愛麗絲（武裝）", "アリス（臨戦）", "아리스(무장)", "Aris (Armed)"),
            "Arisu (Maid)": row("爱丽丝（女仆）", "愛麗絲（女僕）", "アリス（メイド）", "아리스(메이드)", "Aris (Maid)"),
            "Shiroko＊Terror": row("白子＊恐怖", "白子＊TERROR", "シロコ＊テラー", "시로코*테러", "Shiroko*Terror"),
        },
        "鸣潮": {
            "爱弥斯·机兵形态": row("爱弥斯·机兵形态", "愛彌斯·機兵形態", "エイメス・機兵形態", "에이메스·기병 형태", "Aemeath (Mecha Form)"),
            "芙露德莉斯（卡提希娅变身形态）": row("芙露德莉斯（卡提希娅变身形态）", "芙露德莉斯（卡提希婭變身形態）", "フルールドリス（カルテジア変身形態）", "플뢰르드리스(카르테시아 변신 형태)", "Fleurdelys (Cartethyia Transformation)"),
        },
    }

    data["妮姬"] = {
        "Ada Wong": row("艾达·王", "艾達·王", "エイダ・ウォン", "에이다 웡", "Ada Wong"),
        "Aigis": row("埃癸斯", "埃癸斯", "アイギス", "아이기스", "Aigis"),
        "Ark Ranger Black": row("方舟游侠·黑", "方舟遊俠·黑", "アークレンジャー・ブラック", "아크 레인저 블랙", "Ark Ranger Black"),
        "Asuka Shikinami Langley": row("式波·明日香·兰格雷", "式波·明日香·蘭格雷", "式波・アスカ・ラングレー", "시키나미 아스카 랑그레이", "Asuka Shikinami Langley"),
        "Asuka Shikinami Langley - Wille": row("式波·明日香·兰格雷：WILLE", "式波·明日香·蘭格雷：WILLE", "式波・アスカ・ラングレー：WILLE", "시키나미 아스카 랑그레이: WILLE", "Asuka Shikinami Langley: WILLE"),
        "Avistar": row("阿维斯塔", "阿維斯塔", "アビスター", "아비스타", "Avistar"),
        "Chime": row("钟鸣", "鐘鳴", "チャイム", "차임", "Chime"),
        "Chisato Nishikigi": row("锦木千束", "錦木千束", "錦木千束", "니시키기 치사토", "Chisato Nishikigi"),
        "Claire Redfield": row("克莱尔·雷德菲尔德", "克萊爾·雷德菲爾德", "クレア・レッドフィールド", "클레어 레드필드", "Claire Redfield"),
        "E.H": row("E.H.", "E.H.", "E.H.", "E.H.", "E.H."),
        "EVE": row("伊芙", "伊芙", "イヴ", "이브", "EVE"),
        "Jill Valentine": row("吉尔·瓦伦丁", "吉爾·瓦倫丁", "ジル・バレンタイン", "질 발렌타인", "Jill Valentine"),
        "K": row("K", "K", "K", "K", "K"),
        "Kurumi": row("胡桃", "胡桃", "クルミ", "쿠루미", "Kurumi"),
        "Label": row("拉贝尔", "拉貝爾", "ラベル", "레이블", "Label"),
        "Liberalio": row("莉贝雷利奥", "莉貝雷利奧", "リベラリオ", "리버렐리오", "Liberalio"),
        "Lily": row("百合", "百合", "リリー", "릴리", "Lily"),
        "Mari Makinami Illustrious": row("真希波·玛丽·伊兰崔亚斯", "真希波·真理·伊拉絲多莉亞斯", "真希波・マリ・イラストリアス", "마키나미 마리 일러스트리어스", "Mari Makinami Illustrious"),
        "Marian": row("玛丽安", "瑪麗安", "マリアン", "마리안", "Marian"),
        "Mint": row("敏特", "敏特", "ミント", "민트", "Mint"),
        "Misato Katsuragi": row("葛城美里", "葛城美里", "葛城ミサト", "카츠라기 미사토", "Misato Katsuragi"),
        "Nayuta": row("那由多", "那由多", "ナユタ", "나유타", "Nayuta"),
        "Prika": row("普莉卡", "普莉卡", "プリカ", "프리카", "Prika"),
        "Queen (Makoto)": row("新岛真（QUEEN）", "新島真（QUEEN）", "新島真（クイーン）", "니지마 마코토(퀸)", "Queen (Makoto)"),
        "Raven": row("渡鸦", "渡鴉", "レイヴン", "레이븐", "Raven"),
        "Snow Crane": row("白鹤", "白鶴", "スノークレーン", "스노우 크레인", "Snow Crane"),
        "Sora": row("索拉", "索拉", "ソラ", "소라", "Sora"),
        "Takina Inoue": row("井上泷奈", "井上瀧奈", "井ノ上たきな", "이노우에 타키나", "Takina Inoue"),
        "Velvet": row("薇尔维特", "薇爾維特", "ヴェルベット", "벨벳", "Velvet"),
        "Yukiko": row("天城雪子", "天城雪子", "天城雪子", "아마기 유키코", "Yukiko"),
    }

    hsr = data.setdefault("星穹铁道", {})
    hsr.update({
        "Archer": row("Archer", "Archer", "アーチャー", "아처", "Archer"),
        "Archer [game]": row("Archer", "Archer", "アーチャー", "아처", "Archer"),
        "Gilgamesh": row("吉尔伽美什", "吉爾伽美什", "ギルガメッシュ", "길가메시", "Gilgamesh"),
        "Rin Tohsaka": row("远坂凛", "遠坂凜", "遠坂凛", "토오사카 린", "Rin Tohsaka"),
        "Saber": row("Saber", "Saber", "セイバー", "세이버", "Saber"),
        "Saber [game]": row("Saber", "Saber", "セイバー", "세이버", "Saber"),
        "开拓者-女": row("开拓者（女）", "開拓者（女）", "開拓者（女性）", "개척자(여)", "Trailblazer (F)"),
        "开拓者-男": row("开拓者（男）", "開拓者（男）", "開拓者（男性）", "개척자(남)", "Trailblazer (M)"),
    })
    paths = {
        "Destruction": ("毁灭", "毀滅", "壊滅", "파멸"),
        "Elation": ("欢愉", "歡愉", "歓愉", "환락"),
        "Harmony": ("同谐", "同諧", "調和", "화합"),
        "Preservation": ("存护", "存護", "存護", "보존"),
        "Remembrance": ("记忆", "記憶", "記憶", "기억"),
    }
    for gender, localized_gender in (("F", ("女", "女", "女性", "여")), ("M", ("男", "男", "男性", "남"))):
        for path, labels in paths.items():
            key = f"Trailblazer ({gender}) {path}"
            hsr[key] = row(
                f"开拓者（{localized_gender[0]}）·{labels[0]}",
                f"開拓者（{localized_gender[1]}）·{labels[1]}",
                f"開拓者（{localized_gender[2]}）・{labels[2]}",
                f"개척자({localized_gender[3]})·{labels[3]}",
                key,
            )
    return data
