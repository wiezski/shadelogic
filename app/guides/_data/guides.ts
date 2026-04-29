/**
 * Homeowner SEO guides.
 *
 * Each guide is structured data (not raw markdown) so the renderer can
 * apply consistent typography and so we don't need a markdown parser
 * dependency. Paragraphs are split for clean spacing; bullets are
 * separate string arrays.
 *
 * Slugs are stable URLs and must not change once indexed by Google.
 */

/**
 * Flexible content block types for guides that need more structure
 * than the legacy opening/body/whereWrong/whenChanges shape allows.
 */
export type GuideBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string; lead?: boolean }
  | { type: "ul"; items: string[] };

export type Guide = {
  slug: string;
  title: string;        // page H1 / display title
  metaTitle: string;    // SEO <title>
  description: string;  // SEO meta description (1–2 sentences)

  // Legacy structured content (used by 9 of the 10 guides). All optional;
  // a guide using `blocks` instead can omit these.
  opening?: string[];    // intro paragraphs (1–2)
  body?: string[];       // main paragraphs (3–6)
  whereWrong?: string[]; // "Where people get this wrong" bullets
  whenChanges?: string[]; // "When this advice changes" bullets

  // New richer block structure. When present, the renderer uses this
  // instead of the legacy fields. Supports h2/h3 headings, paragraphs
  // (optionally lead), and bullet lists in any order.
  blocks?: GuideBlock[];

  // Optional final summary bullets. Rendered under a "Quick summary"
  // heading after the main content.
  summary?: string[];

  // Optional override for the per-guide CTA copy. When omitted, the
  // page uses the default ("Not sure what fits your exact setup?" /
  // "Use the decision tool").
  cta?: { preamble: string; linkText: string };

  related: string[];    // 2–3 related guide slugs
};

export const GUIDES: Record<string, Guide> = {
  "blinds-vs-shades-for-bedrooms": {
    slug: "blinds-vs-shades-for-bedrooms",
    title: "Blinds vs Shades for Bedrooms: What Actually Works at Night",
    metaTitle: "Blinds vs Shades for Bedrooms — What Actually Works at Night",
    description:
      "A practical guide to choosing between blinds and shades for a bedroom — based on what actually goes wrong after thousands of installs, not how it looks in the showroom.",
    blocks: [
      // Intro
      {
        type: "p",
        lead: true,
        text: "Bedrooms are the room people regret their window treatment choice in the most. Not the kitchen, not the living room. The bedroom.",
      },
      {
        type: "p",
        text: "The reason is simple: a window treatment that looks great in a showroom under bright lighting can completely fail you in the eight hours a day you actually need it most. After thousands of installs and years of seeing what people complain about later, the same issues come up — about light, about privacy, about sleep — and almost none of them have anything to do with how the treatment looks.",
      },
      { type: "p", text: "If you want a quick answer:" },
      {
        type: "ul",
        items: [
          "Choose shades if darkness and privacy matter most",
          "Choose blinds if daytime light control matters more than nighttime darkness",
        ],
      },
      {
        type: "p",
        text: "But within shades, there's a big difference. Roller shades — especially blackout rollers — often have large gaps on the sides. That's one of the biggest letdowns people run into. Even with blackout fabric, those gaps can let in a surprising amount of light and affect privacy at night. Cellular (honeycomb) shades have much smaller gaps. Both can use side channels at a premium, but that's an upgrade — not the default.",
      },
      {
        type: "p",
        text: "This guide isn't about aesthetics. It's about whether you can sleep through a 5 AM June sunrise, whether someone walking by at night can see your silhouette, and whether the streetlight outside is going to bother you for the next decade.",
      },

      // The real problem at night
      { type: "h2", text: "The real problem at night" },
      {
        type: "p",
        text: "Most homeowners think about privacy in daylight terms. They picture themselves standing in their bedroom at noon, looking out, and not wanting to be seen. Almost every window treatment handles that. Daylight privacy is rarely the actual problem.",
      },
      { type: "p", text: "The actual problem is night." },
      {
        type: "p",
        text: "The moment your bedside lamp goes on, the physics flips. The inside of your room is now brighter than the outside. Anything you could see out through during the day — sheer fabrics, screen shades, blinds tilted up — neighbors can now see in through, in the opposite direction.",
      },
      {
        type: "p",
        text: "This catches a lot of people off guard. They pick a sheer or \"light-filtering\" fabric because it looked beautiful in the showroom. They install it. They turn on the lamp at night and realize they're standing in a fishbowl until they fully close the shade.",
      },
      {
        type: "p",
        text: "This is the single most common bedroom regret. It's also completely avoidable if you understand the mechanic before you buy.",
      },

      // Why blinds often work
      { type: "h2", text: "Why blinds often work — and where they fall short" },
      {
        type: "p",
        text: "Wood and faux-wood blinds actually work well in a lot of bedrooms. When fully closed, they can make a room fairly dark and provide solid privacy at night.",
      },
      {
        type: "p",
        text: "That said, there are a few realities that show up in real homes:",
      },
      { type: "h3", text: "Light gaps on the sides" },
      {
        type: "p",
        text: "The gaps are usually minimal, especially on a good install. But they're still there. During the day, you won't notice them. At night, if there's a streetlight or a neighbor's light nearby, you can get thin slivers of light coming through.",
      },
      { type: "h3", text: "Slat light leakage" },
      {
        type: "p",
        text: "Even when fully closed, light can pass through where the slats meet and through the route holes. Higher-end products hide this better, but blinds are not a true blackout solution. They get dark — not completely dark.",
      },
      { type: "h3", text: "Bottom rail behavior" },
      {
        type: "p",
        text: "The bottom rail interacting differently from window to window is completely normal, even if the blinds are the same size. Some systems actually tip slightly upward when fully closed, which can reduce light leakage at the bottom. Most people never notice this. A small percentage do.",
      },
      { type: "h3", text: "Stacking and usability" },
      {
        type: "p",
        text: "Blinds stack at the top when raised, and that can take up noticeable glass space on shorter windows. They're also heavier than shades, and even cordless versions can feel a bit cumbersome to raise and lower — especially if furniture is in the way. In practice, blinds are often set once and not adjusted constantly.",
      },

      // What shades do better
      { type: "h2", text: "What shades do better — and where they don't" },
      { type: "h3", text: "Cellular shades (honeycomb)" },
      {
        type: "p",
        text: "Cellular shades solve most of what blinds struggle with in bedrooms.",
      },
      {
        type: "ul",
        items: [
          "Fabric is continuous",
          "Side gaps are smaller than rollers",
          "With blackout fabric, rooms get very dark",
        ],
      },
      {
        type: "p",
        text: "At night, without strong exterior light, a blackout cellular shade makes the room feel very dark. During the day, it's still dark — but you'll notice light at the edges, especially if the sun is hitting the window directly.",
      },
      {
        type: "p",
        text: "Side channels take it further, but they're usually only necessary for:",
      },
      {
        type: "ul",
        items: ["nurseries", "shift workers", "very light-sensitive sleepers"],
      },
      {
        type: "p",
        text: "Cellular shades also offer top-down/bottom-up. You can drop the top of the shade while keeping the bottom up. The upper part of the window exposes for light and a slice of view; the bottom stays private.",
      },
      { type: "h3", text: "Roller shades" },
      {
        type: "p",
        text: "Roller shades are simple and clean — but in bedrooms, they have a specific drawback: side gaps are large.",
      },
      {
        type: "p",
        text: "Even with blackout fabric, those gaps can let in noticeable light and reduce privacy at night. This is one of the most common disappointments with roller shades.",
      },
      { type: "p", text: "They also:" },
      {
        type: "ul",
        items: [
          "do not offer top-down/bottom-up",
          "function in a binary way (up or down)",
          "don't allow for daytime \"see out without being seen\"",
        ],
      },

      // Common mistakes people make
      { type: "h2", text: "Common mistakes people make" },
      {
        type: "ul",
        items: [
          "Picking sheer or light-filtering fabric because it looks good in the showroom",
          "Assuming blackout fabric means zero light",
          "Not accounting for nighttime privacy",
          "Underestimating how much side gaps matter",
          "Choosing aesthetics first and dealing with function later",
        ],
      },

      // What actually works
      { type: "h2", text: "What actually works" },
      {
        type: "p",
        text: "In real homes, these are the solutions that consistently hold up over time:",
      },
      {
        type: "ul",
        items: [
          "Typical bedroom: light-filtering cellular shades are often enough. Blackout is only necessary if you really want a very dark room.",
          "Needs more darkness: blackout cellular shade. Add side channels only if you're very sensitive to light.",
          "Wants daytime visibility: blinds are a good option, but won't fully darken the room.",
          "Street-facing bedroom: cellular with top-down/bottom-up is one of the best setups available.",
          "Maximum darkness: combine layers — blackout shade + blackout drapery.",
          "Drapery note: works well if oversized beyond the window, but not perfect alone.",
          "When in doubt: layer.",
        ],
      },
    ],
    summary: [
      "Bedrooms are about night performance, not daytime looks",
      "Blinds work well but won't fully block light",
      "Cellular shades provide the best balance",
      "Roller shades often disappoint due to side gaps",
      "Blackout is not always necessary",
      "Top-down/bottom-up is extremely useful",
      "Layering is the most reliable solution",
    ],
    cta: {
      preamble: "If you're not sure what fits your exact situation, use the tool:",
      linkText: "Use the Blinds vs Shades Decision Tool",
    },
    related: [
      "window-treatments-privacy-at-night",
      "blackout-vs-room-darkening",
      "are-cellular-shades-worth-it",
    ],
  },

  "window-treatments-privacy-at-night": {
    slug: "window-treatments-privacy-at-night",
    title: "Best window treatments for privacy at night",
    metaTitle: "Best Window Treatments for Privacy at Night",
    description:
      "Most window treatments give you daytime privacy but reverse at night. Here's what actually works once your interior lights come on.",
    opening: [
      "Most window treatments give you daytime privacy. Far fewer give you actual night privacy. The difference comes down to a physics problem most homeowners don't realize until after they've installed the wrong product.",
    ],
    body: [
      "The basic rule: at night, the inside of your house is brighter than the outside. Anything you can see out through during the day reverses — outside-in becomes the easier direction. So a sheer cellular, a screen shade, or a sheer-vane roller all let neighbors see into your lit room until you fully close them.",
      "Best night privacy: blackout cellular shades, room-darkening cellular shades, opaque rollers with a cassette, or solid Roman shades with a privacy liner. These read as solid fabric when down — neighbors see a closed shade, not your silhouette and not the room's lighting fixtures.",
      "Wood blinds and shutters work differently. Tilted up during the day, they block daytime visibility while you can still see down and out — the angle does the work. At night that trick stops working. With interior lights on, neighbors can see lights and shapes through the slat closure gaps. The right play is to fully close them once it's dark.",
      "Drapery alone is not a strong night-privacy product. A heavy lined drapery does most of the work but always leaks at the panel meeting point and the sides. If night privacy is critical, pair drapery with a shade behind it — the shade handles privacy, the drapery handles softness.",
      "Vertical blinds: the \"see out, block in\" trick that works on horizontal blinds doesn't apply. With verticals, if you can see out, they can see in. Closed they're fine; open or tilted they're not. There's no daytime one-way mode the way horizontal slats give you.",
    ],
    whereWrong: [
      "Confusing \"I have privacy from the street during the day\" with \"I have privacy at night.\"",
      "Picking a sheer fabric for a master bedroom because it filters light beautifully — true, but useless once the lamp goes on.",
      "Trusting a \"privacy\" label on a fabric without checking how see-through it is when backlit.",
      "Buying a shade that needs to be fully closed for privacy on a window they want partially closed.",
    ],
    whenChanges: [
      "Window faces a tree line, a fence, or a neighbor 30+ feet away — sheer fabrics may give you all the privacy you actually need.",
      "Upper-floor windows where line-of-sight from below is impossible.",
      "Rooms where you genuinely don't have lights on at night.",
      "Coastal or rural homes with no neighbor visibility.",
    ],
    related: [
      "window-treatments-light-and-privacy",
      "blackout-vs-room-darkening",
      "blinds-vs-shades-for-bedrooms",
    ],
  },

  "window-coverings-block-heat": {
    slug: "window-coverings-block-heat",
    title: "What window coverings block heat best",
    metaTitle: "What Window Coverings Block Heat Best",
    description:
      "Cellular shades — specifically double-cell — outperform every other window treatment on heat blocking. Here's why, and what comes second.",
    opening: [
      "Cellular shades — specifically double-cell with blackout or room-darkening fabric — outperform every other window treatment on heat blocking. The difference is the air pocket structure inside the shade, not the fabric weight.",
    ],
    body: [
      "The honeycomb cells trap a layer of still air between you and the window. That trapped air is what blocks heat transfer in both directions: cold winter air staying outside, summer heat staying outside. Double-cell stacks two layers of trapped air and is meaningfully better than single-cell — on a drafty window, you can feel the difference at the glass within seconds of lowering the shade.",
      "Opacity correlates with insulation. Within cellular shades, blackout fabric beats room-darkening, which beats light-filtering, which beats sheer. So a blackout cellular outperforms a sheer cellular even at the same cell count. If insulation is a real priority, the opacity choice is doing thermal work, not just light-control work.",
      "Beyond cellular: heavy lined drapery adds real thermal resistance, especially when it overlaps the wall around the window. Real wood blinds insulate modestly because wood is a poor heat conductor by material. Faux-wood blinds (PVC) actually conduct heat slightly more than real wood — the material matters even though both look the same from across the room.",
      "Worst at heat blocking: roller shades, screen shades, panel-track shades, vertical blinds, zebra and dual shades. These are single layers of fabric or material with no trapped-air structure. A blackout roller will block light beautifully and keep the room cooler in summer sun, but it won't keep the room warm in winter the way cellular will.",
      "The real-world test: with a double-cell blackout cellular installed on a single-pane or older double-pane window, customers describe being able to feel cold air pour through the window when they raise the shade in the morning, then immediately feel the room equalize when they lower it. That's not a marketing claim — it's a tangible daily experience on drafty windows.",
    ],
    whereWrong: [
      "Believing thick or heavy fabric automatically insulates — fabric weight matters less than structure; a thin honeycomb cellular outperforms heavy drapery on most windows.",
      "Skipping the upgrade from single-cell to double-cell to save $50 — this is the single biggest insulation lever, and you live with it for a decade.",
      "Layering cellular under drapery for heat — works, but the cellular is doing 90% of the work.",
      "Calling any \"blackout shade\" insulating — opacity helps, but only cellular's structure delivers real thermal performance.",
    ],
    whenChanges: [
      "New construction with high-performance double or triple-pane windows — less insulation gain because the window is already strong.",
      "South-facing windows with intense direct summer sun — pair cellular with exterior solar screen or window film for compounded effect.",
      "Windows that are mostly aesthetic and rarely closed — there's no point maxing the insulation on glass that stays exposed.",
      "Mild climates with no temperature extremes — the felt difference is smaller; spend less.",
    ],
    related: [
      "are-cellular-shades-worth-it",
      "roller-vs-cellular-shades",
      "window-treatments-large-windows",
    ],
  },

  "blinds-vs-shades-sliding-doors": {
    slug: "blinds-vs-shades-sliding-doors",
    title: "Blinds vs shades for sliding patio doors",
    metaTitle: "Blinds vs Shades for Sliding Patio Doors",
    description:
      "Sliding doors need side-stacking treatments, not top-lifting ones. Here are the four products that actually work — and why.",
    opening: [
      "Sliding patio doors need a side-stacking treatment, not a top-lifting one. The wrong product turns a door you use daily into an obstacle you reach over and pull down every time you want to step outside.",
    ],
    body: [
      "The reason: a top-lifting shade has to be raised every time you open the door. That means reaching down to the bottom rail and lifting it overhead — slider doors run floor to ceiling, so the lift is more than head height. Wind through the open door catches a partially raised shade and pulls the fabric through the opening, dirtying or damaging it. Motorizing fixes the reach problem but not the wind problem and not the time-delay problem of waiting for a long shade to travel.",
      "The four products that work on a sliding door: vertical cellular shades, panel-track shades, vertical blinds, and drapery. All four side-stack — push the treatment to one side or split it center-open, and the door is clear without lifting anything.",
      "Best insulation on a slider: vertical cellular. Same honeycomb structure as horizontal cellular, oriented vertically. A slider is usually the largest single piece of glass in a house, which means it's also where you lose the most heat in winter. Vertical cellular handles both the slider mechanics and the thermal load.",
      "Cleanest modern look: panel track. Wide flat fabric panels that slide on a ceiling or wall track, sized to cover the full opening. Reads architectural rather than blind-y. Less insulation than vertical cellular, but a stronger aesthetic match for modern interiors.",
      "Lowest cost: vertical blinds. Functional, durable, and they side-stack the way a slider needs. Many homeowners carry an \"apartment cheap\" association with them, which is the reason they show up less in custom installs. Fabric vanes solve the clank but cost meaningfully more and can't go in moisture-prone rooms.",
      "Most decorative: drapery on a track. Side-stacks naturally, adds warmth and softness no shade product matches. Doesn't deliver tight light control on its own — pair it with a vertical cellular or panel track behind for full function.",
    ],
    whereWrong: [
      "Buying horizontal blinds or roller shades for a slider because the rest of the house has them, then never opening the door because the shade is in the way.",
      "Trying to motorize a top-lifting shade to fix the reach problem — solves the lift but not the wind risk.",
      "Inside-mounting a vertical cellular and being annoyed at the visible bottom and side gaps; outside-mount is the standard for this product.",
      "Skipping drapery on a slider because \"drapery is old-fashioned\" — it side-stacks naturally and works beautifully on a door.",
    ],
    whenChanges: [
      "A slider you almost never open (occasional guest-room slider) — top-lifting becomes acceptable.",
      "A slider that's effectively a fixed window architecturally and never used as a door — treat it as a tall window.",
      "A wide opening that isn't a door at all — different rule set; see large windows.",
      "Sliders in extreme low-traffic uses where you accept the operational delay for a specific look.",
    ],
    related: [
      "window-treatments-large-windows",
      "window-treatments-light-and-privacy",
      "are-cellular-shades-worth-it",
    ],
  },

  "blackout-vs-room-darkening": {
    slug: "blackout-vs-room-darkening",
    title: "Blackout vs room darkening shades",
    metaTitle: "Blackout vs Room Darkening Shades — What's the Real Difference",
    description:
      "Room-darkening blocks most light. Blackout blocks nearly all of it. Here's how the difference actually plays out — and who really needs the upgrade.",
    opening: [
      "\"Room-darkening\" blocks most light. \"Blackout\" blocks nearly all of it. The practical difference is in the fabric weave plus what edge hardware you add — and most homeowners don't actually need the upgrade to true blackout.",
    ],
    body: [
      "Room-darkening fabric is a tight weave that lets a small amount of light pass through the fabric itself. The room reads dim, not pitch black. For most adults sleeping at night, that's enough.",
      "Blackout fabric has a coating or backing layer that blocks light through the panel to near zero. With blackout fabric alone — no edge channels — you'll still see about a half-inch of edge light per side on a roller, or about 3/8 inch overall on a cellular, because of the mounting gap inside the window casing.",
      "The upgrade from blackout fabric alone to blackout fabric with side channels closes the edge gap. The room becomes near-total darkness. A faint halo at the headrail edge can remain — visible if you stare in a fully dark room with adjusted eyes, not in normal use.",
      "Who needs true blackout: shift workers sleeping during the day, parents of light-sensitive infants, people with migraine sensitivity, east-facing bedrooms hit by summer sunrise. For those cases, channels are worth the upgrade cost.",
      "Who doesn't: most adult bedrooms. A blackout cellular without channels delivers a noticeably dark room, and the residual edge light isn't perceived during sleep. The \"I need full blackout for my master bedroom\" instinct is mostly overstated — channels are a real upcharge for a barely-perceptible improvement most adults won't notice.",
      "Important caveat: not every product can deliver blackout. Wood blinds, faux blinds, vertical blinds, plantation shutters, zebra/dual shades, screen shades, and sheer-vane rollers — none of these are blackout products by structure. If you need true darkness, your shortlist is cellular blackout or roller blackout with channels. Drapery alone, even with a blackout liner, is not a blackout product.",
    ],
    whereWrong: [
      "Buying blackout fabric without channels and expecting zero light — physically impossible because of the edge gap.",
      "Adding channels to a child's room out of caution when the child sleeps fine in a moderately dark room.",
      "Calling drapery \"blackout\" — drapery alone is not a blackout product, even with a blackout liner.",
      "Buying blackout when room-darkening was the right answer, then noticing how heavy the fabric reads in daylight.",
    ],
    whenChanges: [
      "Day sleepers and night-shift workers — blackout plus side channels is justified.",
      "Newborn nurseries during the first months — blackout, channels are reasonable.",
      "Rooms used as media or projection rooms — blackout helps, channels close the spill on the screen.",
      "Rooms with intense streetlight or motion-sensor light right outside — blackout becomes worth it.",
    ],
    related: [
      "blinds-vs-shades-for-bedrooms",
      "window-treatments-privacy-at-night",
      "are-cellular-shades-worth-it",
    ],
  },

  "are-cellular-shades-worth-it": {
    slug: "are-cellular-shades-worth-it",
    title: "Are cellular shades worth it",
    metaTitle: "Are Cellular Shades Worth It — An Installer's Honest Take",
    description:
      "For most rooms, cellular shades are the lowest-regret window treatment we install. Here's what they actually deliver, and where they fall short.",
    opening: [
      "For most rooms in most homes, yes. Cellular shades are the lowest-regret window treatment we install — they handle insulation, privacy, and light control better than their direct competitors and stack down to almost nothing when raised.",
    ],
    body: [
      "The honeycomb cell structure is the differentiator. Trapped air between the cells does real thermal work: a noticeably warmer room in winter and a cooler one in summer. Double-cell construction does this better than single-cell. On a drafty window, customers feel cold pour off the glass in the morning before the shade is up, then feel the room equalize within seconds of lowering it.",
      "Stack height is small. A 60-inch cellular shade raises into about 3 inches of stack at the top. Wood blinds stack to 8–10 inches at the same height; Roman shades stack to 4–6 inches of folded fabric. If you want the window unobstructed when raised, cellular wins this dimension across the board.",
      "Multiple opacities cover the full range. Sheer cellular for daytime see-out, light-filtering for daytime privacy with diffused light, room-darkening for nighttime use, blackout for nurseries and shift workers. The recommendation depends entirely on the room — you don't have to commit cellular to one personality.",
      "Top-down/bottom-up is a real upgrade. On a bedroom or front-of-house window where you want privacy plus a partial view, dropping the top of the cellular while keeping the bottom up gives both. Worth the upcharge in any room where someone might walk by at chest height — bathrooms, street-level bedrooms, formal living rooms facing the street.",
      "The honest critique: cellular reads modern. In a traditional or formal room, they can feel out of place. They're also a somewhat anonymous-looking product up close — you don't pick them for warmth or texture. You pick them for performance.",
      "Pleated shades — the older, single-layer cousin of cellular — are largely being phased out and don't perform like cellulars do. They look similar from across the room but lack the air pocket. If a quote comes back labeled \"pleated,\" you're not getting cellular performance.",
    ],
    whereWrong: [
      "Picking single-cell to save money on a drafty window where double-cell would have changed how the room feels in winter.",
      "Buying sheer cellular for a bedroom and being surprised at night when interior lights make the room visible from outside.",
      "Skipping TDBU on a bathroom window where lowering the top would solve privacy plus ventilation elegantly.",
      "Trying to use horizontal cellular on a sliding patio door — wrong form factor; vertical cellular is the answer.",
    ],
    whenChanges: [
      "Traditional or period-correct interiors where cellular reads wrong (consider Roman shades or wood blinds).",
      "Bathrooms where natural daylight is more important than insulation (a roller or screen shade may serve better).",
      "Rooms where you want fabric warmth and texture (Roman, woven natural, or drapery).",
      "Sliding patio doors and very wide openings (vertical cellular, not horizontal).",
    ],
    related: [
      "roller-vs-cellular-shades",
      "window-coverings-block-heat",
      "blackout-vs-room-darkening",
    ],
  },

  "window-treatments-light-and-privacy": {
    slug: "window-treatments-light-and-privacy",
    title: "What window treatments let light in but give privacy",
    metaTitle: "Window Treatments That Let Light In and Give Privacy",
    description:
      "The honest answer to the most common request — what works during the day, what fails at night, and how to layer for both.",
    opening: [
      "This is the most common request and the most commonly mishandled one. The honest answer: \"see out and they can't see in\" works during the day and almost never works at night the way customers imagine.",
    ],
    body: [
      "Daytime physics: outside is brighter than inside. Sheer fabrics, light-filtering fabrics, and tilted blind slats let you see through them more clearly than the person outside can see in. That's the daytime \"privacy and light\" trick — and it really does work.",
      "Nighttime reversal: with interior lights on, the room becomes the bright side. Whatever you could see through during the day, neighbors can now see through in the opposite direction. Sheer cellular, sheer roller, screen shades, and tilted wood blinds all stop working as privacy products at night.",
      "The product family that genuinely delivers \"see out, get privacy\" by daytime: horizontal wood blinds, faux blinds, and plantation shutters with tilt. Tilt the slats slightly closed-up — you see down through the slat angle and outside, while neighbors looking from a normal walking height see only the closed slat surface. This is the single trick fabric shades can't replicate.",
      "The product family that delivers soft privacy plus diffused light, day and night, when closed: light-filtering cellular shades. The fabric softens daylight beautifully and reads as a closed shade from outside in any lighting. You give up the see-out part — when the shade is down, you can't see out — but you get the privacy guarantee.",
      "Top-down/bottom-up cellular and Roman shades give you a different tool. Drop the top of the shade while keeping the bottom up. The upper third of the window exposes for light and view; the bottom two-thirds stays private. Strong solution on front-of-house windows, bathrooms, and street-level bedrooms where someone walking by sees only the upper portion.",
      "Layering is the real-world fix when you want both light and night privacy. A sheer or light-filtering shade for daytime softness, plus drapery you can close at night. The shade handles privacy during the day; the drapery handles privacy at night.",
    ],
    whereWrong: [
      "Buying a sheer roller for a master bedroom expecting \"soft privacy\" and being surprised at night.",
      "Picking shutters or wood blinds for the tilt trick, then never using the tilt — they sit fully open or fully closed.",
      "Trying to make screen shades work as a privacy product — screens are glare-control products, not privacy products.",
      "Reading a fabric sample at the store — daylight in a showroom doesn't match nighttime backlit visibility at home.",
    ],
    whenChanges: [
      "Windows with no nighttime line-of-sight (upper floors, distant neighbors, tree-screened lots).",
      "Rooms where you genuinely don't have lights on at night.",
      "Customers who don't care about being seen and just want soft daylight.",
      "Windows facing an enclosed yard or fenced exterior.",
    ],
    related: [
      "window-treatments-privacy-at-night",
      "are-cellular-shades-worth-it",
      "are-wood-blinds-outdated",
    ],
  },

  "window-treatments-large-windows": {
    slug: "window-treatments-large-windows",
    title: "Best window treatments for large windows",
    metaTitle: "Best Window Treatments for Large Windows",
    description:
      "Large windows split into wide and tall — each has constraints the salesperson rarely volunteers. Here's how to pick a product that actually works.",
    opening: [
      "Large windows split into two categories that drive completely different recommendations: very wide windows (over 8 feet) and very tall windows (floor to ceiling). Each has constraints the salesperson rarely volunteers.",
    ],
    body: [
      "Width over 8 feet, single piece: wood and faux horizontal blinds top out around 8 feet because the headrail mechanism can't carry more weight without sagging or failing. Past 8 feet, you're either splitting into multiple sections (two or three separate units side by side) or moving to a different product entirely.",
      "Single-piece options for wide windows: drapery on a long rod or track (works at almost any width), motorized cellular or Roman shades (motorization is essentially required at scale because cordless lift becomes impractical), panel-track shades (built for very wide openings, side-stacks cleanly), or fabric horizontal blinds like the Hunter Douglas Aria, which goes up to 10 feet single-piece.",
      "Multi-section installs are common and usually fine. A 12-foot-wide window can run as 2 or 3 separate cellular shades on independent headrails, or one continuous headrail covering all sections. Practically identical aesthetically — the choice is mostly cost-driven.",
      "Tall windows (floor to ceiling, 10+ feet of drop): cordless lift becomes a real workout, and the operator has to stretch high to reach the bottom rail. Motorize anything tall. The cost of motorization on a tall shade is small compared to the daily annoyance of operating one manually for 10 years.",
      "Wind on tall openings matters. If the window opens (operable casements, sliders), tall fabric shades can get pulled into the opening when raised. Either don't raise during open-window hours, or motorize and raise/lower deliberately rather than leaving the shade halfway up when a breeze comes through.",
      "Visual scale: a single uninterrupted piece of fabric on a 12-foot window can read surprisingly empty. Multi-section installs with strong vertical breaks often look better than one massive panel. Drapery side panels with a sheer or light-filtering shade between them can break up the space without making the window feel chopped.",
    ],
    whereWrong: [
      "Buying single-piece wood blinds for a 9-foot window because \"they go that big\" — they barely do, and the slats sag in the middle within a year.",
      "Picking cordless lift on a tall shade because it was the standard option — fine on a 36-inch window, miserable on a 90-inch one.",
      "Refusing motorization out of cost reflex on a 12-foot opening — that's the one window in the house where motorization daily justifies itself.",
      "Mounting an open-roll roller directly on a wide window — the bare cylinder reads industrial across a large room; specify a cassette.",
    ],
    whenChanges: [
      "Decorative-only windows on very large openings with no operation — drapery alone with a long rod is the simplest answer.",
      "Wall-of-glass great rooms where the window is a feature — minimal treatment may be the design call; a recessed motorized roller hidden in a pocket disappears entirely.",
      "Sliders that happen to be wide — different rules apply; this is a slider problem, not a wide-window problem.",
      "Architectural windows with shapes (arched tops, octagons) — specialty fabrication, separate process.",
    ],
    related: [
      "blinds-vs-shades-sliding-doors",
      "window-coverings-block-heat",
      "roller-vs-cellular-shades",
    ],
  },

  "roller-vs-cellular-shades": {
    slug: "roller-vs-cellular-shades",
    title: "Roller shades vs cellular shades",
    metaTitle: "Roller Shades vs Cellular Shades — How to Choose",
    description:
      "Roller and cellular shades look similar but perform differently in three ways that matter day to day. Here's how the comparison actually plays out.",
    opening: [
      "Roller and cellular shades look similar from a distance — both are fabric, both raise to a small stack at the top — but they perform differently in three measurable ways that matter day to day.",
    ],
    body: [
      "Side gap (light leak on inside-mount): cellular leaks roughly 3/8 inch overall, so under 3/16 inch on each side. Roller shades leak about 1/2 inch per side, so a full inch of total light gap. At night with interior lights on, the roller's gap is visible at oblique angles; the cellular's barely shows. If you care about clean edge light, this is the dimension that matters most.",
      "Insulation: cellular's honeycomb structure traps still air and meaningfully reduces heat transfer. Double-cell is better than single-cell. Roller shades are a single layer of fabric — they block light but offer minimal thermal insulation. If the room has drafty windows or you want to feel a thermal difference at the glass, cellular wins by a clear margin.",
      "Look and feel: rollers read cleaner and more minimalist. They roll into a tight cylinder at the top, with or without a cassette. Cellulars have a horizontal pleat structure that reads more textured up close. Both are modern; rollers are the more austere of the two.",
      "Top-down/bottom-up: cellular offers TDBU as a real configuration — drop the top while keeping the bottom up for partial-view privacy. Rollers don't offer this. If you want flexibility on a front-of-house or bathroom window, cellular has a tool roller doesn't.",
      "Side-channel upgrade: rollers can take side channels that close the half-inch edge gap and deliver near-blackout. That's the path if you want a sleek roller look with strong light control. Cellular blackout fabric alone usually delivers enough darkness for most adults without needing channels — channels are a smaller value-add on cellular than on roller.",
      "Price: rollers and cellulars overlap heavily at the entry and mid-tier. Premium configurations (motorization, channels, double-cell, sheer-vane) push both higher.",
    ],
    whereWrong: [
      "Picking roller for a drafty window because \"it's modern\" and being surprised the room feels cold in winter.",
      "Picking cellular for a strict-minimalist room and being annoyed by the visible pleat texture up close.",
      "Skipping side channels on a blackout roller in a master bedroom and noticing the edge bleed every night for the next decade.",
      "Comparing fabric samples at the store — they look similar held flat; the structural difference only shows installed.",
    ],
    whenChanges: [
      "Pure aesthetic-driven projects in modern interiors with no insulation concern — roller may be the right call.",
      "Slider patio doors — neither product fits; vertical cellular or panel track is correct.",
      "Rooms where you want fabric warmth without committing to drapery — Roman or woven natural may suit better than either.",
      "Children's rooms where you specifically want sheer-vane or light-filtering behavior with TDBU — cellular wins on configurability.",
    ],
    related: [
      "are-cellular-shades-worth-it",
      "window-coverings-block-heat",
      "blackout-vs-room-darkening",
    ],
  },

  "are-wood-blinds-outdated": {
    slug: "are-wood-blinds-outdated",
    title: "Are wood blinds outdated",
    metaTitle: "Are Wood Blinds Outdated? An Installer's Take",
    description:
      "Wood blinds aren't outdated — they're a classic that doesn't fit every interior. The product they get confused with is the one that actually reads dated.",
    opening: [
      "No. Wood blinds aren't outdated — they're a classic that doesn't fit every interior. The product they often get confused with — vertical blinds — is the one that actually reads dated to most people.",
    ],
    body: [
      "Wood 2-inch horizontal blinds remain one of the most common and lowest-regret window treatments installed today. They give you directional privacy that no fabric shade can match: tilt up during the day to see out and block view in. They take stain or paint authentically. They're durable, repairable, and most customers are happy with them for years after install.",
      "What wood blinds aren't: a modern minimalist statement. If your interior reads contemporary, clean-line, or you want the window to disappear when the shade is up, wood blinds aren't the right product. Their 2-inch slats and 8–10 inches of stack at the top are visually substantial.",
      "Where wood blinds belong: traditional and transitional homes, formal rooms, any space where you want directional privacy plus warm material. Bedrooms, living rooms, dining rooms, home offices — all natural fits. Pair them with drapery panels for a finished traditional look.",
      "Where wood blinds don't belong: bathrooms and steam-heavy kitchens (real wood warps in moisture; choose faux or composite instead), modern minimalist interiors (cellular or roller is a better aesthetic match), and short windows where the 8–10-inch stack consumes a meaningful share of the glass.",
      "Faux-wood and composite blinds are the moisture-tolerant cousins. They look nearly identical from across the room but read plastic up close. For bathrooms, kitchens, kid's rooms, and rentals, faux is the right call. For a primary living space where the look matters at hand distance, real wood pulls ahead.",
      "The product that does read dated: vertical blinds. The \"apartment cheap\" association is real and persistent. Verticals have a legitimate use case on sliding patio doors but they're rarely the right answer for a standard window today.",
    ],
    whereWrong: [
      "Confusing wood blinds with vertical blinds and writing off both.",
      "Putting real wood in a steam-heavy bathroom and being surprised at the warping a year later.",
      "Choosing wood blinds in a modern interior because \"they're classic\" and finding the room reads stuffy.",
      "Skipping the directional-privacy advantage by buying a fabric shade and then wishing they had tilt control.",
    ],
    whenChanges: [
      "Modern minimalist interiors — cellular, roller, or panel track is a better aesthetic match.",
      "High-moisture rooms — faux or composite, not real wood.",
      "Spaces where you want fabric softness — Roman shades, woven naturals, or drapery.",
      "Sliding doors — wood blinds don't work; vertical cellular or panel track is the answer.",
    ],
    related: [
      "window-treatments-light-and-privacy",
      "are-cellular-shades-worth-it",
      "blinds-vs-shades-sliding-doors",
    ],
  },
};

export const ALL_GUIDE_SLUGS: string[] = Object.keys(GUIDES);
