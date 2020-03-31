import { PathHistory } from 'spa-history'
import Base from './Base'

export default class extends Base {
  constructor(args) {
    super(args)

    this._history = new PathHistory({
      base: args.base,
      beforeChange: this._beforeChange.bind(this),
      afterChange: this._afterChange.bind(this)
    })
  }
}
