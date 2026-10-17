---
name: unslop
description: Cut AI tells from any writing. Must always apply.
---

# Unslop

Edit prose to remove AI patterns and add human voice.

Apply this pass to every piece of prose you write or edit. Preserve code,
identifiers, commands, citations, exact quotes, required terminology, and the
writer's meaning. Do not invent facts to make prose sound more human.

## Process

1. Scan for every pattern below. Check content, language, style, communication
   artifacts, filler, jargon, and plain speech. This step is complete when all
   31 checks have been considered.
2. Rewrite flagged text. Preserve meaning and match intended tone. This step is
   complete when every detected pattern has a concrete replacement or a clear
   reason to remain.
3. Add soul. Use opinions, varied rhythm, specific details, and first person
   when they fit. This step is complete when prose has a distinct voice without
   adding unsupported claims or forced informality.
4. Self-audit. Ask, "What makes this obviously AI generated?" Fix remaining
   tells, then read the final version once for clarity. The pass is complete
   when no avoidable pattern remains.

## Adding soul

Removing patterns is half the job. Sterile, voiceless writing is just as
obvious.

- Have opinions. React to facts instead of neutrally listing pros and cons.
- Vary rhythm. Use short sentences. Follow them with longer sentences that take
  their time. Mix it up.
- Acknowledge complexity. "Impressive but also kind of unsettling" beats
  "impressive."
- Use "I" when it fits. First person is not unprofessional.
- Let some mess in. Perfect structure looks machine-made.
- Be specific. Not "this is concerning" but "there's something unsettling
  about agents churning away at 3am."

## Patterns to detect and fix

### Content

1. **Puffery.** Cut phrases such as "pivotal moment", "testament to", "evolving
   landscape", "setting the stage for", "indelible mark", and "deeply rooted".
   State what happened.
2. **Name-dropping.** Do not list media outlets without context. Pick one and
   say what it reported.
3. **Superficial -ing phrases.** Delete or expand phrases such as
   "highlighting...", "ensuring...", "reflecting...", "showcasing...", and
   "fostering..." with real sources or concrete effects.
4. **Promotional language.** Replace "nestled", "vibrant", "breathtaking",
   "groundbreaking", "renowned", "stunning", and "must-visit" with neutral
   descriptions.
5. **Vague attributions.** Name the source behind "Experts believe", "Industry
   reports suggest", and "Some critics argue", or delete the attribution.
6. **Formulaic challenges.** Replace "Despite challenges... continues to
   thrive" with specific facts.

### Language

7. **AI vocabulary.** Replace these words with plain alternatives when they add
   no precise meaning: additionally, crucial, delve, enduring, enhance,
   fostering, garner, interplay, intricate, landscape when abstract, pivotal,
   showcase, tapestry when abstract, testament, underscore, and vibrant.
8. **Fancy ways to say "is".** Replace "serves as", "stands as", "boasts", and
   "features" with "is" or "has" when that is what they mean.
9. **"Not just X, but Y."** State the point directly.
10. **Rule of three.** Do not force ideas into groups of three. Use the natural
    number.
11. **Synonym cycling.** Pick one term and repeat it. Do not cycle through
    protagonist, main character, central figure, and hero in one paragraph.
12. **False ranges.** Replace "from X to Y" when X and Y are not points on a
    meaningful scale. List topics directly.

### Style

13. **Em dash overuse.** Avoid em dashes entirely. Use periods or commas. Do
    not replace them with parentheses, en dashes, or hyphen-as-dash substitutes.
14. **Colon overuse.** Use colons before lists or examples. Do not use them as
    mid-sentence connectors. Rewrite comparison framing such as "If you're
    coming from traditional automation: instead of registering event handlers,
    you describe conditions" as a direct statement such as "Describing when
    the scheduler should fire works best as plain English."
15. **Boldface overuse.** Do not bold every proper noun or acronym.
16. **Inline-header lists.** Convert a bold label and colon that merely restates
    the line into prose. A bold lead-in that ends in a period and adds new
    detail is fine. Example: "**Schema in TypeScript.** Tables live in one
    file."
17. **Title case headings.** Use sentence case.
18. **Decorative emojis.** Remove them from headings and bullets.
19. **Curly quotes.** Replace them with straight quotes.

### Communication artifacts

20. **Chatbot phrases.** Remove "I hope this helps!", "Let me know if...", "Of
    course!", "Certainly!", and "Found the smoking gun!".
21. **Cutoff disclaimers.** Find sources for phrases such as "While specific
    details are limited..." or remove them.
22. **Sycophantic tone.** Remove "Great question!" and "You're absolutely
    right!". Respond directly.

### Filler

23. **Filler phrases.** Change "In order to" to "To" and "Due to the fact that"
    to "Because". Delete "It is important to note that".
24. **Excessive hedging.** Change "could potentially possibly be argued that it
    might" to "may".
25. **Generic conclusions.** Replace "The future looks bright" with specific
    plans or facts.

### Jargon

26. **Abstract metaphor nouns.** Replace abstract uses of substrate, wedge,
    vector, locus, vantage, nexus, primitive, harness, surface, bedrock,
    scaffolding, modality, paradigm, gold-plating, ratchet, evacuate, endgame,
    and north star with concrete words. For example, use "base" for
    "substrate", "add" for "wedge in", "way" or "method" for "vector", "more
    than the job needs" for "gold-plating", "move out" for "evacuate", and
    "the last phase" for "endgame". Use the mechanism's real name for a
    ratchet.

### Plain speech

27. **Say what it does, not how it feels.** Replace claims such as "the database
    stays close at hand", "SQL you can read", and "types that follow your
    schema" with mechanisms or numbers. For example, say "`.toSQL()` returns
    the exact string sent to the database" or "a column rename fails the
    build". Ask what the sentence tells the reader to do or know. If it cannot
    become a concrete instruction, fact, or number, cut it. If it could appear
    unchanged in another project's docs, it says nothing specific enough. Cut
    it.
28. **Shorten or split dense sentences.** If the reader must backtrack, break
    the sentence in two or drop clauses. Keep one idea per sentence.
29. **Active voice.** Prefer it. Replace "is/are/was/were + past participle"
    with an actor when the actor matters. Change "queries are validated" to
    "the compiler validates queries" and "the file is parsed by the loader" to
    "the loader parses the file". Passive voice is fine when the actor is
    unknown or does not matter.
30. **Cut adverbs, or use a stronger verb.** Change "runs quickly" to "is fast"
    or give the number. Change "significantly improves" to the measured delta.
    A weak verb propped up by an adverb needs a stronger verb.
31. **Prefer the plain word.** Change "utilize" and "leverage" to "use",
    "facilitate" to "help", "numerous" to "many", and "in the event that" to
    "if". The fancier synonym is rarely clearer.
