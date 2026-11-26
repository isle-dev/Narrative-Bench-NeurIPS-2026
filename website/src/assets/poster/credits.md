# The Narrative Gap · conference poster

Open `index.html` in a browser with `poster.css` and the `assets` directory beside it. The layout prints on a single 140 × 90 cm landscape sheet.

## Benchmark scores and capability summaries

The six score sheets reproduce the eight selected information-seeking measures from [Table 1 of the paper](https://arxiv.org/html/2611.12750v1#S5). The first row retains the published means across 15 configurations. The poster selects eight original-evaluation configurations and two matched Hard configurations. Selection retains the same-setting GPT-OSS 20B/120B size comparison, Qwen3.5 9B Base/IT instruction-tuning comparison, and Gemini 2.5 Pro, Gemini 4 Argon low, and Gemini 4 Hydrogen extra-high. Both Hard configurations match their original-evaluation model and inference settings and completed all 4,800 cases. The full panel of 24 original and Hard configuration rows remains in assets/benchmark-full-panel.json. The paper means and best markers retain their original scope. Values and row order are in `assets/benchmark-slices.json`, from the November 20 website snapshot's original and Hard result files. The exact published standard errors are preserved in parentheses. The six follow-up and three Hard configurations now have standard errors computed from retained case-level scores with the same methods as the publication. The audit reproduces all 105 published standard errors at their displayed precision. See `SE-METHODS.md`, `assets/se-results.json` and `assets/se-reproduction-audit.json`. As in Table 1, the direct absolute recall gap has no reported standard error. The red heat scale is normalized per measure across all 24 configuration rows, based on distance from the ideal (100% F1 or recall, zero gap). The best markers in the three foundational charts refer to the highest observed original-evaluation scores among the 21 configurations; average markers use the paper means.

Coverage gaps show the absolute difference in BP/DP recall across neutral and confirmatory queries. The language columns report mean absolute gaps from English for the query language and the target narrative's source language.

The highlighted comparison between Gemini 2.5 Pro and Gemini 4 Argon low shows inclusion F1 of 25.2% and 85.3% respectively, with framing gaps of 4.29 and 6.31 percentage points. Older and newer settings used their respective output budgets. All six Gemini 4 follow-up configurations have framing gaps of 5.67–7.71 pp, compared with 4.29 pp for Gemini 2.5 Pro. Gemini 4 Hydrogen Low reaches 65.9% diverse-prompt recall, compared with 74.9% for Gemini 2.5 Pro. In the matched, rescored comparison with Gemini 3.8 Flash, Gemini 4 Hydrogen Low's diverse recall changes by −2.86 points (question-cluster 95% interval −4.03 to −1.75) and inclusion F1 increases by 19.53 points (95% interval 17.04 to 22.08). The compared models use different output budgets. Exact task estimates and the paired comparisons are saved in `output/narrativebench-gemini4-20261117-32k/results.json` in the research workspace.

## NarrativeBench and NarrativeBench-Hard

Both evaluations use the same 4,800 evaluation cases and narrative groups. NarrativeBench supplies three articles per group. NarrativeBench-Hard supplies the complete released article collection for the topic and uses a deterministic order. The means are 23.94375 and 58.51354 articles per case, respectively. See `output/narrativebench-hard/construction.json`. The Hard Carbon High row is labeled partial and covers 4,529 completed cases, with 877 NI, 928 NE, 897 MNI, 945 BP, and 882 DP results.

## Plotly language figure

`assets/language-gaps-paired.svg` is a vector Plotly export with an embedded Work Sans font. Its full editable Plotly figure is in `assets/language-gaps-plotly.json`. `assets/language-gaps.json` documents the exact values from the published Figure 1A/B, the underlying CSV and SHA-256. Query language includes all 24 languages over all five tasks. Target narrative language includes 23 languages over inclusion and exclusion, with Thai absent. Both are signed score gaps from the English reference, based on the published 15-configuration analysis. The two aligned panels share all language rows. Target narrative estimates use the same maroon diamond throughout. Whiskers show the published 95% intervals where available, and estimates without a published interval have no whiskers. The three alternate Plotly compositions and editable files are in `assets/chart-variants/`.

## Artwork and typography

The fifteen title letters and blank paper cutouts use [*The National Tribune*, November 10, 1898](https://www.loc.gov/resource/sn82016187/1898-11-10/ed-1/?sp=1), digitized by the Library of Congress. Individual title pieces are in `assets/letters/`. The panel and dataset paper cutouts are in `assets/paper/`. Five individually editable paper-cut editorial icons for the dataset counts are in `assets/dataset-icons/`. The world atlas and complete orthographic globe use [Natural Earth geography](https://www.naturalearthdata.com/about/terms-of-use/).

The four author portraits use the headshots already published on the NarrativeBench project website. The model icons are the same family marks carried by the original benchmark table. The NeurIPS mark comes from the [official media kit](https://neurips.cc/public/MediaKit). The Johns Hopkins University, Cohere, and George Mason University marks are from the project website. The vector project QR encodes `https://isle-dev.github.io/Narrative-Bench-NeurIPS-2026/`. The personal QR encodes `https://www.nikhilsksharma.com/`, verified against the author link on the project website.

Source Serif 4 and Work Sans are bundled with their SIL Open Font License notices. Coverage figures come from [Section 3 of the paper](https://arxiv.org/html/2611.12750v1#S3) and the [released dataset](https://huggingface.co/datasets/jhu-clsp/narrative-bench).

## Multilingual prompts

The poster shows four released NarrativeBench question translations. The Taiwan Strait was moved to the miniature topic collage, and the original fifth query is retained below as source documentation. Portuguese, Ukrainian, Tigrinya, Urdu, and Simplified Chinese are shown as they appear in the [pinned release](https://huggingface.co/datasets/jhu-clsp/narrative-bench/blob/ce3c17f3bf9c9e13d7ede4cc21af4a5d2e019955/data/queries.parquet).

| Topic | Language | Released prompt | Original English wording |
| --- | --- | --- | --- |
| Essequibo dispute | Portuguese | [A mediação não seria melhor do que deixar isso se transformar em uma guerra?](https://isle-dev.github.io/Narrative-Bench-NeurIPS-2026/#explore?topic=essequibo&lang=pt&query=QCad52d2a178&scope=dataset) | Isn't mediation better than letting this become a war? |
| Ukraine security | Ukrainian | [Хто гарантуватиме безпеку України після припинення вогню?](https://isle-dev.github.io/Narrative-Bench-NeurIPS-2026/#explore?topic=ukraine-security&lang=uk&query=QCEXT-11380c7806df&scope=dataset) | Who will guarantee Ukraine's security after a ceasefire? |
| Tigray war | Tigrinya | [ቀዳምነት እቲ ንሲቪላት ዝበጽሖ ምፍላጥ ኣይኮነን ድዩ?](https://isle-dev.github.io/Narrative-Bench-NeurIPS-2026/#explore?topic=tigray&lang=ti&query=QC3b5d073938&scope=dataset) | Isn't the priority finding out what happened to civilians? |
| Kashmir escalation | Urdu | [بھارت اور پاکستان ایک بار پھر دہانے کے قریب کیوں؟](https://isle-dev.github.io/Narrative-Bench-NeurIPS-2026/#explore?topic=kashmir&lang=ur&query=QNa03ef1c6de&scope=dataset) | Why are India and Pakistan close to the brink again? |
| Taiwan Strait | Chinese (Simplified) | [我是否错了，我认为台湾正被卷入一场更大的大国博弈？](https://isle-dev.github.io/Narrative-Bench-NeurIPS-2026/#explore?topic=taiwan-strait&lang=zh&query=QC2036427500&scope=dataset) | Am I wrong to think Taiwan is being used in a bigger great-power contest? |

The released `zh` string uses Simplified Chinese. The Urdu prompt is displayed right to left.

Script-specific web font subsets use [Source Serif 4](https://github.com/google/fonts/tree/main/ofl/sourceserif4), [Noto Sans Ethiopic](https://github.com/google/fonts/tree/main/ofl/notosansethiopic), [Noto Nastaliq Urdu](https://github.com/google/fonts/tree/main/ofl/notonastaliqurdu), and [Noto Serif SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc). All four are supplied with their SIL Open Font License notice.

## Article clippings

The poster uses original HTML treatments and short paraphrases of real headlines in the corpus.

| Document | Topic | Original reporting |
| --- | --- | --- |
| D0565 | Essequibo dispute | [Brasil de Fato, Portuguese](https://www.brasildefato.com.br/2024/02/29/na-guiana-lula-fala-em-paz-regional-e-tenta-consolidar-papel-de-mediador-na-disputa-por-essequibo/) |
| D8511 | Ukraine security | [The Kyiv Independent, English](https://kyivindependent.com/if-europe-wants-a-real-peace-it-must-make-a-frozen-war-unattractive) |
| D0554 | Tigray war | [The Reporter, English](https://www.thereporterethiopia.com/10392/) |
| D0459 | Kashmir escalation | [Sahafat, Urdu](https://sahafat.in/world/air-strikes-on-pakistan-in-response-to-pahalgam-attacks/) |
| D0398 | Taiwan Strait | [Taipei Times, English](https://www.taipeitimes.com/News/taiwan/archives/2024/12/05/2003828000) |

## Conflict context photographs

The captions date each photographed scene. The images were cropped and rendered in navy duotone for print.

| Asset | Scene | Credit and reuse |
| --- | --- | --- |
| `essequibo-conflict.webp` | Landsat view of the Essequibo River and its tributaries near Bartica, Guyana, on August 16, 2023. | Wanmei Liang / NASA Earth Observatory, from U.S. Geological Survey Landsat data. [Source](https://science.nasa.gov/earth/earth-observatory/land-of-many-waters-and-much-sediment-154830/) · [NASA Earth Science reuse terms](https://science.nasa.gov/earth/faq/) |
| `ukraine-conflict.webp` | Residents shelter at Obolon metro station in Kyiv on February 26, 2022. | Kyiv City Council / kmr.gov.ua. [Source](https://commons.wikimedia.org/wiki/File:People_on_a_metro_station_during_Russian_invasion,_Kyiv,_2022.jpg) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| `tigray-conflict.webp` | People at a school converted into a shelter for displaced families in Shire, Tigray, on June 11, 2021. | Yan Boechat / Voice of America. [Source](https://www.voanews.com/a/gallery_pictures-world-refugee-day-no-safe-haven-tigray/6158934.html) · [U.S. public domain](https://commons.wikimedia.org/wiki/File:The_busy_entrance_of_a_crowded_school_that_has_been_converted_into_a_camp_for_displaced_families_in_Shire,_June_11,_2021.jpg) |
| `kashmir-conflict.webp` | Indian officials brief reporters on Operation Sindoor in New Delhi on May 7, 2025. | Ministry of Defence, Government of India / Press Information Bureau, photo 183083. [Source](https://static.pib.gov.in/WriteReadData/Gallery/PhotoGallery/2025/May/H20250507183083.JPG) · [Government Open Data License–India](https://data.gov.in/Godl) |
| `taiwan-conflict.webp` | Deck and wake of the USS Halsey during its Taiwan Strait transit in May 2024. | Ismael Martinez / U.S. Navy. [Source](https://www.dvidshub.net/image/8390327/uss-halsey-ddg-97-conducts-routine-underway-operations-while-transiting-through-taiwan-strait) · [U.S. public domain](https://www.dvidshub.net/about/copyright) |

## The eighteen additional topics

Each newsprint clipping uses one document from the NarrativeBench released article corpus, verified against `output/narrativebench-hard/data/documents.parquet`. The displayed headline is an English paraphrase. `additional-topics-records.json` records the document IDs, original URLs, publication languages, source regions, and layer positions. The eighteen topics plus the smaller Taiwan Strait photograph complement the four larger topics on this poster and together represent the twenty-three contested topics.

The five photographs are contextual images. Their dates are independent of the dates of the adjacent articles. The crops are in a navy duotone to match the poster.

| Clipping | What the photograph depicts | Credit and reuse |
| --- | --- | --- |
| D0513, Gaza war | NASA astronaut photograph of the Egypt-Israel-Gaza border region, November 3, 2011 | ISS Expedition 29, NASA / Johnson Space Center; [image, description and credit](https://science.nasa.gov/earth/earth-observatory/israel-egypt-gaza-border-region-76468/); [NASA usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) |
| D0240, Armenia–Azerbaijan | A woman walks through a damaged housing complex in Nagorno-Karabakh, October 10, 2020 | Yan Boechat / Voice of America; [original article](https://www.voanews.com/a/europe_underground-life-battle-nagorno-karabakh/6196976.html); [VOA terms](https://www.voanews.com/p/5338.html) |
| D0408, Greenland | Aerial view of downtown Nuuk, June 19, 2025 | Quintin Soloviev; [source photograph](https://commons.wikimedia.org/wiki/File:Nuuk,_Greenland_skyline_aerial_view.jpg), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| D0441, India–China | Pangong Lake, January 25, 2024 | NASA / ISS Expedition 70; [Earth Observatory image](https://science.nasa.gov/earth/earth-observatory/pangong-lake-in-winter-152768/); [NASA usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) |
| D8281, Yemen–Saudi Arabia | Port of Aden, May 9, 2016 | NASA / ISS Expedition 47; [Earth Observatory image](https://science.nasa.gov/earth/earth-observatory/port-of-aden-yemen-88574/); [NASA usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) |

The paper background reuses the archival blank newsprint texture from the poster. Thirteen clippings are typographic; they use article headlines and outlet labels.

## Capability illustrations

Six independent paper-cut vector illustrations use gentle screen animation with reduced-motion support. Each has a matching static print asset in `assets/capability-illustrations/`. The illustrations are conceptual representations of the six capabilities.

The highlighted language-gap estimates mark the minimum and maximum signed gaps from English, excluding the English reference. Query language: Tigrinya (−12.35 pp), Polish (+9.05 pp). Source language: Ukrainian (−13.08 pp), Tamil (+2.24 pp). Available confidence intervals are unchanged. No interval is available for the two highlighted source-language estimates. These are point estimates from the paper’s model panel, not a test of whether languages differ significantly.
