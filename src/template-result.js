import { AttributePart } from './parts.js';
import { isPromise } from './is.js';

const pool = [];

/**
 * Retrieve TemplateResult instance.
 * Uses an object pool to recycle instances.
 *
 * @param { Template } template
 * @param { Array<any> } values
 * @returns { TemplateResult }
 */
export function templateResult(template, values) {
  let instance = pool.pop();

  if (instance) {
    instance.template = template;
    instance.values = values;
  } else {
    instance = new TemplateResult(template, values);
  }

  return instance;
}

/**
 * Determine whether "result" is a TemplateResult
 *
 * @param { TemplateResult } result
 * @returns { boolean }
 */
export function isTemplateResult(result) {
  return result instanceof TemplateResult;
}

/**
 * A class for consuming the combined static and dynamic parts of a lit-html Template.
 * TemplateResults
 */
class TemplateResult {
  /**
   * Constructor
   *
   * @param { Template } template
   * @param { Array<any> } values
   */
  constructor(template, values) {
    this.template = template;
    this.values = values;
    this.index = 0;
  }

  /**
   * Consume template result content.
   * *Note* that instances may only be read once,
   * and will be destroyed upon completion.
   *
   * @param { boolean } deep - recursively read nested TemplateResults
   * @returns { any }
   */
  read(deep) {
    let buffer = '';
    let chunk, chunks;

    while ((chunk = this.readChunk()) !== null) {
      if (typeof chunk === 'string') {
        buffer += chunk;
      } else {
        if (chunks === undefined) {
          chunks = [];
        }
        buffer = reduce(buffer, chunks, chunk, deep);
      }
    }

    if (chunks !== undefined) {
      chunks.push(buffer);
      return chunks.length > 1 ? chunks : chunks[0];
    }

    return buffer;
  }

  /**
   * Consume template result content one chunk at a time.
   * *Note* that instances may only be read once,
   * and will be destroyed when the last chunk is read.
   *
   * @returns { any }
   */
  readChunk() {
    const isString = this.index % 2 === 0;
    const index = (this.index / 2) | 0;

    if (!isString && index >= this.template.strings.length - 1) {
      destroy(this);
      return null;
    }

    this.index++;

    if (isString) {
      return this.template.strings[index];
    }

    const part = this.template.parts[index];
    let value;

    if (part instanceof AttributePart) {
      // AttributeParts can have multiple values, so slice based on length
      // (strings in-between values are already stored in the instance)
      if (part.length > 1) {
        value = part.getValue(this.values.slice(index, index + part.length));
        this.index += part.length;
      } else {
        value = part.getValue([this.values[index]]);
      }
    } else {
      value = part.getValue(this.values[index]);
    }

    return value;
  }
}

/**
 * Commit "chunk" to string "buffer".
 * Returns new "buffer" value.
 *
 * @param { string } buffer
 * @param { Array<any> } chunks
 * @param { any } chunk
 * @param { boolean } [deep]
 * @returns { string }
 */
function reduce(buffer, chunks, chunk, deep = false) {
  if (typeof chunk === 'string') {
    buffer += chunk;
    return buffer;
  } else if (isTemplateResult(chunk)) {
    if (deep) {
      return reduce(buffer, chunks, chunk.read(deep), deep);
    } else {
      chunks.push(buffer, chunk);
      return '';
    }
  } else if (Array.isArray(chunk)) {
    return chunk.reduce((buffer, chunk) => reduce(buffer, chunks, chunk), buffer);
  } else if (isPromise(chunk)) {
    chunks.push(buffer, chunk);
    return '';
  }
}

/**
 * Destroy the TemplateResult instance,
 * returning it to the object pool
 */
function destroy(result) {
  result.values.length = 0;
  result.values = null;
  result.template = null;
  result.index = 0;
  pool.push(result);
}
