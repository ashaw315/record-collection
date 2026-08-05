/**
 * One declaration per manageable resource. The /manage screen renders all of
 * them through the same table and the same inline row — adding a resource is an
 * entry here, not a new page.
 *
 * Field order is display order. `mono: true` marks values where character-level
 * accuracy matters (catalog numbers, matrix runouts, Discogs ids) and is a
 * legibility decision, not decoration.
 */

export type FieldKind = 'text' | 'number' | 'boolean';

export type FieldSpec = {
  name: string;
  label: string;
  kind: FieldKind;
  /** Shown in the table. Others appear only in the edit form. */
  inTable?: boolean;
  /** Rendered in the mono face — identifiers, not prose. */
  mono?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Width hint for the table column. */
  width?: string;
};

export type ResourceSpec = {
  /** URL segment: /api/<key>. */
  key: string;
  label: string;
  /** Singular, for messages and the create row. */
  singular: string;
  fields: FieldSpec[];
  sortFields: string[];
  /** Resources whose rows the API refuses to delete when built in. */
  hasSeeded?: boolean;
  /** Rendered by the hierarchy editor rather than the flat table. */
  hierarchical?: boolean;
};

const NAME: FieldSpec = {
  name: 'name',
  label: 'Name',
  kind: 'text',
  inTable: true,
  required: true,
  placeholder: 'Name',
};

export const RESOURCES: ResourceSpec[] = [
  {
    key: 'artists',
    label: 'Artists',
    singular: 'artist',
    sortFields: ['name', 'formedYear', 'createdAt'],
    fields: [
      NAME,
      { name: 'formedYear', label: 'Formed', kind: 'number', inTable: true, mono: true, width: '6rem' },
      { name: 'originCountry', label: 'Country', kind: 'text', inTable: true, width: '8rem' },
      { name: 'discogsArtistId', label: 'Discogs ID', kind: 'number', mono: true },
      { name: 'notes', label: 'Notes', kind: 'text' },
    ],
  },
  {
    key: 'genres',
    label: 'Genres',
    singular: 'genre',
    hierarchical: true,
    sortFields: ['name', 'createdAt'],
    fields: [NAME, { name: 'description', label: 'Description', kind: 'text', inTable: true }],
  },
  {
    key: 'labels',
    label: 'Labels',
    singular: 'label',
    sortFields: ['name', 'createdAt'],
    fields: [
      NAME,
      { name: 'discogsLabelId', label: 'Discogs ID', kind: 'number', inTable: true, mono: true, width: '8rem' },
      { name: 'notes', label: 'Notes', kind: 'text' },
    ],
  },
  {
    key: 'formats',
    label: 'Formats',
    singular: 'format',
    hasSeeded: true,
    sortFields: ['name', 'createdAt'],
    fields: [NAME],
  },
  {
    key: 'stores',
    label: 'Stores',
    singular: 'store',
    sortFields: ['name', 'city', 'createdAt'],
    fields: [
      NAME,
      { name: 'city', label: 'City', kind: 'text', inTable: true, width: '9rem' },
      { name: 'country', label: 'Country', kind: 'text', inTable: true, width: '7rem' },
      { name: 'isFavorite', label: 'Favourite', kind: 'boolean', inTable: true, width: '5rem' },
      { name: 'stateRegion', label: 'State / region', kind: 'text' },
      { name: 'address', label: 'Address', kind: 'text' },
      { name: 'website', label: 'Website', kind: 'text' },
      { name: 'notes', label: 'Notes', kind: 'text' },
    ],
  },
  {
    key: 'tags',
    label: 'Tags',
    singular: 'tag',
    sortFields: ['name', 'createdAt'],
    fields: [NAME],
  },
  {
    key: 'pressings',
    label: 'Pressings',
    singular: 'pressing',
    sortFields: ['catalogNumber', 'yearPressed', 'countryPressed', 'createdAt'],
    fields: [
      {
        name: 'catalogNumber',
        label: 'Catalog no.',
        kind: 'text',
        inTable: true,
        mono: true,
        placeholder: 'ABC-123',
        width: '10rem',
      },
      { name: 'yearPressed', label: 'Year', kind: 'number', inTable: true, mono: true, width: '5rem' },
      { name: 'countryPressed', label: 'Country', kind: 'text', inTable: true, width: '7rem' },
      { name: 'matrixRunout', label: 'Matrix / runout', kind: 'text', inTable: true, mono: true },
      { name: 'pressingPlant', label: 'Plant', kind: 'text' },
      { name: 'colorVariant', label: 'Colour', kind: 'text' },
      { name: 'vinylWeightGrams', label: 'Weight (g)', kind: 'number', mono: true },
      { name: 'discogsReleaseId', label: 'Discogs ID', kind: 'number', mono: true },
      { name: 'isReissue', label: 'Reissue', kind: 'boolean' },
      { name: 'notes', label: 'Notes', kind: 'text' },
    ],
  },
];

export function resourceByKey(key: string): ResourceSpec | undefined {
  return RESOURCES.find((resource) => resource.key === key);
}

export function tableFields(resource: ResourceSpec): FieldSpec[] {
  return resource.fields.filter((field) => field.inTable === true);
}
