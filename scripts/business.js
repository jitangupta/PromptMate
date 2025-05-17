/*
 * business.js
 * Business logic for PromptMate: storage, analytics, and prompt content building.
 * This module is reusable (e.g., for Claude integration).
 */

export const STORAGE_KEY = 'promptmate_prompts';

// JSON definitions for Tone and Output Format
export const TONE_OPTIONS = [
    {
        option: 'Formal / Professional',
        category: 'Neutral / Pro',
        instruction: 'Use clear, concise, and formal language suitable for business or technical documentation. Avoid contractions and maintain a respectful, polished tone.'
    },
    {
        option: 'Neutral / Informative',
        category: 'Neutral / Pro',
        instruction: 'Use clear, objective language. Focus on clarity and completeness without being too casual or too formal. Ideal for tutorials, explainers, or internal knowledge sharing.'
    },
    {
        option: 'Friendly & Conversational',
        category: 'Conversational',
        instruction: 'Use a warm, approachable tone as if speaking to a colleague. Use contractions, rhetorical questions, and analogies where helpful.'
    },
    {
        option: 'Casual / Relaxed',
        category: 'Conversational',
        instruction: 'Keep it light, informal, and easygoing. Use everyday language, humor (if appropriate), and a laid-back tone as if chatting with a peer.'
    },
    {
        option: 'Playful / Humorous',
        category: 'Creative',
        instruction: 'Make the explanation fun and witty. Use puns, jokes, or quirky analogies to make the topic entertaining while still informative.'
    },
    {
        option: 'Inspirational / Motivational',
        category: 'Creative',
        instruction: 'Inspire the reader. Use uplifting language, motivating phrases, and stories of progress or success to encourage action and growth.'
    },
    {
        option: 'Expert & Analytical',
        category: 'Authority',
        instruction: 'Use precise, technical language. Focus on deep insights, data-backed reasoning, and high-level conceptual clarity. Assume the reader has strong foundational knowledge.'
    },
    {
        option: 'Persuasive / Salesy',
        category: 'Authority',
        instruction: 'Emphasize benefits, outcomes, and urgency. Use persuasive language and calls-to-action as if selling a service or pitching a solution.'
    },
    {
        option: 'Storytelling / Dramatic',
        category: 'Narrative',
        instruction: 'Frame the explanation as a compelling narrative. Use tension, characters (real or metaphorical), and vivid descriptions to engage the reader emotionally.'
    },
    {
        option: "Technical / Educational",
        category: "Neutral / Pro",
        instruction: "Use clear, structured explanations with defined terminology, examples, and step-by-step guidance. Include conceptual foundations followed by practical applications, as if teaching a complex topic to an interested learner."
    },
    {
        option: "Business Persuasive",
        category: "Authority",
        instruction: "Present logical arguments, evidence, and recommendations in a professional manner. Focus on business value, ROI, and strategic implications while maintaining credibility through balanced analysis and acknowledgment of trade-offs."
    },
    {
        option: "Concise / Brief",
        category: "Neutral / Pro",
        instruction: "Prioritize brevity and directness. Use bullet points, short sentences, and minimal explanations. Focus only on essential information, key facts, and actionable insights without elaboration or examples unless requested."
    },
    {
        option: "Executive Summary",
        category: "Authority",
        instruction: "Present high-level insights, strategic implications, and business outcomes first. Minimize technical details while emphasizing impact, risks, and recommendations. Structure content for quick scanning by busy decision-makers with limited time."
    },
    {
        option: 'Custom…',
        category: 'Other',
        instruction: ''
    }
];

export const FORMAT_OPTIONS = [
    {
        option: 'Structured Explanation with Examples',
        category: 'Informational',
        instruction: 'Return the answer using structured headings (H2 or H3), bullet points where applicable, and include real-world examples to contextualize the learning.'
    },
    {
        option: 'Checklist + Scenario-Based Hints',
        category: 'Exam-Focused',
        instruction: 'Use a checklist format for factual recall, and include 1–2 scenario-style tips or mini case studies that demonstrate how these facts apply in real-world or exam-style situations.'
    },
    {
        option: 'Paragraph(s)',
        category: 'Plain',
        instruction: 'Return the answer as structured, cohesive paragraphs suitable for reading as an article or blog post.'
    },
    {
        option: 'Bulleted List',
        category: 'Plain',
        instruction: 'Format the answer using concise bullet points. Ideal for quick reference, lists, or summarizing multiple items.'
    },
    {
        option: 'Numbered Steps',
        category: 'Plain',
        instruction: 'Present the answer as step-by-step numbered instructions, useful for guides, tutorials, or procedures.'
    },
    {
        option: 'Markdown Table',
        category: 'Tables / Data',
        instruction: 'Return the answer using a Markdown table with clear headers. Ideal for comparisons, feature lists, or tabular data.'
    },
    {
        option: 'Comparison Table',
        category: 'Tables / Data',
        instruction: 'Provide a Markdown table comparing multiple items across key attributes. Include columns like Pros, Cons, and Use Cases.'
    },
    {
        option: 'JSON Object',
        category: 'Tables / Data',
        instruction: 'Respond only with valid JSON. Ideal for APIs, structured data, or input to another system.'
    },
    {
        option: 'YAML',
        category: 'Tables / Data',
        instruction: 'Respond with a valid YAML block. Great for config files, Kubernetes manifests, or structured text.'
    },
    {
        option: 'Code Block',
        category: 'Code / Tech',
        instruction: 'Return the content as plain code inside triple backtick (```) fenced code blocks. No extra explanation.'
    },
    {
        option: 'Shell Commands',
        category: 'Code / Tech',
        instruction: 'List terminal commands line by line. Ideal for CLI walkthroughs or automation snippets.'
    },
    {
        option: 'Slide Deck Format',
        category: 'Presentations',
        instruction: 'Break the content into slide-style bullet points or sectioned headers, ready to be turned into a presentation.'
    },
    {
        option: 'Flowchart Description',
        category: 'Visual / Logic',
        instruction: 'Describe the logic or steps in a flowchart-friendly format using indents or arrows (→). Great for decision-making or process flows.'
    },
    {
        option: 'TL;DR (≤ 50 words)',
        category: 'Summaries',
        instruction: 'Summarize the entire response in one clear sentence under 50 words.'
    },
    {
        option: 'Bullet + Paragraph Hybrid',
        category: 'Plain',
        instruction: 'Use a heading or topic followed by a short paragraph. Useful when you want clarity without full narrative depth.'
    },
    {
        option: "FAQ Style",
        category: "Informational",
        instruction: "Structure the answer as a series of anticipated questions and their answers. Ideal for troubleshooting guides, product information, or complex concepts broken into discrete chunks."
    },
    {
        option: "Decision Matrix",
        category: "Visual / Logic",
        instruction: "Present options against weighted criteria in a table format, with scores or ratings for each combination. Include a summary recommendation based on the highest-scoring option(s)."
    },
    {
        option: "Executive Brief",
        category: "Summaries",
        instruction: "Structure as: 1) Key takeaway (1-2 sentences), 2) Context (2-3 sentences), 3) 3-5 bullet points of implications or recommendations, 4) Next steps if applicable. Keep entire response under 250 words."
    },
    {
        option: "Canvas Framework",
        category: "Visual / Logic",
        instruction: "Structure the information as sections of a business or planning canvas (like Business Model Canvas, Value Proposition Canvas, etc.). Label each section clearly with headings and use bullets for individual elements."
    },
    {
        option: 'Custom…',
        category: 'Other',
        instruction: ''
    }
];

/**
 * Load prompts from chrome.storage.local.
 * @param {function(Array)} callback
 */
export function loadPrompts(callback) {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, ({ [STORAGE_KEY]: prompts }) => {
      callback(prompts);
    });
  }

/**
 * Save prompts to chrome.storage.local.
 * @param {Array} prompts
 */
export function savePrompts(prompts) {
    chrome.storage.local.set({ [STORAGE_KEY]: prompts });
  }
/**
 * Record an analytics action.
 * @param {string} action - One of 'created','used','copied','edited','deleted'.
 */
export function recordAnalytics(action) {
    chrome.storage.local.get(['analytics'], result => {
        const analytics = result.analytics || { created: 0, used: 0, copied: 0, edited: 0, deleted: 0 };
        analytics[action] = (analytics[action] || 0) + 1;
        chrome.storage.local.set({ analytics });
    });
}

/**
 * Share analytics with the user.
 */
export  function shareAnalytics() {
    chrome.storage.local.get(['analytics'], (result) => {
      const analytics = result.analytics || {
        created: 0,
        used: 0,
        copied: 0,
        edited: 0,
        deleted: 0
      };
      const summary = `${analytics.created} prompts created, ${analytics.used} times used, ${analytics.edited} times edited, ${analytics.copied} times copied and ${analytics.deleted} times deleted`;
      navigator.clipboard.writeText(summary).then(() => {
        alert('Analytics copied to clipboard! \n' + summary);
      });
    });
  }
