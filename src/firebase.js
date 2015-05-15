'use strict'

import {posix as posixPath} from 'path'
import assert from 'assert'
import last from 'array-last'
import {ServerValue} from 'firebase-server-value'
import clock from './clock'
import Store from './store'
import {isMap} from './map'
import {dispatch} from './events'
import {fromJS as toImmutable} from 'immutable'
import {random as randomEndpoint, parse as parseUrl, format as formatUrl} from './url'

const {join, resolve} = posixPath

export default class MockFirebase {
  static cache = Store.cache
  static clock = clock
  static ServerValue = ServerValue
  constructor (url = randomEndpoint(), root) {
    Object.assign(this, parseUrl(url)) // eslint-disable-line no-undef
    if (this.isRoot) {
      this.store = new Store(this.endpoint).proxy(this)
      this.setData = (data) => {
        data = toImmutable(data)
        const diff = this.data.diff(data)
        this.data = data
        dispatch(this.listeners, diff)
      }
    } else {
      this._root = root || new this.constructor(this.endpoint)
    }
    if (!this.isRoot) this.queue = this.root().queue
  }
  flush () {
    this.queue.flush()
    return this
  }
  get keyPath () {
    return this.path.split('/').slice(1)
  }
  getData () {
    const value = this.root().data.getIn(this.keyPath, null)
    return isMap(value) ? value.toJS() : value
  }
  parent () {
    return this.isRoot ? null : new this.constructor(formatUrl({
      endpoint: this.endpoint,
      path: resolve(this.path, '..')
    }), this.root())
  }
  ref () {
    return this
  }
  root () {
    return this.isRoot ? this : this._root
  }
  child (path) {
    assert(path && typeof path === 'string', '"path" must be a string')
    return new this.constructor(formatUrl({
      endpoint: this.endpoint,
      path: join(this.path, path)
    }), this.root())
  }
  key () {
    return last(this.path.split('/')) || null
  }
  toString () {
    return this.url
  }
  defer (callback) {
    this.queue.add(callback)
    return this
  }
  on (event, callback, cancel, context) {
    const path = this.path
    const listener = {event, callback, cancel, context, path}
    this.listeners.add(listener)
    if (calledOnRegister(event)) {
      this.defer(() => {
        if (!this.listeners.has(listener)) return
      })
    }
  }
}

function calledOnRegister (event) {
  return event === 'value' || event === 'child_added'
}
