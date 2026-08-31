import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "shared", "random-custom-tag-library.json");
const targetPath = path.join(
  root,
  "mobile",
  "lib",
  "artist",
  "random_custom_tag_library.dart",
);
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const locales = ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"];

const dartString = (value) => `'${String(value)
  .replaceAll("\\", "\\\\")
  .replaceAll("'", "\\'")
  .replaceAll("\r", "\\r")
  .replaceAll("\n", "\\n")}'`;

const labels = (value) => `<String, String>{${locales
  .map((locale) => `${dartString(locale)}: ${dartString(value[locale])}`)
  .join(", ")}}`;

const visualStyleCategoryIds = new Set([
  "quality", "render3d", "medium", "lighting", "color", "texture", "stylization",
]);
const filteredCategories = source.categories.filter((category) => visualStyleCategoryIds.has(category.id));

const categories = filteredCategories.map((category) => `  RandomCustomTagCategory(
    id: ${dartString(category.id)},
    labels: ${labels(category.labels)},
    tags: <RandomCustomTagEntry>[
${category.tags.map((entry) => `      RandomCustomTagEntry(tag: ${dartString(entry.tag)}, labels: ${labels(entry.labels)}),`).join("\n")}
    ],
  ),`).join("\n");

const output = `// GENERATED FILE — edit shared/random-custom-tag-library.json, then run
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
${categories}
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
  ].join('\\n').toLowerCase();
  return haystack.contains(needle);
}
`;

await writeFile(targetPath, output, "utf8");
console.log(`Generated ${path.relative(root, targetPath)} from ${filteredCategories.length} visual-style categories.`);
