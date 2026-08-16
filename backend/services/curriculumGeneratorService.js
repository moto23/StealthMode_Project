/**
 * Phase 8.5 — deterministic curriculum blueprint generator.
 *
 * Produces a structured, pedagogical scaffold (sections → lessons) derived only
 * from the course's REAL metadata (title/category/level). It is intentionally
 * template-based and dependency-free — it does NOT fabricate external facts,
 * durations, ratings, or media. Durations and videos are filled later from real
 * provider metadata (videoSourceService). Every item is marked `generated` and
 * carries a stable `autoKey` so regeneration is idempotent.
 */

const slugify = (str) =>
  String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// Structural blueprint: section title + the per-lesson "focus" phrases. These
// are learning scaffolding, not claims about the subject.
const BLUEPRINT = [
  {
    section: 'Getting Started',
    lessons: ['Course overview', 'Key concepts and terminology', 'Setting up your workspace'],
  },
  {
    section: 'Core Concepts',
    lessons: ['Fundamentals', 'How it works', 'Common patterns and pitfalls'],
  },
  {
    section: 'Hands-On Practice',
    lessons: ['Building your first example', 'Step-by-step walkthrough', 'Debugging and testing'],
  },
  {
    section: 'Wrap-Up',
    lessons: ['Best practices', 'Recap and next steps'],
  },
];

/**
 * @param {object} course  Mongoose course doc or plain object.
 * @returns {Array} blueprint sections:
 *   [{ title, autoKey, lessons: [{ title, description, autoKey, searchQuery }] }]
 *   `searchQuery` is transient (used by seeding to find a video; not stored).
 */
const generateCurriculum = (course = {}) => {
  const topic = (course.title || 'this course').toString().trim();
  const category = (course.category || '').toString().trim();
  const level = (course.level || '').toString().trim();

  return BLUEPRINT.map((sec) => {
    const sectionAutoKey = slugify(sec.section);
    return {
      title: sec.section,
      autoKey: sectionAutoKey,
      lessons: sec.lessons.map((focus) => {
        const title = `${focus}: ${topic}`;
        return {
          title,
          description: `${focus} for ${topic}${category ? ` (${category})` : ''}.`,
          autoKey: `${sectionAutoKey}--${slugify(focus)}`,
          // Query used to find a legally embeddable educational video.
          searchQuery: [focus, topic, category, level, 'tutorial']
            .filter(Boolean)
            .join(' ')
            .trim(),
        };
      }),
    };
  });
};

module.exports = { generateCurriculum, slugify };
