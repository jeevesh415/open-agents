/**
 * Shared utilities for plan name generation.
 * Plan file creation is handled via sandbox operations to support both
 * local and cloud environments.
 */

// Word lists for generating random plan names
const ADJECTIVES = [
  "giggling",
  "dancing",
  "sleeping",
  "running",
  "jumping",
  "singing",
  "floating",
  "spinning",
  "glowing",
  "buzzing",
  "flying",
  "crawling",
  "bouncing",
  "whistling",
  "humming",
  "drifting",
  "twirling",
  "shimmering",
  "sparkling",
  "flickering",
  "swaying",
  "tumbling",
  "soaring",
  "prancing",
  "skipping",
];

const COLORS = [
  "crimson",
  "azure",
  "golden",
  "silver",
  "coral",
  "violet",
  "emerald",
  "amber",
  "ivory",
  "jade",
  "scarlet",
  "cobalt",
  "copper",
  "indigo",
  "bronze",
  "teal",
  "sage",
  "rust",
  "plum",
  "slate",
];

const ANIMALS = [
  "lark",
  "panda",
  "otter",
  "fox",
  "owl",
  "tiger",
  "dolphin",
  "koala",
  "penguin",
  "rabbit",
  "eagle",
  "salmon",
  "turtle",
  "zebra",
  "falcon",
  "badger",
  "heron",
  "lynx",
  "crane",
  "finch",
  "lemur",
  "marmot",
  "osprey",
  "wombat",
  "quail",
];

function randomElement<T>(array: T[]): T {
  const index = Math.floor(Math.random() * array.length);
  return array[index]!;
}

/**
 * Generate a random plan name in the format "adjective-color-animal"
 */
export function generatePlanName(): string {
  const adjective = randomElement(ADJECTIVES);
  const color = randomElement(COLORS);
  const animal = randomElement(ANIMALS);
  return `${adjective}-${color}-${animal}`;
}
