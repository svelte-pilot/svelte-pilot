import { HashHistory } from 'spa-history'
import Base from './Base'

export default class extends Base {
  constructor(args) {
    super(args)

    this._history = new HashHistory({
      beforeChange: this._beforeChange.bind(this),
      afterChange: this._afterChange.bind(this)
    })
  }
}
