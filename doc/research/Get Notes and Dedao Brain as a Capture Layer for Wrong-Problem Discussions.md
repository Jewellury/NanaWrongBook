# Get Notes and Dedao Brain as a Capture Layer for Wrong-Problem Discussions

## Executive answer

The article you shared matches your stated scope almost exactly: it uses **Get笔记**, now referred to there as **得到大脑**, for the capture loop of **photo the wrong problem → append an audio note of the discussion → auto-transcribe and extract key points → accumulate into a knowledge base**. In other words, the most relevant public evidence I could verify for this research is specifically about the capture experience, not about building the knowledge graph or auto-generating exercises. fileciteturn0file0

For **use case A**, my answer is **yes, but only as a human-reviewed capture tray, not as a trusted machine-ingestion source**. The workflow described in your source is plausibly low-friction enough to use immediately for “student photographs wrong problem, uncle asynchronously asks her to verbalize the sticking point,” because it keeps image capture, appended voice discussion, transcript, and summary inside one note object. But I would **not** trust the transcript as gold data for math diagnosis without manual review, especially on spoken Chinese math terms and correction-language like “约分 / 通分 / 进位.” Chinese ASR is known to be vulnerable to homophone and domain-word errors, and even strong Mandarin ASR benchmarks are materially easier than real tutoring talk or meeting-like discussion audio. fileciteturn0file0 citeturn45academia0turn45academia1turn27academia1turn45academia2

For **use case B**, my answer is **strong yes**. Whether or not you adopt this product, the **capture design pattern** is worth borrowing: **one capture object that starts with a picture, allows appended audio after reflection starts, then auto-produces transcript and key points**. That pattern is directly aligned with your future “attribution loop + ASR” direction, while staying separate from the note/knowledge-base/product layer you do not want to imitate. fileciteturn0file0

A key limit of this review is that I could **not** surface a well-indexed official product page, public API page, or public pricing sheet for 得到大脑 during this run. That means the conclusions below are strongest on **workflow fit** and **ASR suitability**, weaker on **export/API/pricing specifics**. Where I could not verify a point directly, I say so plainly rather than guess.

## Product identity and the capture flow that matters here

The best publicly accessible naming evidence in this review is the article you provided, which explicitly describes the tool as **“Get笔记（现在叫‘得到大脑’）”** and then lays out the exact workflow: first photograph the wrong problem into a note; second, append an audio note on the same note and have the child explain how they were thinking; third, let the product auto-transcribe, extract key points, and generate a summary; fourth, place the math wrong-problem notes into a knowledge base for later analysis. fileciteturn0file0

On the producer side, what I could verify independently is that **得到 app** belongs to the **得到** ecosystem associated with **罗振宇**, who is publicly described as the founder of 得到 app. So the safest producer-level description for decision-making is: **得到大脑 appears to sit inside the 得到/罗振宇 ecosystem rather than being an unrelated standalone note app**. I was not able, in this run, to surface a better indexed official corporate product page naming the exact legal operator of 得到大脑 itself. citeturn41search0

That distinction matters because your decision is not “do we like note apps,” but “can this act as a stage-zero capture layer.” On that narrower question, the article’s workflow is well aligned with your current human loop. It is not “scan the page and let AI do everything”; it is **capture the problem, then capture the student’s narrated reasoning process**, which is exactly the part you care about preserving for Newman-style follow-up and later diagnosis. fileciteturn0file0

In practical interaction terms, the capture loop described publicly is roughly:

1. take a photo and create a note;
2. append an audio note to the existing note;
3. wait for auto-transcription, key-point extraction, and summary.

That is a genuinely small number of user actions for a teenage learner and a remote family member working asynchronously. The crucial strength is not “AI brilliance”; it is that **the picture and the verbal reasoning stay attached to the same artifact**. fileciteturn0file0

## Transcription quality for spoken Chinese math

There is no public math-specific benchmark for 得到大脑 that I could verify, so the responsible way to answer your transcription question is by combining the product’s described behavior with what is known about Chinese ASR. The bottom line is this: **it is probably good enough for gist capture and later human review, but not good enough to trust term-for-term in a math discussion pipeline**. fileciteturn0file0 citeturn45academia0turn45academia1turn45academia2

Why this caution is warranted is fairly clear in the literature. Chinese ASR has a well-known problem with **homophones and polyphones**, and post-correction systems are specifically proposed because raw ASR output often remains error-prone in exactly those settings. Researchers working on Chinese speech understanding also note that extracting semantics from Chinese speech is harder because of those ambiguities, which is one reason entity-aware and post-correction pipelines help. citeturn45academia0turn45academia1

Even strong Mandarin ASR results on benchmark corpora do not remove that concern. One cited system reports character error rates around **4.18% on AISHELL-1** and **5.06% on AISHELL-2**, which is impressive for benchmark speech recognition, but benchmark CER is not the same thing as “accurate enough for tutoring diagnosis on spontaneous student talk.” Real-world discussion audio is typically noisier, less scripted, and more domain-specific than standard ASR test sets. citeturn45academia2

That gap is reinforced by the WenetSpeech work, which explicitly distinguishes more matched internet audio from a harder **meeting** setting. The meeting-style condition is more challenging, and that is the closer analogy to “parent/uncle and child verbally unpack a wrong problem” than clean read speech is. citeturn27academia1

There is also educational evidence that spoken-math explanation is not merely “recognize words.” The Dolphin system for elementary education was built to evaluate spoken responses to math-related verbal-fluency tasks, combining phonological fluency and semantic relevance. That is a good reminder that in your setting, a usable transcript is only the first layer; the real job is reconstructing reasoning, hesitation, and misconception. citeturn27academia2

Applied to your concrete examples, I would expect words like **“约分”**, **“通分”**, and **“进位”** to be recoverable often enough to support later review, but I would not assume perfect stability across children’s speech rate, regional accent, overlapping adult prompts, or oralized symbolic expressions such as “分式”“根号”“这个 3 要约掉”“分母先通一下.” Put bluntly: **good enough to preserve the conversation; not reliable enough to become your golden benchmark without manual correction**. That conclusion is an inference from the literature and the product’s public capture flow, not from a vendor-published math-ASR test. fileciteturn0file0 citeturn45academia0turn45academia1turn27academia2turn27academia1

## Export, API, and whether it can feed your Newman prompt tuning

This is the area where the evidence is weakest, and it affects your decision materially.

I could verify from your source that the product produces **transcription, key points, and summaries** attached to the note. That means there is definitely something you would want to export if the app supports it. fileciteturn0file0

What I could **not** verify in this review is a public, well-indexed statement that 得到大脑 supports any of the following:

- export of transcript and summary as **Markdown** or **TXT**;
- batch export suitable for building a test corpus;
- an **open API** or developer platform for programmatic access.

Because I could not verify those points, the operationally safe assumption is: **treat 得到大脑 as a manual capture front end, not as a dependable structured data source**. In other words, if you adopt it tomorrow, adopt it on the assumption that a human may need to copy text out, review it, and normalize it before it enters your Newman prompt debugging or your golden evaluation set.

That has a very direct implication for your A/B decision.

For **A**, the product can still be useful immediately, because stage-zero capture does not require API completeness. You mainly need **one place to preserve photo + discussion + rough transcript**. That it appears able to do. fileciteturn0file0

For **future dataset-building**, though, this should be considered **provisional**, not foundational. If export or API turns out to be weak, the product becomes a temporary notebook rather than a real substrate for evaluation infrastructure. So my recommendation is:

Use it **only if** you are comfortable with a **human QA step** between app output and your internal corpus.

## Privacy, deletion, and pricing

This is the section where I would be most conservative on behalf of the student.

Because I could not surface the product’s privacy policy page or storage statement directly during this review, I cannot responsibly tell you **where exactly the recordings and wrong-problem images are stored**, whether the vendor declares a mainland-only storage region, or how granular the in-app deletion flow is for audio versus note content. That uncertainty is itself important and should count as a negative if the data is sensitive.

What I can say confidently is that, as a Chinese internet product in the 得到 ecosystem, the relevant legal baseline is **PRC data law**, especially the **Personal Information Protection Law**. Under the PIPL, individuals have rights to know, decide, access and copy, correct, and request deletion/erasure of their personal information; consent can also be revoked. Chinese law also requires separate consent in some sensitive-data situations, and Chinese online services commonly operate under phone-based real-name registration structures. citeturn48search0turn48search4

That means your privacy test before adoption should be very concrete:

- Does the in-app policy explicitly say what happens to **voice recordings**, **transcripts**, **photos**, and **AI-generated summaries**?
- Can each of those be **deleted independently**, or only the whole note?
- Is there any statement about whether app content is used for **model training**, product improvement, or third-party processing?
- Is there a user-facing route to **export before deletion**?
- Does the account rely on a **phone number** and, if so, is there any child/minor guidance?

Those are not academic questions; under the legal baseline, the user should have meaningful control. If the product does not make those controls visible, I would treat that as a privacy red flag for a high-school learner’s error history and voice data. citeturn48search0turn48search4

On **free quota and pricing**, I could not verify a current public price sheet or indexed pricing page for 得到大脑 in this run. So I cannot responsibly quote a 2026 free tier or subscription amount. The practical takeaway is not “it is cheap” or “it is expensive”; it is that **pricing is unverified**, so if you pilot it, you should pilot it with the assumption that you may discover paywalls on transcription volume, AI summaries, or knowledge-base features only inside the app.

## Alternatives and what they imply for your decision

Among the alternatives you named, the one I could document most solidly from accessible public sources in this review is **飞书妙记**. Within Feishu’s broader collaboration suite, Feishu publicly describes **妙记** as supporting intelligent transcription of cloud-recorded audio/video, generating searchable text, and even allowing users to upload audio/video for transcription; Feishu also sits inside a mature docs/cloud collaboration product and advertises an extensive compliance posture. citeturn46search0turn44search0

That makes Feishu Minutes a credible **ASR-first fallback** if your top priority becomes **cleaner transcript handling and easier reuse inside docs/knowledge workflows** rather than “wrong-problem note as a single educational object.” It is, however, a collaboration/work platform first. The reason Get笔记 / 得到大脑 is interesting for you is precisely that the source workflow starts from a **photo of a wrong problem** and then appends reflection audio **to that same note**. Feishu’s documented strengths are on transcription and workspace integration, not on this exact photo-plus-discussion note metaphor. fileciteturn0file0 citeturn46search0turn44search0

So the one-sentence comparison I would use is this:

**If you want the most directly relevant capture ergonomics for “拍题 + 追加录音 + 自动提要点,” 得到大脑 is conceptually closer; if you want a better-documented transcription/workspace stack, 飞书妙记 is the clearer public-source alternative I could verify in this review.** fileciteturn0file0 citeturn46search0turn44search0

I do not want to overstate what I could verify for **通义听悟** and **讯飞听见** in this run. They remain sensible tools to test if you decide the bottleneck is pure ASR quality rather than unified note capture, but I was not able here to retrieve equally solid primary documentation for their exact “photo + appended audio + summary on one artifact” behavior.

## Final recommendation for your two decisions

For **A**, my recommendation is:

**Yes, you can use 得到大脑 class tools right now as a no-code stage-zero capture loop, but only with a manual review gate.** The publicly described workflow is unusually well aligned with your immediate need: preserve the wrong-problem image, preserve the child’s narrated thinking, and get a rough transcript/summary with low friction. That makes it useful immediately. But because Chinese ASR on spoken math is not trustworthy enough term-for-term, and because I could not verify export/API behavior, it should be used as a **capture inbox**, not as your final data substrate. fileciteturn0file0 citeturn45academia0turn45academia1turn27academia1turn27academia2

For **B**, my recommendation is even clearer:

**Yes, the capture experience is worth stealing.** The specific UX pattern to copy is: **start from the problem image, let reflection happen as appended voice rather than separate chat, then auto-summarize into reviewable notes**. That pattern supports your P4/co-creator logic and your emotion-adaptive “listen and guide, don’t judge” stance better than a generic meeting recorder does. It is the right thing to borrow even if you never adopt the product itself long-term. fileciteturn0file0

If I had to make the go/no-go call today, I would phrase it this way:

**Go for a short pilot if your goal is immediate low-friction capture. No-go as a long-term upstream data foundation until export/API/privacy details are verified inside the app.** fileciteturn0file0 citeturn48search0turn48search4turn46search0turn44search0