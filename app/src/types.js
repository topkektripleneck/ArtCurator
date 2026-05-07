/**
 * @typedef {Object} Relationship
 * @property {string} target - The name of the related art movement.
 * @property {string} type - The nature of the relationship (e.g., 'influenced_by', 'child_of').
 * @property {string} [context] - Historical context for the link.
 */

/**
 * @typedef {Object} EraGroup
 * @property {string} label - Display name of the era (e.g., 'Renaissance').
 * @property {[number, number] | null} range - [Start Year, End Year].
 * @property {string} color - Hex color code for visual grouping.
 */

/**
 * @typedef {Object} Movement
 * @property {string} id - Unique slug identifier.
 * @property {string} name - Human-readable name.
 * @property {string} era - Raw era string from the dataset.
 * @property {string} summary - Narrative essay content.
 * @property {Relationship[]} [relationships] - Genealogical connections.
 * @property {string} [image] - Path to the local image asset.
 * @property {string} [key_figures] - Semicolon-delimited list of artists.
 * @property {string} [region] - Primary geographical origin.
 * @property {string} [wikidata_id] - External Wikidata reference.
 * @property {EraGroup} [_era] - Runtime classification data.
 */

export {};
