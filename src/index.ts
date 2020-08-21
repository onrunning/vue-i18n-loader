import webpack from 'webpack'
import { ParsedUrlQuery, parse } from 'querystring'
import { RawSourceMap } from 'source-map'
import JSON5 from 'json5'
import yaml from 'js-yaml'
import fs from 'fs'
import tmp, { DirResult } from 'tmp'
import { LocaleMessages, Locale } from 'vue-i18n'

type VueI18nLoaderOptions = {
  locales?: Locale[]
  fallbackLocale?: Locale
}

const loader: webpack.loader.Loader = function (
  source: string | Buffer,
  sourceMap: RawSourceMap | undefined
): void {
  const options = this.query

  if (this.version && Number(this.version) >= 2) {
    try {
      this.cacheable && this.cacheable()
      this.callback(
        null,
        generateCode(
          source,
          this.resourcePath,
          parse(this.resourceQuery),
          options
        ),
        sourceMap
      )
    } catch (err) {
      this.emitError(err.message)
      this.callback(err)
    }
  } else {
    const message = 'support webpack 2 later'
    this.emitError(message)
    this.callback(new Error(message))
  }
}

function generateCode(
  source: string | Buffer,
  resourcePath: string,
  attrs: ParsedUrlQuery,
  options: VueI18nLoaderOptions
): string {
  const data = convert(source, attrs.lang as string)
  let messages = JSON.parse(data)

  if (attrs.locale && typeof attrs.locale === 'string') {
    messages = Object.assign({}, { [attrs.locale]: messages })
  }
  const messagesString = attrs.lazy
    ? stringifyLazyMessages(resourcePath, messages, options)
    : stringifyMessages(messages)

  return `module.exports = function (Component) {
  Component.options.__i18n = Component.options.__i18n || []
  Component.options.__i18n.push(${messagesString})
  delete Component.options._Ctor
}\n`
}

function convert(source: string | Buffer, lang: string): string {
  const messages = Buffer.isBuffer(source) ? source.toString() : source

  switch (lang) {
    case 'yaml':
    case 'yml':
      const data = yaml.safeLoad(messages)
      return JSON.stringify(data, undefined, '\t')
    case 'json5':
      return JSON.stringify(JSON5.parse(messages))
    default:
      return messages
  }
}

function stringifyMessages(messages: LocaleMessages): string {
  return `'${cleanMessagesString(JSON.stringify(messages))}'`
}

function cleanMessagesString(messagesString: string): string {
  return messagesString
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/\\/g, '\\\\')
    .replace(/\u0027/g, '\\u0027')
}

function stringifyLazyMessages(
  resourcePath: string,
  messages: LocaleMessages,
  options: VueI18nLoaderOptions
): string {
  const filenameMatch = resourcePath.match(/(^|[\\/])([^\\/?]+)(\?|$)/)
  const filename = (filenameMatch || [])[2] || 'locale.json'
  return `JSON.stringify(${generateDynamicRequireString(
    filename,
    messages,
    options
  )})`
}

function generateDynamicRequireString(
  filename: string,
  messages: LocaleMessages,
  options: VueI18nLoaderOptions
): string {
  if (!options.locales || !options.fallbackLocale) {
    throw new Error(
      '[VueI18nLoaderPlugin Error] The options "locales" and "fallbackLocale" are required with lazy loaded files.'
    )
    return ''
  }
  const dir = tmp.dirSync() as DirResult
  const prefix = '__vue-i18n__'

  options.locales.map(locale => {
    const filePath = `${dir.name}/${prefix}${locale}__${filename}`
    const localeSpecificMessages = {
      [locale]: {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore: Type 'undefined' cannot be used as an index type
        ...messages[options.fallbackLocale],
        ...(messages[locale] || {})
      }
    }
    fs.writeFileSync(filePath, JSON.stringify(localeSpecificMessages, null, 2))
  })
  return `require('${dir.name}/${prefix}' + window.__VUE_I18N_CURRENT_LOCALE__ + '__${filename}')`
}

export default loader
