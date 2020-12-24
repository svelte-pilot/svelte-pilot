export default class History {
  constructor({ onPopState }) {
    if (!history.state?.__position__) {
      history.replaceState({ __position__: history.length }, '');
    }

    this._onPopState = () => {
      onPopState(location.href, history.state);
    };

    window.addEventListener('popstate', this._onPopState);
  }

  setState(state) {
    history.replaceState({ ...history.state, state }, '');
  }

  push(url, state) {
    history.pushState({ ...state, __position__: history.state.__position__ + 1 }, '', url);
  }

  replace(url, state) {
    history.replace({ ...state, __position__: history.state.__position__ }, '', url);
  }

  go(delta, state) {
    if (state) {
      window.removeEventListener('popstate', this._onPopState);
      window.addEventListener('popstate', onPopState);
    } else {
      history.go(delta);
    }

    function onPopState() {
      window.removeEventListener('popstate', onPopState);
      window.addEventListener('popstate', this._onPopState);
      this.setState(state);
      this._onPopState();
    }
  }

  back(state) {
    return this.go(-1, state);
  }

  forward(state) {
    return this.go(1, state);
  }
}
