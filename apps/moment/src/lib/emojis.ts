export interface EmojiItem {
  name: string;
  value: string;
}

export interface EmojiPack {
  key: string;
  name: string;
  type: "image" | "text";
  display?: "emoji" | "sticker";
  items: readonly EmojiItem[];
}

const FACE_CDN = "https://cdn.jsdmirror.com/gh/vikiboss/face@main/face/apng";

const SUZUME_S5_CDN = "https://stickers.fullyst.com/51780a59-2061-590d-a45f-a6b8965814ab/thumb";
const SUZUME_S5_IDS = [
  "AQADbQUAAjeKAUVy",
  "AQADFwgAAlYZAUVy",
  "AQAD7gYAAjKeAUVy",
  "AQADQwgAAkR4AUVy",
  "AQADtQcAAtNU-URy",
  "AQADHAcAAjtg8URy",
  "AQAD9gUAAhPC-URy",
  "AQADQQgAAuCl-ERy",
  "AQADKAcAAt1D-URy",
  "AQAD2gYAAu2v-URy",
  "AQADRQoAAv918URy",
  "AQADDQcAAvFQ8URy",
  "AQADtwYAAghz8URy",
  "AQADXgkAArGf8ERy",
  "AQADBQYAAtZ1-URy",
  "AQAD_wYAArxD-ERy",
  "AQADtwgAAp418ERy",
  "AQADqAYAArFw-URy",
  "AQAD1gYAAvfZ-URy",
  "AQAD2QgAAmdo8URy",
  "AQADrggAAln9-ERy",
  "AQADswcAAhJZ-URy",
  "AQADMAYAAkDg8URy",
  "AQADiwcAAosWCUVy",
  "AQADywcAAk7B-ERy",
  "AQAD3wUAAm3e8ERy",
  "AQADFwYAAmOK-URy",
  "AQAD1wYAAwn4RHI",
  "AQADGgcAArHc-URy",
  "AQADTwYAArAeAAFFcg",
] as const;

const LINGMENG_HASHES = [
  "cfbdbd866d47de8ef37f4c73aa5364b4",
  "342fa58ca5b4010232de6f0ebf224625",
  "8d7efac910cdb0c961dc96f24b279dec",
  "bc8bc371aa5e6a5e14afa15736675311",
  "7394430369ac2b5d82e2c158bdc61097",
  "358dc6b369092ea3d0f920d7ede4a3b2",
  "f05afd44488f81185dec5615f5d616d6",
  "ed7ad68cc39dfbfc29d1ae40f685ce05",
  "740ce790a865fb0097d165e6425df90b",
  "7f7d077390da6906c03735857693b083",
  "599f3c1e198fe61109db87776c8944f2",
  "fc0b98fe634ff477f969de7d65747839",
  "7528405f261ce4c0fdc9d39e92faadda",
  "4f952579e28b0f5d98126fe3af2d4cbb",
  "064c6b0e6054700f4df8e228c3273cf1",
  "04562d11439262f415c8e48181307232",
  "ba83ed760331d9b5ced6f6ec8033e3a0",
  "4ed5992f9391973057eda98443682820",
  "8bc509d8778f9980ab402b9bbce6b318",
  "398348d8d918c5bf5367f45c573c1790",
  "7bae8f84d1a089bff1baa779ae10d21a",
  "563ef8bab2fcfbeb40416bb5c0ddccbf",
  "7ef91152a2c27cf25de8ce4c95195b0b",
  "f49c0834b528e2767153f43fdd9aa9e2",
  "625e2d72cac16b6278ed58a1795c912b",
  "ef19f0fe8fc867d90ca5235d73ab7c8c",
  "336ace55bf10939e1529367012d974bb",
  "de88b22a6fab3754bf370a40b5c1e6a0",
  "7df122776eac52cd5411c84849f7b0a3",
  "e529aae2ad6b815ccc0322de90bc12b4",
  "c8cb11f2eacd0e0aba3cda3c1b69308f",
  "c3f7d7f397746982e7d1fa35009c65d1",
  "1ee839e3361da5d403678c6d53ce5ee3",
  "0e6d68463131aa4d6d272ad9e72920d5",
  "8be83057870e7da7666369b778a99bd3",
  "93fbb956f3b7b377cd917f1262053864",
  "40dc1557e5d301a18964430288e23f1e",
  "ceb61cbcd9f48ad845be03569ad8b3ec",
  "bd55ab0364bff59848c38b3911061f8c",
  "490c04c6a1f7e807648971001edc02ec",
  "2d39b339055e4cc3625aaa68dbaf3d3f",
  "f9fcddb39b5f8b120ce9bcfe29d78bce",
  "240590af62577e893f79987e499e778b",
  "be2e8154048e1f568353033bfbe8f211",
  "d56c8a69aee172e48800f8c259048185",
  "06bafac1532912348973745ff88609f0",
  "a6275db359e4d311c3d81d17c677429c",
  "9c7c8c886cc2452d06ca51ab9023e5e9",
  "3d0c076de5fe25e93c7ea19eb9555aa2",
  "32d5855475bb0c255a79d564e50209df",
  "706853c7a84f5a82ae1155c9aac57ffa",
  "9b0dcad8afde797a9c55623e63464906",
  "9bfa7a18848965fbe0d8a838545de7f6",
  "ef64c10ef8e16a07a58d83e0ee66da21",
  "954cf2f1aff3f970168dfa22045d4fdd",
  "ac82796bc260fa3111799e767987aaee",
  "3924fea68be4face2cca71320c48aaf6",
  "488c904ac936f04bbdd47f07486d0362",
  "d082308015ebd247852cec5592d1b5d1",
  "31449367a58644485d7a27c42e9db735",
  "7bd9b811aa6decbd28fab5547e58258e",
  "2c986962b8a7182091ea21493cacb894",
  "010204b8313368579b1e2f0543cbb358",
  "c6b3f8eb73645e19f29672407c92dfaa",
] as const;

function numberedItems(urls: readonly string[]): EmojiItem[] {
  return urls.map((value, index) => ({
    name: String(index + 1).padStart(2, "0"),
    value,
  }));
}

const SUZUME_S5_ITEMS = numberedItems(SUZUME_S5_IDS.map((id) => `${SUZUME_S5_CDN}/${id}.webp`));
const LINGMENG_ITEMS = numberedItems(
  LINGMENG_HASHES.map(
    (hash) => `https://gxh.vip.qq.com/club/item/parcel/item/${hash.slice(0, 2)}/${hash}/raw300.gif`,
  ),
);

export const EMOJI_PACKS: readonly EmojiPack[] = [
  {
    key: "face",
    name: "小黄脸",
    type: "image",
    items: [
      ["惊讶", 0],
      ["撇嘴", 1],
      ["色", 2],
      ["发呆", 3],
      ["得意", 4],
      ["流泪", 5],
      ["害羞", 6],
      ["闭嘴", 7],
      ["睡", 8],
      ["大哭", 9],
      ["尴尬", 10],
      ["发怒", 11],
      ["调皮", 12],
      ["呲牙", 13],
      ["微笑", 14],
      ["难过", 15],
      ["酷", 16],
      ["抓狂", 18],
      ["吐", 19],
      ["偷笑", 20],
      ["可爱", 21],
      ["白眼", 22],
      ["傲慢", 23],
      ["困", 25],
      ["惊恐", 26],
      ["流汗", 27],
      ["憨笑", 28],
      ["悠闲", 29],
      ["奋斗", 30],
      ["疑问", 32],
    ].map(([name, id]) => ({ name: String(name), value: `${FACE_CDN}/${id}.png` })),
  },
  {
    key: "suzume5",
    name: "撕梓咩 S5",
    type: "image",
    display: "sticker",
    items: SUZUME_S5_ITEMS,
  },
  {
    key: "lingmeng",
    name: "凌梦",
    type: "image",
    display: "sticker",
    items: LINGMENG_ITEMS,
  },
  {
    key: "kaomoji",
    name: "颜文字",
    type: "text",
    items: [
      { name: "开心", value: "(´▽`)" },
      { name: "大笑", value: "ヽ(°〇°)ﾉ" },
      { name: "害羞", value: "(⁄ ⁄•⁄ω⁄•⁄ ⁄)" },
      { name: "思考", value: "(´･_･`)" },
      { name: "无语", value: "(¬_¬)" },
      { name: "尴尬", value: "(・_・;)" },
      { name: "哭泣", value: "(╥﹏╥)" },
      { name: "生气", value: "(╬ ಠ益ಠ)" },
      { name: "惊讶", value: "Σ(ﾟДﾟ)" },
      { name: "困", value: "(-.-)zzZ" },
      { name: "爱心", value: "(｡♥‿♥｡)" },
      { name: "星星眼", value: "(✧ω✧)" },
      { name: "得意", value: "ヽ(✿ﾟ▽ﾟ)ノ" },
      { name: "耸肩", value: "¯\\_(ツ)_/¯" },
      { name: "无奈", value: "┐(´∀｀)┌" },
      { name: "眨眼", value: "(^_-)" },
      { name: "卖萌", value: "(●'◡'●)" },
      { name: "翻桌", value: "(╯°□°)╯︵ ┻━┻" },
      { name: "躺平", value: "_(:з」∠)_" },
      { name: "加油", value: "ᕙ(⇀‸↼‶)ᕗ" },
    ],
  },
];

export function emojiInputValue(pack: EmojiPack, item: EmojiItem) {
  return pack.type === "image" ? `:${pack.key}_${item.name}:` : item.value;
}
