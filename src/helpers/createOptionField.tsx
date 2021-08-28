import React from 'react'

import type { OptionsExplanation } from '@announcement-data/TrainAnnouncementSystem'

interface OptionFieldOptions {
  onChange: (value: any) => void
  value: any
  key: string
}

export default function createOptionField(optionData: OptionsExplanation, options: OptionFieldOptions): JSX.Element {
  switch (optionData.type) {
    case 'boolean':
      return (
        <label key={options.key}>
          <input type="checkbox" checked={options.value} onChange={e => options.onChange(e.currentTarget.checked)} /> {optionData.name}
        </label>
      )

    case 'multiselect':
      return (
        <label key={options.key}>
          {optionData.name}

          <select
            multiple
            value={options.value}
            onChange={e => options.onChange(Array.from(e.currentTarget.selectedOptions).map(el => el.value))}
          >
            {optionData.options.map(option => (
              <option value={option.value} key={option.value}>
                {option.title}
              </option>
            ))}
          </select>

          <p className="helpText">Select multiple options by holding down the CTRL key while clicking. Do the same to deselect an option.</p>
        </label>
      )

    case 'select':
      return (
        <label key={options.key}>
          {optionData.name}

          <select value={options.value} onChange={e => options.onChange(e.currentTarget.value)}>
            {optionData.options.map(option => (
              <option value={option.value} key={option.value}>
                {option.title}
              </option>
            ))}
          </select>
        </label>
      )
  }
}