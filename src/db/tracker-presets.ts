import { createTracker, createTrackerField, getTrackers } from './trackers'

interface FieldPreset {
  name: string
  field_type: string
  required?: number
  list_values?: string[]
  range_min?: number
  range_max?: number
}

interface TrackerPreset {
  name: string
  description: string
  color: string
  fields: FieldPreset[]
}

// Future: load these from a user-editable JSON file (presets.json in app data dir)
export const BUILTIN_PRESETS: TrackerPreset[] = [
  {
    name: 'Medications',
    description: 'Track daily medication',
    color: '#a6e3a1',
    fields: [
      { name: 'Taken', field_type: 'boolean', required: 1 },
      { name: 'Time', field_type: 'datetime', required: 0 },
      { name: 'Notes', field_type: 'text_short', required: 0 },
    ],
  },
  {
    name: 'Mood',
    description: 'Daily mood and energy check-in',
    color: '#cba6f7',
    fields: [
      { name: 'Mood', field_type: 'list', required: 1, list_values: ['Awful', 'Bad', 'Meh', 'Okay', 'Good', 'Great'] },
      { name: 'Energy', field_type: 'integer', required: 0, range_min: 1, range_max: 10 },
      { name: 'Notes', field_type: 'text_short', required: 0 },
    ],
  },
  {
    name: 'Sleep',
    description: 'Sleep quality and duration',
    color: '#89dceb',
    fields: [
      { name: 'Hours', field_type: 'number', required: 1, range_min: 0, range_max: 24 },
      { name: 'Quality', field_type: 'list', required: 0, list_values: ['Poor', 'Fair', 'Good', 'Great'] },
    ],
  },
  {
    name: 'Triggers',
    description: 'Log triggering events and response',
    color: '#f38ba8',
    fields: [
      { name: 'Trigger', field_type: 'text_short', required: 1 },
      { name: 'Intensity', field_type: 'integer', required: 0, range_min: 1, range_max: 10 },
      { name: 'Response', field_type: 'list', required: 0, list_values: ['Grounded', 'Dissociated', 'Switched', 'Managed', 'Needed help'] },
      { name: 'Notes', field_type: 'text_long', required: 0 },
    ],
  },
]

export async function seedTrackerPresets(): Promise<void> {
  const existing = await getTrackers(true)
  if (existing.length > 0) return  // only seed on empty

  for (const preset of BUILTIN_PRESETS) {
    const id = await createTracker(preset.name, preset.description, preset.color)
    for (const field of preset.fields) {
      await createTrackerField(id, field.name, field.field_type, {
        required: field.required ?? 0,
        listValues: field.list_values ? JSON.stringify(field.list_values) : null,
        rangeMin: field.range_min ?? null,
        rangeMax: field.range_max ?? null,
      })
    }
  }
}
