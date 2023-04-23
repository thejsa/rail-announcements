import type { ICustomAnnouncementPaneProps } from '@components/PanelPanes/CustomAnnouncementPane'
import type { ICustomButtonPaneProps } from '@components/PanelPanes/CustomButtonPane'
import Crunker from 'crunker'

export interface IPlayOptions {
  delayStart: number
  customPrefix: string
}

export type OptionsExplanation =
  | IMultiselectOptions
  | ISelectOptions
  | IBooleanOptions
  | INumberOptions
  | ITimeOptions
  | ICustomOptions
  | ICustomNoStateOptions

interface IMultiselectOptions {
  name: string
  type: 'multiselect'
  default: string[]
  options: { title: string; value: string }[]
  onlyShowWhen?: (activeState: Record<string, unknown>) => boolean
}
interface ISelectOptions {
  name: string
  type: 'select'
  default: string
  options: { title: string; value: string }[]
  onlyShowWhen?: (activeState: Record<string, unknown>) => boolean
}
interface IBooleanOptions {
  name: string
  type: 'boolean'
  default: boolean
  onlyShowWhen?: (activeState: Record<string, unknown>) => boolean
}
interface ITimeOptions {
  name: string
  type: 'time'
  default: `${string}:${string}`
  onlyShowWhen?: (activeState: Record<string, unknown>) => boolean
}
interface INumberOptions {
  name: string
  type: 'number'
  default: number
  onlyShowWhen?: (activeState: Record<string, unknown>) => boolean
}

interface ICustomOptions {
  name: string
  type: 'custom'
  component: (props: { activeState?: Record<string, unknown>; onChange: (newVal: any) => void; value: any; [key: string]: any }) => JSX.Element
  props?: Record<string, unknown>
  default: any
  onlyShowWhen?: (activeState: Record<string, unknown>) => boolean
}

interface ICustomNoStateOptions {
  type: 'customNoState'
  component: (props: { activeState: Record<string, unknown>; [key: string]: any }) => JSX.Element
  props?: Record<string, unknown>
  onlyShowWhen?: (activeState: Record<string, unknown>) => boolean
}

export type AudioItem = string | AudioItemObject

export interface AudioItemObject {
  id: string
  opts?: Partial<IPlayOptions>
}

export interface CustomAnnouncementTab {
  name: string
  component: (props: ICustomAnnouncementPaneProps | ICustomButtonPaneProps) => JSX.Element
  props: Omit<ICustomAnnouncementPaneProps, 'name'> | ICustomButtonPaneProps
}

export type CustomAnnouncementButton = {
  label: string
} & (
  | {
      play: () => Promise<void>
      download: () => Promise<void>
      files?: AudioItem[]
    }
  | {
      files: AudioItem[]
    }
)

export interface PluraliseOptions {
  andId: string
  prefix?: string
  finalPrefix?: string
}

export default abstract class AnnouncementSystem {
  /**
   * Display name for the announcement system.
   */
  abstract readonly NAME: string

  /**
   * Internal ID for the announcement system.
   */
  abstract readonly ID: string

  /**
   * The announcement system's file prefix for assembling URLs.
   */
  abstract readonly FILE_PREFIX: string

  /**
   * The announcement system type.
   */
  abstract readonly SYSTEM_TYPE: 'station' | 'train'

  private static readonly SAMPLE_RATE = 44100

  headerComponent(): React.ReactNode {
    return null
  }

  /**
   * Generates a URL for the provided audio file ID.
   */
  generateAudioFileUrl(fileId: string, customPrefix?: string): string {
    return `/audio/${customPrefix || this.FILE_PREFIX}/${this.processAudioFileId(fileId).replace(/\./g, '/')}.mp3`
  }

  /**
   * Plays multiple audio files.
   *
   * Returns a promise which resolves when the last audio file has finished playing.
   *
   * @param fileIds Array of audio files to play.
   * @param download Whether to save the concatenated audio to the device.
   *
   * @returns Promise which resolves when the last audio file has finished playing.
   */
  async playAudioFiles(fileIds: AudioItem[], download: boolean = false): Promise<void> {
    if (fileIds.length === 0) {
      console.warn('No audio files to play.')
      return
    }

    window.__audio = fileIds

    const standardisedFileIds = fileIds.map(fileId => {
      if (typeof fileId === 'string') {
        return { id: fileId }
      } else {
        return fileId
      }
    })

    const crunker = new Crunker({ sampleRate: AnnouncementSystem.SAMPLE_RATE })
    const audio = await this.concatSoundClips(standardisedFileIds)

    if (audio.numberOfChannels > 1) {
      // This is stereo. We need to mux it to mono.

      audio.copyToChannel(audio.getChannelData(0), 1, 0)
    }

    if (download) {
      crunker.download(crunker.export(audio, 'audio/wav').blob, 'announcement')
      window.__audio = undefined
    } else {
      const source = crunker.play(audio)

      return new Promise<void>(resolve => {
        source.addEventListener('ended', () => {
          window.__audio = undefined
          resolve()
        })
      })
    }
  }

  async concatSoundClips(files: AudioItemObject[]): Promise<AudioBuffer> {
    const crunker = new Crunker({ sampleRate: AnnouncementSystem.SAMPLE_RATE })

    const filesWithUris: (AudioItemObject & { uri: string })[] = files.map(file => ({
      ...file,
      uri: this.generateAudioFileUrl(file.id, file?.opts?.customPrefix),
    }))

    const audioBuffers_P = crunker.fetchAudio(...filesWithUris.map(file => file.uri))

    const audioBuffers = (await audioBuffers_P).reduce((acc, curr, i) => {
      if (filesWithUris[i].opts?.delayStart > 0) {
        acc.push(this.createSilence(filesWithUris[i].opts.delayStart))
      }

      acc.push(curr)

      return acc
    }, [])

    return crunker.concatAudio(audioBuffers)
  }

  private createSilence(msLength: number): AudioBuffer {
    const SAMPLE_RATE = 48000
    const msToLength = (ms: number) => Math.ceil((ms / 1000) * SAMPLE_RATE)

    return new AudioContext().createBuffer(1, msToLength(msLength), SAMPLE_RATE)
  }

  /**
   * Processes an audio file ID before playing it.
   *
   * Defaults to the identity function.
   */
  protected processAudioFileId(fileId: string): string {
    return fileId
  }

  readonly customAnnouncementTabs: Record<string, CustomAnnouncementTab> = {}

  /**
   * Takes an array of audio files, and adds an `and` audio file where needed.
   *
   * @example
   * pluraliseAudioItems(['a', 'b', 'c']) // returns ['a', 'b', 'and', 'c']
   *
   * @example
   * pluraliseAudioItems(['a']) // returns ['a']
   *
   * @example
   * pluraliseAudioItems(['a', 'b']) // returns ['a', 'and', 'b']
   *
   * @param items Array of audio files
   * @returns Pluralised array of audio files
   */
  protected pluraliseAudio(items: AudioItem[], delay: number = 0, options: PluraliseOptions = { andId: 'and' }): AudioItem[] {
    items = items
      .map(item => {
        if (typeof item === 'string') {
          return { id: item }
        } else {
          return item
        }
      })
      .map((item, i) => {
        if (items.length - 1 === i) {
          if (options.finalPrefix) {
            item.id = `${options.finalPrefix}${item.id}`

            return item
          }
        } else {
          if (options.prefix) {
            item.id = `${options.prefix}${item.id}`

            return item
          }
        }

        return item
      })

    if (items.length > 1) {
      items.splice(items.length - 1, 0, { id: options.andId, opts: { delayStart: delay } })
      return items
    }

    return items
  }
}
